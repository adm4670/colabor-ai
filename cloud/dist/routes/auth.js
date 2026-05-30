"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Auth Routes - JWT authentication endpoints
 */
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";
// Simple user store (in production, use a database)
const users = new Map();
/**
 * POST /auth/login
 * Login simples com API key ou credenciais
 */
router.post("/login", (req, res) => {
    const { apiKey, username } = req.body;
    if (!apiKey && !username) {
        return res.status(400).json({ error: "apiKey or username required" });
    }
    // Simple auth: accept any valid-looking API key or create anonymous session
    const userId = username || `user_${(0, uuid_1.v4)().slice(0, 8)}`;
    if (apiKey) {
        // Validate API key format
        if (typeof apiKey !== "string" || apiKey.length < 10) {
            return res.status(401).json({ error: "Invalid API key format" });
        }
        users.set(userId, { id: userId, name: username || "User", apiKey });
    }
    const sessionId = `session_${(0, uuid_1.v4)()}`;
    const payload = { userId, sessionId };
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: 86400 }); // 24h
    res.json({
        token,
        userId,
        sessionId,
        expiresIn: JWT_EXPIRES_IN,
    });
});
/**
 * POST /auth/verify
 * Verify JWT token validity
 */
router.post("/verify", (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: "token required" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        res.json({ valid: true, userId: decoded.userId, sessionId: decoded.sessionId });
    }
    catch {
        res.status(401).json({ valid: false, error: "Invalid or expired token" });
    }
});
/**
 * POST /auth/refresh
 * Refresh an existing token
 */
router.post("/refresh", (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: "token required" });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Remove exp/iat for re-signing
        const { iat, exp, ...rest } = decoded;
        const newToken = jsonwebtoken_1.default.sign(rest, JWT_SECRET, { expiresIn: 86400 }); // 24h
        res.json({ token: newToken, expiresIn: JWT_EXPIRES_IN });
    }
    catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map