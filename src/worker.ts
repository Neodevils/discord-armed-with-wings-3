type Env = {
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
};

const DEFAULT_DISCORD_CLIENT_ID = "1520427674860912660";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response("ok", {
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      });
    }

    if (url.pathname === "/api/auth/discord/token" || url.pathname === "/auth/discord/token") {
      return exchangeDiscordCode(request, env);
    }

    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }
};

async function exchangeDiscordCode(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!env.DISCORD_CLIENT_SECRET) {
    return jsonResponse({ error: "discord_secret_not_configured" }, 500);
  }

  let body: { code?: unknown; redirect_uri?: unknown };
  try {
    body = (await request.json()) as { code?: unknown; redirect_uri?: unknown };
  } catch {
    return jsonResponse({ error: "bad_json" }, 400);
  }

  if (typeof body.code !== "string" || !body.code) {
    return jsonResponse({ error: "missing_code" }, 400);
  }

  const form = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID || DEFAULT_DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: body.code
  });

  if (typeof body.redirect_uri === "string" && body.redirect_uri) {
    form.set("redirect_uri", body.redirect_uri);
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  const tokenText = await tokenResponse.text();
  return new Response(tokenText, {
    status: tokenResponse.status,
    headers: {
      "content-type": tokenResponse.headers.get("content-type") || "application/json; charset=utf-8"
    }
  });
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
