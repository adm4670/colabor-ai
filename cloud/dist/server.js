"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingToolCalls = exports.wsConnections = exports.wss = exports.server = exports.app = void 0;
/**
 * colabor-ai Cloud Server v2
 *
 * Express + WebSocket server with tool call protocol.
 * Orchestrator dispatches local tools to connected clients via WebSocket.
 */
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const auth_1 = __importDefault(require("./routes/auth"));
const chat_1 = __importDefault(require("./routes/chat"));
const orchestrator_1 = require("./orchestrator/orchestrator");
const logger_1 = require("./utils/logger");
// ============================================================
// Config
// ============================================================
const PORT = parseInt(process.env.PORT || "3001", 10);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS || "60000", 10);
// ============================================================
// Express App
// ============================================================
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" });
});
app.use("/auth", auth_1.default);
app.use("/chat", chat_1.default);
// ============================================================
// HTTP + WebSocket Server
// ============================================================
const server = http_1.default.createServer(app);
exports.server = server;
const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
exports.wss = wss;
// Active WebSocket connections: sessionId -> Set<WebSocket>
const wsConnections = new Map();
exports.wsConnections = wsConnections;
// Pending tool calls awaiting client response: id -> PendingToolCall
const pendingToolCalls = new Map();
exports.pendingToolCalls = pendingToolCalls;
// Session -> current orchestrator instance
const sessionOrchestrators = new Map();
/**
 * Send a message to all WebSocket connections for a session.
 */
function sendToSession(sessionId, message) {
    const conns = wsConnections.get(sessionId);
    if (!conns || conns.size === 0)
        return;
    const data = JSON.stringify(message);
    for (const ws of conns) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(data);
        }
    }
}
/**
 * Dispatch a tool call to the client and wait for the result.
 * Creates a Promise that resolves when tool_result comes back.
 */
function dispatchToolCall(ws, sessionId, toolCall) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingToolCalls.delete(toolCall.id);
            reject(new Error(`Tool call timeout: ${toolCall.tool} (${TOOL_TIMEOUT_MS}ms)`));
        }, TOOL_TIMEOUT_MS);
        const pending = {
            id: toolCall.id,
            resolve,
            reject,
            timeout,
            message: toolCall,
        };
        pendingToolCalls.set(toolCall.id, pending);
        // Send tool_call to client
        const msg = { type: "tool_call", payload: toolCall };
        ws.send(JSON.stringify(msg));
        logger_1.logger.info(`[Tool] Dispatched: ${toolCall.agent}/${toolCall.tool} id=${toolCall.id} timeout=${TOOL_TIMEOUT_MS}ms`);
    });
}
/**
 * Handle a tool_result from the client.
 */
function handleToolResult(msg, ws) {
    const result = msg.payload;
    if (!result || !result.id) {
        logger_1.logger.warn("[Tool] Received tool_result without id");
        return;
    }
    const pending = pendingToolCalls.get(result.id);
    if (!pending) {
        logger_1.logger.warn(`[Tool] No pending call for id=${result.id} (maybe already timed out)`);
        return;
    }
    clearTimeout(pending.timeout);
    pendingToolCalls.delete(result.id);
    pending.resolve(result);
    logger_1.logger.info(`[Tool] Result: id=${result.id} status=${result.status} resultLen=${(result.result || "").length}`);
}
wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const sessionId = url.searchParams.get("sessionId") || `ws_${(0, uuid_1.v4)()}`;
    // Authenticate
    let user = null;
    if (token) {
        try {
            user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid token" } }));
            ws.close(4001, "Unauthorized");
            return;
        }
    }
    logger_1.logger.info(`[WS] Connected: session=${sessionId} user=${user?.userId || "anonymous"}`);
    // Track connection
    if (!wsConnections.has(sessionId)) {
        wsConnections.set(sessionId, new Set());
    }
    wsConnections.get(sessionId).add(ws);
    // Create orchestrator for this session (with local tool callback)
    const orchestrator = new orchestrator_1.AgentOrchestrator(sessionId);
    sessionOrchestrators.set(sessionId, orchestrator);
    // Set up local tool dispatch callback
    orchestrator.setLocalToolCallback(async (toolCall) => {
        return dispatchToolCall(ws, sessionId, toolCall);
    });
    // Handle messages from client
    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data.toString());
            switch (msg.type) {
                case "ping":
                    ws.send(JSON.stringify({ type: "pong", payload: { timestamp: Date.now() } }));
                    break;
                case "tool_result": {
                    handleToolResult(msg, ws);
                    break;
                }
                case "chat": {
                    const { message } = msg.payload;
                    if (!message) {
                        ws.send(JSON.stringify({ type: "error", payload: { message: "message required" } }));
                        return;
                    }
                    ws.send(JSON.stringify({
                        type: "progress",
                        payload: { content: "Processando...", sessionId },
                    }));
                    try {
                        const generator = await orchestrator.run(message);
                        for await (const response of generator) {
                            const streamMsg = {
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
                    }
                    catch (err) {
                        ws.send(JSON.stringify({
                            type: "error",
                            payload: { message: err.message, sessionId },
                        }));
                    }
                    break;
                }
                default:
                    ws.send(JSON.stringify({
                        type: "error",
                        payload: { message: `Unknown type: ${msg.type}` },
                    }));
            }
        }
        catch (err) {
            logger_1.logger.error(`[WS] Parse error: ${err.message}`);
            ws.send(JSON.stringify({ type: "error", payload: { message: err.message } }));
        }
    });
    // Handle disconnect
    ws.on("close", () => {
        logger_1.logger.info(`[WS] Disconnected: session=${sessionId}`);
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
    ws.send(JSON.stringify({
        type: "connected",
        payload: { sessionId, message: "Connected to colabor-ai cloud v2", userId: user?.userId },
    }));
});
// ============================================================
// Start
// ============================================================
server.listen(PORT, () => {
    logger_1.logger.info(`========================================`);
    logger_1.logger.info(`  colabor-ai Cloud Server v2`);
    logger_1.logger.info(`  HTTP:  http://localhost:${PORT}`);
    logger_1.logger.info(`  WS:    ws://localhost:${PORT}/ws`);
    logger_1.logger.info(`  Tool timeout: ${TOOL_TIMEOUT_MS}ms`);
    logger_1.logger.info(`========================================`);
});
process.on("SIGTERM", () => {
    logger_1.logger.info("SIGTERM received. Closing...");
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
    logger_1.logger.info("SIGINT received. Closing...");
    wss.close();
    server.close();
    process.exit(0);
});
//# sourceMappingURL=server.js.map