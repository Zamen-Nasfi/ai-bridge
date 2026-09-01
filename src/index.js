const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    },
  });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "ai-bridge",
        version: "0.2.0",
        status: "online",
      });
    }

    if (request.method !== "POST" || url.pathname !== "/bridge") {
      return json({ error: "Not found" }, 404);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body || typeof body !== "object") {
      return json({ error: "Request body must be a JSON object" }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "Missing required field: message" }, 400);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
    }

    const model = body.model || "claude-sonnet-4-20250514";
    const system = typeof body.system === "string" ? body.system : undefined;

    const anthropicBody = {
      model,
      max_tokens: Number.isInteger(body.max_tokens) ? body.max_tokens : 2048,
      messages: [{ role: "user", content: message }],
    };

    if (system) anthropicBody.system = system;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await upstream.json().catch(() => ({ error: "Invalid upstream response" }));

    if (!upstream.ok) {
      return json(
        {
          error: "Claude API request failed",
          status: upstream.status,
          details: data,
        },
        upstream.status,
      );
    }

    const text = Array.isArray(data.content)
      ? data.content
          .filter((item) => item && item.type === "text")
          .map((item) => item.text)
          .join("\n")
      : "";

    return json({
      ok: true,
      provider: "anthropic",
      model: data.model || model,
      reply: text,
      usage: data.usage || null,
      raw: data,
    });
  },
};
