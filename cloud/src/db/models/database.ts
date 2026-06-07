// ============================================================
    // Database - Pool de conexao PostgreSQL
    // ============================================================
    
    import { Pool } from "pg";
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    pool.on("error", (err) => {
      console.error("[DB] Erro inesperado no pool:", err.message);
    });
    
    export { pool };
    