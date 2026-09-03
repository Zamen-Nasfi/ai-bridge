const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const CLOUDFLARE_GATEWAY_VERSION = "0.3.0";

function cloudflareError(code, message, status = 502) {
  return { success: false, error: code, message, status };
}

function requireToken(env) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    return cloudflareError(
      "CLOUDFLARE_API_TOKEN_NOT_CONFIGURED",
      "Set the CLOUDFLARE_API_TOKEN Worker secret before using the Cloudflare gateway.",
      503
    );
  }
  return null;
}

function requireAccountId(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    return cloudflareError(
      "CLOUDFLARE_ACCOUNT_ID_NOT_CONFIGURED",
      "Set the CLOUDFLARE_ACCOUNT_ID Worker secret before using account-scoped endpoints.",
      503
    );
  }
  return null;
}

async function cloudflareGet(path, env) {
  const tokenError = requireToken(env);
  if (tokenError) return tokenError;

  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        Accept: "application/json"
      }
    });

    let data;
    try {
      data = await response.json();
    } catch {
      return cloudflareError(
        "CLOUDFLARE_INVALID_RESPONSE",
        "Cloudflare returned a non-JSON response.",
        502
      );
    }

    if (!response.ok || data.success === false) {
      return cloudflareError(
        "CLOUDFLARE_API_ERROR",
        "Cloudflare API request failed.",
        response.status
      );
    }

    return {
      success: true,
      result: data.result,
      result_info: data.result_info || null
    };
  } catch {
    return cloudflareError(
      "CLOUDFLARE_NETWORK_ERROR",
      "The AI Bridge could not reach the Cloudflare API.",
      502
    );
  }
}

export async function getCloudflareStatus(env) {
  const tokenError = requireToken(env);
  if (tokenError) return tokenError;

  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE}/user/tokens/verify`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        Accept: "application/json"
      }
    });

    let data;
    try {
      data = await response.json();
    } catch {
      return cloudflareError(
        "CLOUDFLARE_INVALID_RESPONSE",
        "Cloudflare returned a non-JSON response.",
        502
      );
    }

    if (!response.ok || data.success !== true) {
      return cloudflareError(
        "CLOUDFLARE_AUTHENTICATION_FAILED",
        "Cloudflare rejected the API token.",
        response.status
      );
    }

    return {
      success: true,
      gateway: "CLOUDFLARE_READ_ONLY",
      gateway_version: CLOUDFLARE_GATEWAY_VERSION,
      authenticated: true,
      token_status: data.result?.status || null,
      account_id_configured: Boolean(env.CLOUDFLARE_ACCOUNT_ID),
      write_operations_enabled: false
    };
  } catch {
    return cloudflareError(
      "CLOUDFLARE_NETWORK_ERROR",
      "The AI Bridge could not reach the Cloudflare API.",
      502
    );
  }
}

export async function listCloudflareWorkers(env, url) {
  const accountError = requireAccountId(env);
  if (accountError) return accountError;

  const page = Math.min(
    Math.max(Number(url.searchParams.get("page") || "1"), 1),
    1000000
  );
  const perPage = Math.min(
    Math.max(Number(url.searchParams.get("per_page") || "20"), 1),
    100
  );

  return cloudflareGet(
    `/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/workers/scripts?page=${page}&per_page=${perPage}`,
    env
  );
}
