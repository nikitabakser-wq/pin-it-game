// Local stand-in for Supabase (the subset of the Auth + PostgREST HTTP APIs this app uses),
// backed by a real Postgres database with the real migrations and row level security.
// For local end-to-end testing only — production uses a real Supabase project.
//
//   DATABASE_URL=postgres://postgres@localhost:5432/lifedash JWT_SECRET=dev node scripts/local-stack/server.mjs
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.PORT ?? 54321);
const SECRET = process.env.JWT_SECRET ?? "local-dev-secret";
// Return `date` columns as "YYYY-MM-DD" strings, like PostgREST does.
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const refreshTokens = new Map(); // token -> user id

const b64 = (b) => Buffer.from(b).toString("base64url");
function signJwt(payload) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = (token ?? "").split(".");
  if (!s) return null;
  const expect = createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (expect.length !== s.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp && p.exp * 1000 < Date.now() ? null : p;
}
const hash = (pw, salt = randomBytes(16).toString("hex")) => `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
const checkPw = (pw, stored) => hash(pw, stored.split(":")[0]) === stored;

const userJson = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email, created_at: u.created_at,
  email_confirmed_at: u.created_at, app_metadata: { provider: "email" }, user_metadata: {}, identities: [],
});
function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, u.id);
  return {
    access_token: signJwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp }),
    token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userJson(u),
  };
}

// Body values: objects and arrays go to json/jsonb columns as JSON text (as PostgREST does).
const bodyValue = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s) => {
  if (!IDENT.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 });
  return `"${s}"`;
};

function whereClause(params, values) {
  const parts = [];
  for (const [k, v] of params) {
    if (["select", "order", "on_conflict", "columns", "limit", "offset"].includes(k)) continue;
    const m = /^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/s.exec(v);
    if (!m) throw Object.assign(new Error(`unsupported filter ${k}=${v}`), { status: 400 });
    const [, op, raw] = m;
    if (op === "in") {
      values.push(raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")));
      parts.push(`${ident(k)} = any($${values.length})`);
    } else if (op === "is") {
      parts.push(`${ident(k)} is ${raw === "null" ? "null" : raw === "true" ? "true" : "false"}`);
    } else {
      values.push(raw);
      const sym = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
      parts.push(`${ident(k)} ${sym} $${values.length}`);
    }
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}
function selectList(params) {
  const s = params.get("select") ?? "*";
  return s === "*" ? "*" : s.split(",").map((c) => ident(c.trim())).join(", ");
}
function orderClause(params) {
  const o = params.get("order");
  if (!o) return "";
  return ` order by ${o.split(",").map((p) => { const [c, dir] = p.split("."); return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}`; }).join(", ")}`;
}

async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${claims ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? {})]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d ? JSON.parse(d) : null)); });

async function handleAuth(req, res, path, url) {
  const body = req.method === "POST" ? await readBody(req) : null;
  if (path === "/auth/v1/signup") {
    const email = String(body?.email ?? "").toLowerCase();
    if (!email || String(body?.password ?? "").length < 6) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
    const exists = await pool.query("select 1 from auth.users where email = $1", [email]);
    if (exists.rowCount) return send(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const { rows } = await pool.query("insert into auth.users (id, email, encrypted_password) values ($1, $2, $3) returning *", [randomUUID(), email, hash(body.password)]);
    return send(res, 200, session(rows[0]));
  }
  if (path === "/auth/v1/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const { rows } = await pool.query("select * from auth.users where email = $1", [String(body?.email ?? "").toLowerCase()]);
      if (!rows[0] || !checkPw(String(body?.password ?? ""), rows[0].encrypted_password)) {
        return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return send(res, 200, session(rows[0]));
    }
    if (grant === "refresh_token") {
      const uid = refreshTokens.get(body?.refresh_token);
      if (!uid) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      const { rows } = await pool.query("select * from auth.users where id = $1", [uid]);
      return send(res, 200, session(rows[0]));
    }
  }
  const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  if (path === "/auth/v1/user") {
    if (!claims?.sub) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const { rows } = await pool.query("select * from auth.users where id = $1", [claims.sub]);
    return rows[0] ? send(res, 200, userJson(rows[0])) : send(res, 404, { code: 404, msg: "User not found" });
  }
  if (path === "/auth/v1/logout") return send(res, 204);
  return send(res, 404, { msg: `auth route not implemented: ${path}` });
}

async function handleRest(req, res, table, url) {
  ident(table);
  const params = url.searchParams;
  const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  const prefer = req.headers.prefer ?? "";
  const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const returning = prefer.includes("return=representation") ? ` returning ${selectList(params)}` : "";
  const values = [];
  let sql;
  if (req.method === "GET" || req.method === "HEAD") {
    sql = `select ${selectList(params)} from public.${ident(table)}${whereClause(params, values)}${orderClause(params)}`;
  } else if (req.method === "POST") {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const tuples = rows.map((r) => `(${cols.map((c) => (c in r ? (values.push(bodyValue(r[c])), `$${values.length}`) : "default")).join(", ")})`);
    sql = `insert into public.${ident(table)} (${cols.map(ident).join(", ")}) values ${tuples.join(", ")}`;
    const conflict = params.get("on_conflict");
    if (conflict && prefer.includes("resolution=merge-duplicates")) {
      const keys = conflict.split(",").map((c) => c.trim());
      const upd = cols.filter((c) => !keys.includes(c));
      sql += ` on conflict (${keys.map(ident).join(", ")}) do ${upd.length ? `update set ${upd.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}` : "nothing"}`;
    }
    sql += returning;
  } else if (req.method === "PATCH") {
    const body = await readBody(req);
    const sets = Object.keys(body).map((c) => (values.push(bodyValue(body[c])), `${ident(c)} = $${values.length}`));
    sql = `update public.${ident(table)} set ${sets.join(", ")}${whereClause(params, values)}${returning}`;
  } else if (req.method === "DELETE") {
    sql = `delete from public.${ident(table)}${whereClause(params, values)}${returning}`;
  } else {
    return send(res, 405, { message: "method not allowed" });
  }
  const result = await asUser(claims?.sub ? claims : null, (c) => c.query(sql, values));
  const rows = result.rows ?? [];
  if (wantsObject) {
    if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
    return send(res, 200, rows[0]);
  }
  if (req.method !== "GET" && !returning) return send(res, 204);
  return send(res, req.method === "POST" ? 201 : 200, rows, { "content-range": `0-${Math.max(0, rows.length - 1)}/*` });
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-expose-headers": "content-range",
};

http
  .createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith("/auth/v1/")) return await handleAuth(req, res, url.pathname, url);
      const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      if (m) return await handleRest(req, res, m[1], url);
      send(res, 404, { message: "not found" });
    } catch (e) {
      console.error(req.method, req.url, e.message);
      send(res, e.status ?? 400, { code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: null });
    }
  })
  .listen(PORT, () => console.log(`local supabase stand-in on http://localhost:${PORT}`));
