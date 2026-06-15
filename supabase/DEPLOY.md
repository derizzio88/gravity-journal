# Deploying the `/coach` Edge Function

This deploys the AI-coach proxy so the Anthropic API key never lives in the client.

Project: `https://vvwwhykbqoedxdmtktiq.supabase.co`
Function: `supabase/functions/coach/index.ts`

## Prerequisites

- [ ] Supabase project created (you've done this)
- [ ] Anthropic API key in hand (stored in Keeper under `Anthropic-Gravity-Journal`)
- [ ] (Optional) `supabase` CLI installed: `brew install supabase/tap/supabase`

## Option A — Deploy via Supabase Dashboard (easier, no CLI)

> ⚠️ **Don't confuse the two "Functions" sections.** Supabase has both:
> - **Database → Functions** = Postgres SQL functions (NOT what you want — paste TS code here and it errors with `syntax error at or near "//"`)
> - **Edge Functions** (in the left sidebar, separate from Database) = Deno/TypeScript serverless. This is what we want.

1. Open https://supabase.com/dashboard/project/vvwwhykbqoedxdmtktiq/functions
   (This URL routes to **Edge Functions**, not Database Functions.)
2. Click **"Create a new function"** (or "Deploy a new function")
3. Name: `coach`
4. Paste the contents of `supabase/functions/coach/index.ts` into the editor
5. **Under "Verify JWT"** toggle it OFF. Public function — we use a shared-secret header instead.
6. Click **Deploy function**

Then set the secrets at https://supabase.com/dashboard/project/vvwwhykbqoedxdmtktiq/settings/functions:

- `ANTHROPIC_API_KEY` = your key from Keeper (`sk-ant-...`)
- `COACH_SHARED_SECRET` = generate a random string (e.g. `openssl rand -hex 32` in a terminal — paste the result)
- (optional) `COACH_MODEL` = `claude-sonnet-4-6` (default if unset)
- (optional) `COACH_MAX_TOKENS` = `1000` (default if unset)

## Option B — Deploy via CLI

```bash
# from the gravity-journal repo root
supabase login
supabase link --project-ref vvwwhykbqoedxdmtktiq
supabase functions deploy coach --no-verify-jwt

# set secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase secrets set COACH_SHARED_SECRET="$(openssl rand -hex 32)"

# verify
supabase functions list
```

## Wire up the client

In the deployed app (or your local copy):

1. Go to **SETUP · SETTINGS**
2. Scroll to **AI Coach Proxy**
3. **Edge Function URL** should already say `https://vvwwhykbqoedxdmtktiq.supabase.co/functions/v1/coach` (default)
4. **Shared Secret** — paste the same string you set as `COACH_SHARED_SECRET` above
5. Tab out — values persist to localStorage

## Test it

Open **COACH** tab, generate a workout suggestion, confirm a response comes back. Then check the function logs:

```bash
supabase functions logs coach --tail
```

You should see one POST per coach call. If you see a 401 → secret mismatch. If 500 + `ANTHROPIC_API_KEY missing` → re-set the secret.

## Rotating the Anthropic key

If the Anthropic key is ever compromised:

```bash
# Anthropic dashboard: revoke old key, generate new one
supabase secrets set ANTHROPIC_API_KEY=sk-ant-new-key
# No client redeploy needed — key lives only in the Edge Function.
```

Likewise rotating `COACH_SHARED_SECRET`: set the new value in Supabase, then paste the new value into SETUP · SETTINGS → AI Coach Proxy → Shared Secret in the client.

## What this gives you (and what it doesn't)

✓ Anthropic API key is **never** in the client bundle, source tree, or browser localStorage.
✓ Shared-secret header stops casual abuse of the function URL.

✗ Anyone reading the public client source can extract the function URL + (eventually) the shared secret if they sniff the request headers. For real abuse protection, you need per-user auth — that's the P2 multi-user work in the PRD.
