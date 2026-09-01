# AI Bridge

A lightweight Cloudflare Worker bridge between a client such as GPT and Claude through the Anthropic Messages API.

## Endpoints

- `GET /` — health/status check.
- `POST /bridge` — sends a message to Claude and returns the response.

### Example request

```json
{
  "message": "Hello Claude"
}
```

Optional fields:

- `model`
- `system`
- `max_tokens`

## Configuration

Set the Cloudflare Worker secret:

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Do not commit API keys or other secrets to the repository.

## Deploy

```bash
npm install
npm run deploy
```
