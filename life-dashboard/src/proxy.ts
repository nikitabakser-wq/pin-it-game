import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allowedEmails, SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/auth"];

// Refreshes the Supabase session cookie and keeps the dashboard private.
export async function proxy(request: NextRequest) {
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!supabaseConfigured) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allow = allowedEmails();
  const permitted = !!user && (!allow.length || allow.includes((user.email ?? "").toLowerCase()));

  if (!permitted && !isPublic) {
    const url = new URL("/login", request.url);
    if (user) url.searchParams.set("error", "not-allowed");
    return NextResponse.redirect(url);
  }
  if (permitted && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/).*)"],
};
