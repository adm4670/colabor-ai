// ============================================================
    // User Model
    // ============================================================
    
    import { pool } from "./database";
    
    export interface User {
      id: string;
      google_id: string;
      email: string;
      name: string;
      avatar_url: string | null;
      created_at: Date;
    }
    
    export class UserModel {
      static async findByGoogleId(googleId: string): Promise<User | null> {
        const result = await pool.query(
          "SELECT * FROM users WHERE google_id = $1",
          [googleId]
        );
        return result.rows[0] || null;
      }
    
      static async findByEmail(email: string): Promise<User | null> {
        const result = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [email]
        );
        return result.rows[0] || null;
      }
    
      static async findById(id: string): Promise<User | null> {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        return result.rows[0] || null;
      }
    
      static async create(data: {
        google_id: string;
        email: string;
        name: string;
        avatar_url?: string;
      }): Promise<User> {
        const result = await pool.query(
          `INSERT INTO users (google_id, email, name, avatar_url)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [data.google_id, data.email, data.name, data.avatar_url || null]
        );
        return result.rows[0];
      }
    
      static async findOrCreate(profile: {
        google_id: string;
        email: string;
        name: string;
        avatar_url?: string;
      }): Promise<User> {
        const existing = await this.findByGoogleId(profile.google_id);
        if (existing) return existing;
        return this.create(profile);
      }
    }
    