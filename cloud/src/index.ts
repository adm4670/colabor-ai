// ============================================================
    // colabor-ai Cloud - Main Entry Point
    // API REST + WebSocket Server
    // ============================================================
    
    import path from "path";
import dotenv from "dotenv";
    dotenv.config();
    
    import express from "express";
    import cors from "cors";
    import http from "http";
    import passport from "passport";
    
    import authRoutes from "./api/routes/auth";
    import sessionRoutes from "./api/routes/session";
    import agentsRoutes from "./api/routes/agents";
    import toolsRoutes from "./api/routes/tools";
    import { edgeGateway } from "./websocket/edgeGateway";
    import { pool } from "./db/models/database";
    
    const app = express();
    const server = http.createServer(app);
    
    const PORT = parseInt(process.env.PORT || "3001", 10);
    
    // ============================================
    // Middleware Global
    // ============================================
    app.use(cors());
    app.use(express.json({ limit: "10mb" }));
    app.use(express.static(path.join(__dirname, "public")));
    app.use(passport.initialize());
    
    // ============================================
    // Rotas
    // ============================================
    app.use("/auth", authRoutes);
    app.use("/session", sessionRoutes);
    app.use("/agents", agentsRoutes);
    app.use("/tools", toolsRoutes);
    
    // Health check
    app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        uptime: process.uptime(),
        onlineUsers: edgeGateway.getOnlineUsers(),
        timestamp: new Date().toISOString(),
      });
    });
    
    // ============================================
    // WebSocket (Edge Gateway)
    // ============================================
    edgeGateway.initialize(server);
    
    // ============================================
    // Inicializacao
    // ============================================
    async function start(): Promise<void> {
      try {
        // Testa conexao com o banco
        await pool.query("SELECT 1");
        console.log("[DB] Conectado ao PostgreSQL com pgvector");
      } catch (err: any) {
        console.error("[DB] Falha ao conectar:", err.message);
        console.log("[DB] O servidor iniciara sem banco de dados.");
      }
    
      server.listen(PORT, () => {
        console.log(`[Cloud] colabor-ai rodando em http://localhost:\${PORT}`);
        console.log("[Cloud] WebSocket pronto para conexoes Edge");
        console.log("[Cloud] Health: http://localhost:" + PORT + "/health");
      });
    }
    
    start().catch(console.error);
    