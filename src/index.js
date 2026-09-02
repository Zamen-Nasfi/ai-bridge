import { DurableObject } from "cloudflare:workers";

const BRIDGE_VERSION = "0.2.0";
const BRIDGE_OBJECT_NAME = "main";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders()
  });
}

function validateMessage(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, reason: "BODY_MUST_BE_OBJECT" };
  }

  if (typeof body.from !== "string" || body.from.length === 0 || body.from.length > 50) {
    return { valid: false, reason: "INVALID_FROM" };
  }

  if (typeof body.to !== "string" || body.to.length === 0 || body.to.length > 50) {
    return { valid: false, reason: "INVALID_TO" };
  }

  if (typeof body.type !== "string" || body.type.length === 0 || body.type.length > 100) {
    return { valid: false, reason: "INVALID_TYPE" };
  }

  if (typeof body.payload !== "string" || body.payload.length === 0 || body.payload.length > 10000) {
    return { valid: false, reason: "INVALID_PAYLOAD" };
  }

  return { valid: true, reason: null };
}

export class AIBridge extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        acknowledged_at INTEGER,
        acknowledged_by TEXT
      )
    `);

    this.ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_recipient_status
      ON messages(recipient, status, created_at)
    `);
  }

  async sendMessage(body) {
    const validation = validateMessage(body);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    this.ctx.storage.sql.exec(
      `
      INSERT INTO messages (
        id, sender, recipient, type, payload, status,
        created_at, acknowledged_at, acknowledged_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      id,
      body.from,
      body.to,
      body.type,
      body.payload,
      "PENDING",
      createdAt,
      null,
      null
    );

    return {
      success: true,
      message: {
        id,
        from: body.from,
        to: body.to,
        type: body.type,
        payload: body.payload,
        status: "PENDING",
        created_at: createdAt
      }
    };
  }

  async getMessages(url) {
    const recipient = url.searchParams.get("to");
    const status = url.searchParams.get("status") || "PENDING";
    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(limitRaw, 1), 100);

    let rows;

    if (recipient) {
      rows = this.ctx.storage.sql.exec(
        `
        SELECT id, sender, recipient, type, payload, status,
               created_at, acknowledged_at, acknowledged_by
        FROM messages
        WHERE recipient = ? AND status = ?
        ORDER BY created_at ASC
        LIMIT ?
        `,
        recipient,
        status,
        limit
      ).toArray();
    } else {
      rows = this.ctx.storage.sql.exec(
        `
        SELECT id, sender, recipient, type, payload, status,
               created_at, acknowledged_at, acknowledged_by
        FROM messages
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT ?
        `,
        status,
        limit
      ).toArray();
    }

    return { success: true, count: rows.length, messages: rows };
  }

  async acknowledge(body) {
    if (!body || typeof body !== "object") {
      return { success: false, error: "BODY_MUST_BE_OBJECT" };
    }

    if (typeof body.message_id !== "string" || body.message_id.length === 0) {
      return { success: false, error: "INVALID_MESSAGE_ID" };
    }

    if (typeof body.by !== "string" || body.by.length === 0) {
      return { success: false, error: "INVALID_ACKNOWLEDGER" };
    }

    const acknowledgedAt = Date.now();

    const result = this.ctx.storage.sql.exec(
      `
      UPDATE messages
      SET status = ?, acknowledged_at = ?, acknowledged_by = ?
      WHERE id = ? AND status = ?
      `,
      "ACKNOWLEDGED",
      acknowledgedAt,
      body.by,
      body.message_id,
      "PENDING"
    );

    if (result.rowsWritten === 0) {
      return {
        success: false,
        error: "MESSAGE_NOT_FOUND_OR_ALREADY_ACKNOWLEDGED"
      };
    }

    return {
      success: true,
      message_id: body.message_id,
      status: "ACKNOWLEDGED",
      acknowledged_by: body.by,
      acknowledged_at: acknowledgedAt
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "POST" && url.pathname === "/send") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: "INVALID_JSON" }, 400);
      }

      const result = await this.sendMessage(body);
      return json(result, result.success ? 200 : 400);
    }

    if (request.method === "GET" && url.pathname === "/messages") {
      return json(await this.getMessages(url));
    }

    if (request.method === "POST" && url.pathname === "/ack") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: "INVALID_JSON" }, 400);
      }

      const result = await this.acknowledge(body);
      return json(result, result.success ? 200 : 400);
    }

    return json({
      service: "AI Bridge Durable Object",
      version: BRIDGE_VERSION,
      status: "ONLINE"
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: "AI Bridge",
        version: BRIDGE_VERSION,
        status: "ONLINE",
        bridge: "READY",
        durable_object: "CONFIGURED",
        message: "AI Bridge v0.2 is operational."
      });
    }

    if (request.method === "POST" && url.pathname === "/send") {
      const id = env.BRIDGE.idFromName(BRIDGE_OBJECT_NAME);
      const stub = env.BRIDGE.get(id);
      return stub.fetch(new Request(new URL("/send", url), request));
    }

    if (request.method === "GET" && url.pathname === "/messages") {
      const id = env.BRIDGE.idFromName(BRIDGE_OBJECT_NAME);
      const stub = env.BRIDGE.get(id);
      return stub.fetch(new Request(url, request));
    }

    if (request.method === "POST" && url.pathname === "/ack") {
      const id = env.BRIDGE.idFromName(BRIDGE_OBJECT_NAME);
      const stub = env.BRIDGE.get(id);
      return stub.fetch(new Request(new URL("/ack", url), request));
    }

    return json({
      service: "AI Bridge",
      version: BRIDGE_VERSION,
      status: "ONLINE",
      endpoints: {
        health: "GET /health",
        send: "POST /send",
        messages: "GET /messages",
        acknowledge: "POST /ack"
      },
      architecture: "HTTP Worker -> SQLite Durable Object -> Message Bus",
      purpose: "Model-to-model communication transport",
      council: "NOT CONNECTED",
      providers: "NOT CONNECTED"
    });
  }
};
