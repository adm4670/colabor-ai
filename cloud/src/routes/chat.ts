/**
 * Chat Routes - Chat and streaming endpoints
 */
import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { AgentOrchestrator } from "../orchestrator/orchestrator";
import type { AuthPayload, CloudMessage, ChatResponse } from "../types";
import { logger } from "../utils/logger";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Active sessions
const sessions: Map<string, AgentOrchestrator> = new Map();

function getOrCreateSession(sessionId: string): AgentOrchestrator {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new AgentOrchestrator(sessionId));
    logger.info(`[Chat] Nova sessao: ${sessionId}`);
  }
  return sessions.get(sessionId)!;
}

// Auth middleware
function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * POST /chat/message
 * Send a message and get the full response (non-streaming)
 */
router.post("/message", authenticate, async (req: Request, res: Response) => {
  const { message, sessionId } = req.body;
  const user = (req as any).user as AuthPayload;

  if (!message) {
    return res.status(400).json({ error: "message required" });
  }

  const sid = sessionId || user.sessionId;
  const orchestrator = getOrCreateSession(sid);

  try {
    const generator = await orchestrator.run(message);
    const responses: ChatResponse[] = [];

    for await (const response of generator) {
      responses.push(response);
    }

    res.json({
      sessionId: sid,
      responses,
      finalResponse:
        responses.filter((r) => r.type === "text" || r.type === "end").pop()?.content || "",
    });
  } catch (err: any) {
    logger.error(`[Chat] Erro: ${err.message}`);
    res.status(500).json({ error: "Internal error", details: err.message });
  }
});

/**
 * GET /chat/stream/:sessionId
 * WebSocket upgrade info endpoint
 */
router.get("/stream/:sessionId", authenticate, (req: Request, res: Response) => {
  const { sessionId } = req.params;
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
router.get("/sessions", authenticate, (req: Request, res: Response) => {
  const user = (req as any).user as AuthPayload;
  const userSessions = Array.from(sessions.keys()).filter(
    (sid) => sid.includes(user.userId) || sid.includes(user.sessionId),
  );
  res.json({ sessions: userSessions, count: userSessions.length });
});

export { authenticate };
export default router;
