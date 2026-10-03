# SpendSense — Landing Page + Live Demo Feature

This repo is the Task 3 / Task 4 deliverable for the GenAI-Across-Tasks assignment.

- `index.html` — one-page SpendSense landing site (Task 3), extended with a live
  "Where does my salary go?" demo widget (Task 4).
- `api/salary-plan.js` — Vercel serverless function. Holds the Gemini call and the
  Supabase read/write. The Gemini key never touches the browser or the repo.
- `supabase_schema.sql` — run once in the Supabase SQL editor to create the
  `salary_plans` table the function writes to.

## Deploy in ~10 minutes

1. **Push to GitHub** — already done, you're looking at it.

2. **Create a Supabase project** (supabase.com, free tier)
   - New project → open the SQL editor → paste and run `supabase_schema.sql`.
   - Settings → API → copy the **Project URL** and the **service_role key**
     (not the anon/public key — the function needs the service role key to
     write server-side, and RLS blocks every other key by design).

3. **Get a Gemini API key** (aistudio.google.com, free)
   - Create an API key. Keep it secret — do not paste it into any file in this repo.

4. **Import into Vercel**
   - vercel.com → Add New → Project → Import this GitHub repo.
   - Framework preset: "Other" (static site + `/api` functions — no build step needed).
   - Before the first deploy, add three **Environment Variables**
     (Project Settings → Environment Variables):
     | Name | Value |
     |---|---|
     | `GEMINI_API_KEY` | your Google AI Studio key |
     | `SUPABASE_URL` | your Supabase project URL |
     | `SUPABASE_SERVICE_KEY` | your Supabase service_role key |
   - Deploy.

5. **Verify**
   - Visit the live URL, scroll to "Try it: where does YOUR salary go?", move the
     sliders, click Generate. You should get a plan back within a few seconds and
     see the "plans generated" / "avg. identified saving" numbers update.
   - In the GitHub repo's code search, search for `AIza` — it should return **no
     results**, confirming the key never made it into the codebase.
   - In Supabase → Table Editor → `salary_plans`, confirm new rows are appearing.

## Local dev

```bash
npm i -g vercel
vercel dev
```
`vercel dev` reads the same environment variables from a `.env.local` file
(copy `GEMINI_API_KEY=...`, `SUPABASE_URL=...`, `SUPABASE_SERVICE_KEY=...` into
one locally — it's git-ignored and never committed).
