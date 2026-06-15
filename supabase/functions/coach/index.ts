// Supabase Edge Function: /coach
//
// Proxies a coach prompt to the Anthropic Messages API, hiding the API key
// from the client. Per PRD §10.2 / NFR-4.
//
// Request body (from client):
//   { prompt: string, system: string,
//     image_base64?: string,    // raw base64 (no data URL prefix); enables vision call
//     media_type?: string }     // defaults to "image/jpeg"
//
// Response body (to client):
//   { text: string }                 // on success
//   { error: string, status: number } // on failure
//
// Required secrets (set via `supabase secrets set` or the dashboard):
//   ANTHROPIC_API_KEY — your Anthropic key (sk-ant-...)
//   COACH_SHARED_SECRET — random string the client also knows
//
// Optional env:
//   COACH_MODEL — overrides the default model (e.g. claude-sonnet-4-6)
//   COACH_MAX_TOKENS — overrides max_tokens (default 1000)

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1000;

// CORS preflight — gravity-journal is a static PWA on a different origin
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-coach-secret, authorization",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // Light protection: shared-secret header. Stops casual abuse of the
  // function URL. Not real auth — multi-user auth comes in P2.
  const expected = Deno.env.get("COACH_SHARED_SECRET");
  if (expected) {
    const provided = req.headers.get("x-coach-secret");
    if (provided !== expected) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "server misconfigured: ANTHROPIC_API_KEY missing" }, 500);
  }

  let body: { prompt?: string; system?: string; image_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "invalid JSON body" }, 400);
  }

  const prompt = (body.prompt || "").trim();
  const system = (body.system || "").trim();
  const image_base64 = body.image_base64;
  const media_type = body.media_type || "image/jpeg";
  if (!prompt) return json({ error: "missing 'prompt'" }, 400);

  const model = Deno.env.get("COACH_MODEL") || DEFAULT_MODEL;
  const maxTokensEnv = Deno.env.get("COACH_MAX_TOKENS");
  const max_tokens = maxTokensEnv ? parseInt(maxTokensEnv, 10) : DEFAULT_MAX_TOKENS;

  // Build messages — vision call when image present, otherwise plain text
  const userContent = image_base64
    ? [
        { type: "image", source: { type: "base64", media_type, data: image_base64 } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return json({ error: "upstream error", status: upstream.status, detail: errText }, 502);
  }

  const data = await upstream.json();
  let text = "";
  if (data.content && Array.isArray(data.content)) {
    for (const part of data.content) {
      if (part.type === "text" && typeof part.text === "string") text += part.text;
    }
  }

  return json({ text: text || "No response received." });
});
