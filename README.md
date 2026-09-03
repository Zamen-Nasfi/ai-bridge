# AI Bridge

A lightweight Cloudflare Worker bridge with a SQLite-backed Durable Object message bus and a controlled, read-only Cloudflare API gateway.

## v0.3 architecture

```text
Client / future ChatGPT MCP
          |
          v
      AI Bridge
       /     \
      v       v
Message Bus   Cloudflare Read-Only Gateway
                 |
                 v
          Cloudflare API
```

The Cloudflare gateway is intentionally **read-only** in v0.3. No Cloudflare write endpoint is exposed.

## Endpoints

- `GET /` — service status and endpoint list.
- `GET /health` — health check.
- `POST /send` — enqueue a bridge message in the Durable Object.
- `GET /messages` — read bridge messages.
- `POST /ack` — acknowledge a bridge message.
- `GET /cloudflare/status` — verify the configured Cloudflare API token.
- `GET /cloudflare/workers` — list Workers in the configured Cloudflare account.

The two Cloudflare gateway endpoints require `Authorization: Bearer <BRIDGE_ACCESS_TOKEN>`.

## Cloudflare API configuration

Create a **read-only** Cloudflare API Token. Cloudflare supports scoped API tokens and recommends API tokens over the legacy global API key. For this phase, grant only the read permission needed to list Workers (Workers Scripts Read) and restrict the token to the required account/resource scope. citeturn1search0turn1search2

Do not put the Cloudflare token in source code or plaintext Worker variables. Cloudflare documents Worker Secrets as the appropriate mechanism for API keys and auth tokens. citeturn1search1

Set these Worker secrets:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put BRIDGE_ACCESS_TOKEN
```

`BRIDGE_ACCESS_TOKEN` protects the public read-only gateway. It is separate from the Cloudflare API token.

## Test sequence

1. `GET /health` — should report the bridge online and the gateway read-only.
2. `GET /cloudflare/status` with the Bridge bearer token — verifies that the Cloudflare API token is active.
3. `GET /cloudflare/workers` with the Bridge bearer token — proves account-scoped Workers read access.

Example:

```bash
curl https://YOUR-WORKER.example.workers.dev/cloudflare/status \
  -H "Authorization: Bearer $BRIDGE_ACCESS_TOKEN"

curl https://YOUR-WORKER.example.workers.dev/cloudflare/workers \
  -H "Authorization: Bearer $BRIDGE_ACCESS_TOKEN"
```

Expected status shape:

```json
{
  "success": true,
  "gateway": "CLOUDFLARE_READ_ONLY",
  "gateway_version": "0.3.0",
  "authenticated": true,
  "write_operations_enabled": false
}
```

An unauthenticated request to either Cloudflare gateway endpoint should return `401`. Missing configuration returns `503`. Cloudflare API failures do not expose the Cloudflare response body or token.

## Security boundary

- Cloudflare credentials remain Worker Secrets.
- The public gateway does not accept a Cloudflare API token from the request.
- Cloudflare gateway endpoints require a separate Bridge access token.
- v0.3 exposes only Cloudflare `GET` operations.
- No Cloudflare write operation is implemented.
- Cloudflare write permissions should not be granted until the read-only path has been verified.

## Durable Object

The message bus continues to use the `AIBridge` SQLite Durable Object binding defined in `wrangler.toml`. The existing binding is preserved; this release does not introduce a second Durable Object. 

## Deploy

```bash
npm install
npm run deploy
```
