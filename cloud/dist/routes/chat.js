"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
/**
 * Chat Routes - Chat and streaming endpoints
 */
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const orchestrator_1 = require("../orchestrator/orchestrator");
const logger_1 = require("../utils/logger");
const chatLog = (0, logger_1.createLogger)("CHAT");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
// Active sessions
const sessions = new Map();
function getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new orchestrator_1.AgentOrchestrator(sessionId));
        logger_1.logger.info(`[Chat] Nova sessao: ${sessionId}`);
    }
    return sessions.get(sessionId);
}
// Auth middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authorization header required" });
    }
    const token = authHeader.slice(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
/**
 * POST /chat/message
 * Send a message and get the full response (non-streaming)
 */
router.post("/message", authenticate, async (req, res) => {
    const { message, sessionId } = req.body;
    const user = req.user;
    if (!message) {
        return res.status(400).json({ error: "message required" });
    }
    const sid = sessionId || user.sessionId;
    const orchestrator = getOrCreateSession(sid);
    try {
        chatLog.info(`Message received from ${user.userId}`, { sessionId: sid, messageLen: message.length });
        const generator = await orchestrator.run(message);
        const responses = [];
        for await (const response of generator) {
            responses.push(response);
        }
        res.json({
            sessionId: sid,
            responses,
            finalResponse: responses.filter((r) => r.type === "text" || r.type === "end").pop()?.content || "",
        });
        chatLog.info("Response sent", { sessionId: sid, responsesCount: responses.length });
    }
    catch (err) {
        logger_1.logger.error(`[Chat] Erro: ${err.message}`);
        res.status(500).json({ error: "Internal error", details: err.message });
    }
});
/**
 * GET /chat/stream/:sessionId
 * WebSocket upgrade info endpoint
 */
router.get("/stream/:sessionId", authenticate, (req, res) => {
    const { sessionId } = req.params;
    chatLog.info("Stream info requested", { sessionId: req.params.sessionId });
    res.json({
        sessionId,
        wsEndpoint: `/ws?token=${req.headers.authorization?.slice(7)}&sessionId=${sessionId}`,
        status: "ready",
    });
});
/**
 * GET /chat/sessions
 * List active sessions for the user
 */
router.get("/sessions", authenticate, (req, res) => {
    const user = req.user;
    const userSessions = Array.from(sessions.keys()).filter((sid) => sid.includes(user.userId) || sid.includes(user.sessionId));
    chatLog.info(`Sessions listed for ${user.userId}`, { count: userSessions.length });
    res.json({ sessions: userSessions, count: userSessions.length });
});
exports.default = router;
//# sourceMappingURL=chat.js.map