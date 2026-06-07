// ============================================================
    // Tools Routes - Lista e gerencia ferramentas disponiveis
    // ============================================================
    
    import { Router, Request, Response } from "express";
    import { authMiddleware } from "../middleware/auth";
    
    const router = Router();
    
    // Lista tools disponiveis no Edge
    router.get("/list", authMiddleware, (_req: Request, res: Response) => {
      res.json({
        tools: [
          {
            name: "file_system",
            description: "Le, escreve, lista e gerencia arquivos/pastas",
            actions: ["read", "write", "list", "delete", "mkdir", "exists", "copy", "move"],
            location: "edge",
          },
          {
            name: "web_search",
            description: "Busca na web (DuckDuckGo) e extrai conteudo de paginas",
            actions: ["search", "scrape", "search_and_scrape"],
            location: "edge",
          },
          {
            name: "api_request",
            description: "Chama APIs REST externas (GET, POST, PUT, DELETE, PATCH)",
            actions: ["request"],
            location: "cloud",
          },
          {
            name: "task_scheduler",
            description: "Agenda tarefas para execucao futura",
            actions: ["schedule", "list", "cancel", "status"],
            location: "cloud",
          },
          {
            name: "memory_search",
            description: "Busca semantica na memoria vetorial do usuario",
            actions: ["search", "store", "stats", "forget"],
            location: "cloud",
          },
        ],
      });
    });
    
    export default router;
    