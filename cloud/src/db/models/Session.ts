// ============================================================
    // Session Model
    // ============================================================
    
    import { pool } from "./database";
    import jwt from "jsonwebtoken";
    
    const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
    const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas
    
    export class SessionModel {
      static async create(userId: string): Promise<string> {
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    
        const token = jwt.sign(
          { sub: userId, iat: Math.floor(Date.now() / 1000) },
          JWT_SECRET,
          { expiresIn: "24h" }
        );
    
        await pool.query(
          `INSERT INTO sessions (user_id, token, expires_at)
           VALUES ($1, $2, $3)`,
          [userId, token, expiresAt]
        );
    
        return token;
      }
    
      static async validate(token: string): Promise<string | null> {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    
          const result = await pool.query(
            `SELECT user_id FROM sessions
             WHERE token = $1 AND expires_at > NOW()`,
            [token]
          );
    
          if (result.rows.length === 0) return null;
          return decoded.sub;
        } catch {
          return null;
        }
      }
    
      static async revoke(token: string): Promise<void> {
        await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
      }
    
      static async revokeAll(userId: string): Promise<void> {
        await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      }
    }
    