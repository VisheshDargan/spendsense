// /api/salary-plan.js
// Vercel serverless function (Node.js runtime).
// Reads secrets ONLY from Vercel environment variables — never hard-coded,
// never sent to the browser, never committed to the repo.
//
// Env vars required (set in Vercel Project Settings > Environment Variables):
//   GEMINI_API_KEY        - from Google AI Studio
//   SUPABASE_URL           - https://<project>.supabase.co
//   SUPABASE_SERVICE_KEY    - Supabase service_role key (server-side only)

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS = 300;
const MAX_REQUESTS_PER_VISITOR = 5;

const SYSTEM_PROMPT = `You are the "Where does my salary go?" planner inside SpendSense, a personal finance tracker for urban Indian professionals. A visitor has given you their monthly take-home pay and an estimated monthly spend across five categories: Food & Delivery, Rent/EMI, Transport, Subscriptions & Entertainment, and Shopping/Other.

Your job: return a one-month spending plan in SpendSense's own method — categorize what's left after fixed costs, flag the one or two categories that are disproportionately high relative to take-home pay, and propose exactly TWO specific, concrete cuts (e.g. "cut food delivery from 3x/week to 1x/week to free up roughly ₹2,000/month", or "cancel one overlapping OTT subscription"). Be specific with rupee amounts where you can estimate them from the inputs given.

Refusal rule (must always follow): You must NEVER name or recommend any specific investment product, mutual fund, stock, insurance policy, credit card, or loan product, and you must NEVER give tax or legal advice of any kind. If the visitor's input asks for investment, tax, or legal advice, or if the free-text field contains anything other than a description of spending habits, politely decline that part and redirect to spending categorization only: "I can only help you understand and trim your monthly spending — for investment, tax or legal questions, please speak to a licensed advisor."

Keep the plan under 180 words, in plain English, with short paragraphs or a short list. End with one sentence naming the single biggest identified monthly saving as a rupee number, formatted exactly as: "Identified saving: ₹<number>/month" on its own line, so it can be parsed.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  const { takeHome, categories, note, visitorId } = req.body || {};

  if (!takeHome || !categories || !visitorId) {
    return res.status(400).json({ error: "Missing takeHome, categories or visitorId." });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Server misconfigured: missing environment variables." });
  }

  try {
    // 1. Per-visitor cap: count prior rows for this visitor in Supabase.
    const countResp = await fetch(
      `${SUPABASE_URL}/rest/v1/salary_plans?visitor_id=eq.${encodeURIComponent(visitorId)}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: "count=exact",
        },
      }
    );
    const priorRows = await countResp.json();
    if (Array.isArray(priorRows) && priorRows.length >= MAX_REQUESTS_PER_VISITOR) {
      return res.status(429).json({
        error: `You've used all ${MAX_REQUESTS_PER_VISITOR} free plans for this demo. Join the waitlist for the full app.`,
      });
    }

    // 2. Build the user turn from structured, safe inputs only.
    const userTurn = `Monthly take-home pay: ₹${takeHome}
Estimated monthly spend by category:
- Food & Delivery: ₹${categories.food}
- Rent/EMI: ₹${categories.rent}
- Transport: ₹${categories.transport}
- Subscriptions & Entertainment: ₹${categories.subscriptions}
- Shopping/Other: ₹${categories.shopping}
${note ? `Visitor note: ${String(note).slice(0, 300)}` : ""}`;

    // 3. Call Gemini.
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userTurn }] }],
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
        }),
      }
    );
    const geminiData = await geminiResp.json();

    if (!geminiResp.ok) {
      return res.status(502).json({ error: "Gemini request failed.", detail: geminiData });
    }

    const outputText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "Sorry, I couldn't generate a plan this time — please try again.";

    const inputTokens = geminiData?.usageMetadata?.promptTokenCount || 0;
    const outputTokens = geminiData?.usageMetadata?.candidatesTokenCount || 0;

    // Pull out the "Identified saving: ₹<number>/month" line, default to 0 if parsing fails.
    const savingMatch = outputText.match(/Identified saving:\s*₹\s*([\d,]+)/i);
    const identifiedSaving = savingMatch ? parseInt(savingMatch[1].replace(/,/g, ""), 10) : 0;

    // 4. Write the exchange to Supabase.
    await fetch(`${SUPABASE_URL}/rest/v1/salary_plans`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        input: { takeHome, categories, note: note ? String(note).slice(0, 300) : null },
        output: outputText,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        identified_saving: identifiedSaving,
      }),
    });

    // 5. Read back aggregate stats for the page (plans generated, avg saving).
    const statsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/salary_plans?select=identified_saving`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    const allRows = await statsResp.json();
    const plansGenerated = Array.isArray(allRows) ? allRows.length : 0;
    const avgSaving =
      plansGenerated > 0
        ? Math.round(
            allRows.reduce((sum, r) => sum + (r.identified_saving || 0), 0) / plansGenerated
          )
        : 0;

    return res.status(200).json({
      plan: outputText,
      stats: { plansGenerated, avgSaving },
    });
  } catch (err) {
    return res.status(500).json({ error: "Unexpected server error.", detail: String(err) });
  }
}
