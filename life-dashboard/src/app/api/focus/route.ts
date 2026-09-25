import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";

// Optional AI layer for "Today's Focus".
// Only active when ANTHROPIC_API_KEY is set; the dashboard always has the
// rule-based recommendations as a fallback, so the app works without it.

const Recommendation = z.object({
  title: z.string(),
  reason: z.string(),
  action: z.string(),
});
const Output = z.object({ recommendations: z.array(Recommendation) });

const SYSTEM = `You are a focused, honest personal coach inside a "Life Progress" dashboard.
You receive a JSON snapshot of the user's areas, progress, weekly goals, open goals and the
app's rule-based signals. Recommend what to focus on TODAY.

Rules:
- Give 1 to 3 recommendations, most important first.
- Base every recommendation on the data. Mention concrete numbers (percentages, days, counts).
- "action" must be a specific thing to do today, with a realistic time box (e.g. "25 minutes").
- Prefer overdue items, deadlines within a week, weekly goals behind pace, and clearly neglected areas.
- Be direct and brief. No motivational filler.`;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI is not configured (ANTHROPIC_API_KEY is not set)." }, { status: 501 });
  }
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let snapshot: unknown;
  try {
    snapshot = await request.json();
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
      messages: [{ role: "user", content: `Snapshot:\n${JSON.stringify(snapshot)}` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "The AI did not return recommendations." }, { status: 502 });
    }
    return NextResponse.json({ recommendations: response.parsed_output.recommendations.slice(0, 3) });
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
