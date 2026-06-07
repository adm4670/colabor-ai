// ============================================================
    // Conversation Model
    // ============================================================
    
    import { pool } from "./database";
    
    export interface Conversation {
      id: string;
      user_id: string;
      title: string;
      messages: any[];
      created_at: Date;
      updated_at: Date;
    }
    
    export class ConversationModel {
      static async findByUser(userId: string, limit = 20, offset = 0): Promise<Conversation[]> {
        const result = await pool.query(
          `SELECT * FROM conversations
           WHERE user_id = $1
           ORDER BY updated_at DESC
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );
        return result.rows;
      }
    
      static async findById(id: string, userId: string): Promise<Conversation | null> {
        const result = await pool.query(
          "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
          [id, userId]
        );
        return result.rows[0] || null;
      }
    
      static async create(userId: string, title?: string): Promise<Conversation> {
        const result = await pool.query(
          `INSERT INTO conversations (user_id, title)
           VALUES ($1, $2)
           RETURNING *`,
          [userId, title || "Nova conversa"]
        );
        return result.rows[0];
      }
    
      static async addMessage(
        id: string,
        userId: string,
        message: any
      ): Promise<Conversation> {
        const result = await pool.query(
          `UPDATE conversations
           SET messages = messages || $3::jsonb,
               updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING *`,
          [id, userId, JSON.stringify(message)]
        );
        return result.rows[0];
      }
    
      static async delete(id: string, userId: string): Promise<boolean> {
        const result = await pool.query(
          "DELETE FROM conversations WHERE id = $1 AND user_id = $2",
          [id, userId]
        );
        return (result.rowCount ?? 0) > 0;
      }
    }
    