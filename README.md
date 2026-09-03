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

## Cloudflare API configuration

Create a **read-only** Cloudflare API Token. Do not put the token in source code.

Set the token and account ID as Worker secrets:

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

The gateway uses the token as a Bearer token and only performs HTTP `GET` requests in v0.3.

## Test sequence

After deployment:

```text
GET /health
GET /cloudflare/status
GET /cloudflare/workers
```

Expected `/cloudflare/status` shape:

```json
{
  "success": true,
  "gateway": "CLOUDFLARE_READ_ONLY",
  "gateway_version": "0.3.0",
  "authenticated": true,
  "write_operations_enabled": false
}
```

A failed authentication test should not expose the token or Cloudflare response body.

## Security boundary

- Cloudflare credentials remain Worker Secrets.
- The public gateway does not accept a Cloudflare token from the request.
- v0.3 exposes only read operations.
- Cloudflare write operations are deliberately disabled until the read-only path is verified.

## Durable Object

The message bus continues to use the `AIBridge` SQLite Durable Object binding defined in `wrangler.toml`.

## Deploy

```bash
npm install
npm run deploy
```
