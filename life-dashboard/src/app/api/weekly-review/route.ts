import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";

// Optional AI analysis for the Weekly Review. Active only when ANTHROPIC_API_KEY is set;
// otherwise the client keeps the built-in rule-based analysis (lib/weekly.ts).

const Output = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
});

const SYSTEM = `Ти — чесний особистий коуч у застосунку "Life Progress".
Ти отримуєш JSON з фактами про тиждень користувача: оцінки днів (0–100), нотатки, виконані активності
за областями, задачі, тижневі цілі, оцінку попереднього тижня та вже виявлені патерни.

Напиши українською:
- "summary": 2–4 короткі речення. Що вийшло добре, де була просадка, який патерн видно,
  і порівняння з попереднім тижнем, якщо воно є.
- "recommendations": 1–3 конкретні дії на наступний тиждень (з цифрами: скільки днів, хвилин, яких задач).

Правила:
- Використовуй ТІЛЬКИ факти з JSON. Не вигадуй активностей, причин, емоцій чи подій, яких там немає.
- Нотатки користувача можна враховувати як його власні слова, але не домальовуй до них деталей.
- Назви областей пиши так, як вони є в даних.
- Тон: людський, мотивуючий, короткий. Без токсичної позитивності і без банальностей на кшталт "ти можеш усе".
- Якщо тиждень слабкий — скажи це прямо, але без приниження.
- Не використовуй дієслів минулого часу з родовим закінченням щодо користувача (пиши "вдалося", "було", а не "ти зробив/зробила").`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Not an error: the review is prepared automatically and simply keeps the rule-based analysis.
    return NextResponse.json({ unavailable: "AI is not configured (ANTHROPIC_API_KEY is not set)." });
  }
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let week: unknown;
  try {
    week = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Дані тижня:\n${JSON.stringify(week)}` }],
    });
    const out = response.parsed_output;
    if (response.stop_reason === "refusal" || !out || !out.summary.trim() || !out.recommendations.length) {
      return NextResponse.json({ error: "The AI did not return an analysis." }, { status: 502 });
    }
    return NextResponse.json({ summary: out.summary.trim(), recommendations: out.recommendations.slice(0, 3) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "AI rate limit reached — try again in a minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key is invalid." }, { status: 502 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI request failed (${e.status ?? "network"}).` }, { status: 502 });
    }
    throw e;
  }
}
