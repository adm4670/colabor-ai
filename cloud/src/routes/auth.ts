/**
 * Auth Routes - JWT authentication endpoints
 */
import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import type { AuthPayload } from "../types";
import { createLogger } from "../utils/logger";

const authLog = createLogger("AUTH");

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

// Simple user store (in production, use a database)
const users: Map<string, { id: string; name: string; apiKey: string }> = new Map();

/**
 * POST /auth/login
 * Login simples com API key ou credenciais
 */
router.post("/login", (req: Request, res: Response) => {
  const { apiKey, username } = req.body;

  if (!apiKey && !username) {
    return res.status(400).json({ error: "apiKey or username required" });
  }

  // Simple auth: accept any valid-looking API key or create anonymous session
  const userId = username || `user_${uuidv4().slice(0, 8)}`;

  if (apiKey) {
    // Validate API key format
    if (typeof apiKey !== "string" || apiKey.length < 10) {
      return res.status(401).json({ error: "Invalid API key format" });
    }
    users.set(userId, { id: userId, name: username || "User", apiKey });
  }

  const sessionId = `session_${uuidv4()}`;
  const payload: AuthPayload = { userId, sessionId };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 86400 }); // 24h

  res.json({
    token,
    userId,
    sessionId,
    expiresIn: JWT_EXPIRES_IN,
  });
  authLog.info("Login successful", { userId, sessionId });
});

/**
 * POST /auth/verify
 * Verify JWT token validity
 */
router.post("/verify", (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    res.json({ valid: true, userId: decoded.userId, sessionId: decoded.sessionId });
  authLog.info("Token verified", { valid: true, userId: decoded.userId });
  } catch {
    
  authLog.warn("Token verification failed");res.status(401).json({ valid: false, error: "Invalid or expired token" });
  }
});

/**
 * POST /auth/refresh
 * Refresh an existing token
 */
router.post("/refresh", (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    // Remove exp/iat for re-signing
    const { iat, exp, ...rest } = decoded as any;
    const newToken = jwt.sign(rest, JWT_SECRET, { expiresIn: 86400 }); // 24h
    res.json({ token: newToken, expiresIn: JWT_EXPIRES_IN });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
