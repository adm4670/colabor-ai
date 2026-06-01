/**
 * colabor-ai Cloud Server v2
 *
 * Express + WebSocket server with tool call protocol.
 * Orchestrator dispatches local tools to connected clients via WebSocket.
 */
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

import authRoutes from "./routes/auth";
import chatRoutes, { authenticate } from "./routes/chat";
import { AgentOrchestrator } from "./orchestrator/orchestrator";
import { logger, createLogger } from "./utils/logger";
import type { AuthPayload } from "./types";
import type {
  ToolCallMessage,
  ToolResultMessage,
  PendingToolCall,
  WSServerMessage,
  WSClientMessage,
} from "./protocol/tool-protocol";

// ============================================================
// Config
// ============================================================
const PORT = parseInt(process.env.PORT || "3001", 10);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS || "60000", 10);

// ============================================================
// Express App
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
    const requestLog = createLogger("HTTP");
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const start = Date.now();
      requestLog.info(`${req.method} ${req.path}`, {
        query: Object.keys(req.query).length > 0 ? req.query : undefined
      });
      
      // Log response on finish
      res.on("finish", () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? "warn" : "debug";
        requestLog[level](`${req.method} ${req.path} -> ${res.statusCode}`, { duration: `${duration}ms` });
      });
      
      next();
    });
    
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" });
});

app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);

// ============================================================
// HTTP + WebSocket Server
// ============================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Active WebSocket connections: sessionId -> Set<WebSocket>
const wsConnections: Map<string, Set<WebSocket>> = new Map();

// Pending tool calls awaiting client response: id -> PendingToolCall
const pendingToolCalls: Map<string, PendingToolCall> = new Map();

// Session -> current orchestrator instance
const sessionOrchestrators: Map<string, AgentOrchestrator> = new Map();

/**
 * Send a message to all WebSocket connections for a session.
 */
function sendToSession(sessionId: string, message: WSServerMessage): void {
  const conns = wsConnections.get(sessionId);
  if (!conns || conns.size === 0) return;
  const data = JSON.stringify(message);
  for (const ws of conns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * Dispatch a tool call to the client and wait for the result.
 * Creates a Promise that resolves when tool_result comes back.
 */
function dispatchToolCall(
  ws: WebSocket,
  sessionId: string,
  toolCall: ToolCallMessage,
): Promise<ToolResultMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingToolCalls.delete(toolCall.id);
      reject(new Error(`Tool call timeout: ${toolCall.tool} (${TOOL_TIMEOUT_MS}ms)`));
    }, TOOL_TIMEOUT_MS);

    const pending: PendingToolCall = {
      id: toolCall.id,
      resolve,
      reject,
      timeout,
      message: toolCall,
    };

    pendingToolCalls.set(toolCall.id, pending);

    // Send tool_call to client
    const msg: WSServerMessage = { type: "tool_call", payload: toolCall };
    ws.send(JSON.stringify(msg));

    logger.info(
      `[Tool] Dispatched: ${toolCall.agent}/${toolCall.tool} id=${toolCall.id} timeout=${TOOL_TIMEOUT_MS}ms`,
    );
  });
}

/**
 * Handle a tool_result from the client.
 */
function handleToolResult(msg: WSClientMessage, ws: WebSocket): void {
  const result = (msg as { type: "tool_result"; payload: ToolResultMessage }).payload;
  if (!result || !result.id) {
    logger.warn("[Tool] Received tool_result without id");
    return;
  }

  const pending = pendingToolCalls.get(result.id);
  if (!pending) {
    wsLog.warn(`No pending call for id=${result.id} (maybe already timed out)`);
    return;
  }

  clearTimeout(pending.timeout);
  pendingToolCalls.delete(result.id);
  pending.resolve(result);

  logger.info(
    `[Tool] Result: id=${result.id} status=${result.status} resultLen=${(result.result || "").length}`,
  );
}


const wsLog = createLogger("WS");
wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId") || `ws_${uuidv4()}`;

  // Authenticate
  let user: AuthPayload | null = null;
  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid token" } }));
      ws.close(4001, "Unauthorized");
      return;
    }
  }

  wsLog.info(`Connected: session=${sessionId}`, { user: user?.userId || "anonymous" });

  // Track connection
  if (!wsConnections.has(sessionId)) {
    wsConnections.set(sessionId, new Set());
  }
  wsConnections.get(sessionId)!.add(ws);

  // Create orchestrator for this session (with local tool callback)
  const orchestrator = new AgentOrchestrator(sessionId);
  sessionOrchestrators.set(sessionId, orchestrator);

  // Set up local tool dispatch callback
  orchestrator.setLocalToolCallback(async (toolCall: ToolCallMessage) => {
    return dispatchToolCall(ws, sessionId, toolCall);
  });

  // Handle messages from client
  ws.on("message", async (data: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
          break;

        case "tool_result": {
          handleToolResult(msg, ws);
          break;
        }

        case "chat": {
          const { message } = msg.payload as { message: string };
          if (!message) {
            ws.send(JSON.stringify({ type: "error", payload: { message: "message required" } }));
            return;
          }

          ws.send(
            JSON.stringify({
              type: "progress",
              payload: { content: "Processando...", sessionId },
            }),
          );

          try {
            const generator = await orchestrator.run(message);

            for await (const response of generator) {
              const streamMsg: WSServerMessage = {
                type: "stream",
                payload: {
                  chunkType: response.type,
                  content: response.content,
                  agent: response.agent,
                  sessionId: response.sessionId,
                },
              };
              ws.send(JSON.stringify(streamMsg));
            }
          } catch (err: any) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: err.message, sessionId },
              }),
            );
          }
          break;
        }

        default:
          ws.send(
            JSON.stringify({
              type: "error",
              payload: { message: `Unknown type: ${(msg as any).type}` },
            }),
          );
      }
    } catch (err: any) {
      wsLog.error(`Parse error: ${err.message}`);
      ws.send(JSON.stringify({ type: "error", payload: { message: err.message } }));
    }
  });

  // Handle disconnect
  ws.on("close", () => {
    wsLog.info(`Disconnected: session=${sessionId}`);

    // Reject all pending tool calls for this session
    for (const [id, pending] of pendingToolCalls) {
      if (pending.message.sessionId === sessionId) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Client disconnected"));
        pendingToolCalls.delete(id);
      }
    }

    const conns = wsConnections.get(sessionId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) {
        wsConnections.delete(sessionId);
        sessionOrchestrators.delete(sessionId);
      }
    }
  });

  // Welcome
  ws.send(
    JSON.stringify({
      type: "connected",
      payload: { sessionId, message: "Connected to colabor-ai cloud v2", userId: user?.userId },
    }),
  );
});

// ============================================================
// Start
// ============================================================
server.listen(PORT, () => {
  logger.info("========================================");
  logger.info("  colabor-ai Cloud Server v2");
  logger.info(`  HTTP:  http://localhost:${PORT}`);
  logger.info(`  WS:    ws://localhost:${PORT}/ws`);
  logger.info(`  Tool timeout: ${TOOL_TIMEOUT_MS}ms`);
  logger.info("========================================");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Closing...");
  // Reject all pending
  for (const [, pending] of pendingToolCalls) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Server shutting down"));
  }
  pendingToolCalls.clear();
  wss.close();
  server.close();
});

process.on("SIGINT", () => {
  logger.info("SIGINT received. Closing...");
  wss.close();
  server.close();
  process.exit(0);
});

export { app, server, wss, wsConnections, pendingToolCalls };
