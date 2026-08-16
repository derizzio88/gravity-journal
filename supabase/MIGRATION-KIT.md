# Supabase Migration Kit — resurrect the `/coach` backend

**Why you're reading this:** the old project `vvwwhykbqoedxdmtktiq.supabase.co` is **gone** — it
returns `NXDOMAIN` (DNS no longer resolves). Supabase free-tier projects pause after ~7 days idle
and are **deleted** after ~90 days paused. That's why every AI feature (Generate WOD, Snap-a-Meal
vision, coach chat, OG2 knowledge) fails. The rest of the app is fine — it's localStorage-first, so
your training/meal data is untouched in the browser.

This kit rebuilds the backend from scratch in ~5–10 min. The edge-function code
(`supabase/functions/coach/index.ts`) is unchanged and still correct — only the **project** is new.

---

## Step 1 — Create a new Supabase project

1. https://supabase.com/dashboard → **New project**
2. Name it e.g. `gravity-journal` · pick a region near you · set a DB password (you won't need it for coach)
3. Wait for provisioning (~2 min)
4. Copy the new **project ref** — the subdomain in the project URL, e.g. `abcd1234efgh5678`
   → new base URL is `https://<PROJECT_REF>.supabase.co`

## Step 2 — Deploy the `coach` edge function

**Option A — Dashboard (no CLI):**
1. Project → **Edge Functions** (sidebar — NOT Database → Functions; that's Postgres SQL and will error on TS)
2. **Create a new function** → name `coach`
3. Paste the full contents of `supabase/functions/coach/index.ts`
4. **Verify JWT → OFF** (public function; we gate with a shared-secret header instead)
5. **Deploy**

**Option B — CLI:**
```bash
# from the gravity-journal repo root
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy coach --no-verify-jwt
```

## Step 3 — Set the function secrets

Dashboard: Project → **Edge Functions → Manage secrets** (or Settings → Edge Functions):
- `ANTHROPIC_API_KEY` = your key (`sk-ant-...`) — in Keeper under `Anthropic-Gravity-Journal`
- `COACH_SHARED_SECRET` = a random string — `openssl rand -hex 32`
- *(optional)* `COACH_MODEL` = `claude-sonnet-4-6` (default if unset)
- *(optional)* `COACH_MAX_TOKENS` = `1000`

CLI equivalent:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase secrets set COACH_SHARED_SECRET="$(openssl rand -hex 32)"   # copy the value it echoes
```

## Step 4 — Point the client at the new project

The dead URL is **hardcoded as the default** in `index.html`, so update it in the code (this fixes
every device / a fresh browser, not just yours):

- File: `index.html` · find `COACH_PROXY_URL_DEFAULT` (~line 723)
- Change:
  ```js
  var COACH_PROXY_URL_DEFAULT = "https://vvwwhykbqoedxdmtktiq.supabase.co/functions/v1/coach";
  ```
  to your new ref:
  ```js
  var COACH_PROXY_URL_DEFAULT = "https://<PROJECT_REF>.supabase.co/functions/v1/coach";
  ```
- Commit + push (GitHub Pages redeploys `main` automatically).

> Claude can make this one-line edit for you once you paste the new `<PROJECT_REF>` — just say the word.

## Step 5 — Enter the shared secret in the app

Per-device, held only in localStorage (never in git):
1. Open the app → **SETUP · SETTINGS** → **AI Coach Proxy**
2. **Edge Function URL** should already show the new default from Step 4
3. **Shared Secret** → paste the same string you set as `COACH_SHARED_SECRET`
4. Tab out (persists to localStorage)

## Step 6 — Verify

1. **COACH** tab → **Generate Today's WOD** → a response should come back
2. Logs: `supabase functions logs coach --tail` → one POST per call
   - `401` → shared-secret mismatch (Step 3 vs Step 5)
   - `500 ANTHROPIC_API_KEY missing` → re-set the secret (Step 3)
   - `502 upstream error` → Anthropic-side (bad/expired key, rate limit)

---

## Stop it from dying again

Free projects pause after **7 days** of no API/DB activity, then delete at ~90 days. Options, cheapest first:
1. **Keep-alive ping** — a tiny scheduled GET to the function (or any REST endpoint) every few days keeps
   it "active." A GitHub Action cron or an n8n schedule both work. (Ask Claude to wire one up.)
2. **Just re-run this kit** when it lapses — the code is in git; re-provisioning is cheap. Accept the coach
   goes dark between sprints of use.
3. **Supabase Pro ($25/mo)** — no auto-pause. Overkill for a personal journal unless the coach is daily-critical.

## Security notes (carried from DEPLOY.md — still true)
- ✓ Anthropic key lives **only** in the edge-function secret — never in the client bundle, source, or localStorage.
- ✓ Shared-secret header stops casual URL abuse.
- ✗ Anyone reading the public client source can find the function URL and, if they sniff request headers,
  the shared secret. Real abuse protection needs per-user auth (the P2 multi-user work in the PRD).
- Rotating the Anthropic key later: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-new-key` — no client redeploy.
