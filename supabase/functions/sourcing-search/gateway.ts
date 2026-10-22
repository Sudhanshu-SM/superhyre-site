// Thin client for the claude-code-gateway. Ported from sourcing/lib/gateway.js;
// only the secret source changed (Deno.env instead of process.env + .env file).
// OpenAI-shaped, but auth is X-API-Key rather than a bearer token.

export class GatewayError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`AI gateway ${status}: ${body}`);
    this.name = "GatewayError";
    this.status = status;
    this.body = body;
  }
}

// Note: this gateway's `response_format: json_schema` is unusable — it forwards
// the schema to the Claude CLI's --json-schema (ajv strict mode, so the OpenAI
// {name, schema} wrapper 500s) and structured mode then dies on
// "Reached maximum number of turns (1)". Ask for JSON in the prompt and run the
// answer through parseJsonBlock instead; verified working in the local tool.
export async function chat({ system, user, model = "claude-sonnet", timeoutMs = 120_000 }: {
  system?: string; user: string; model?: string; timeoutMs?: number;
}): Promise<string> {
  const base = (Deno.env.get("AI_GATEWAY_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!base || !key) throw new Error("AI_GATEWAY_URL and AI_GATEWAY_API_KEY must be set as function secrets.");

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  if (!res.ok) throw new GatewayError(res.status, text.slice(0, 800));

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new GatewayError(res.status, `unparseable gateway response: ${text.slice(0, 300)}`);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

// The gateway honours response_format, but a model can still wrap JSON in a
// fenced block or bracket it with prose. Pull the first balanced object out.
export function parseJsonBlock(raw: unknown): unknown {
  const text = String(raw).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch { /* fall through to brace scan */ }

  const start = candidate.indexOf("{");
  if (start === -1) throw new Error(`no JSON object in model output: ${text.slice(0, 300)}`);

  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON object in model output: ${text.slice(0, 300)}`);
}
