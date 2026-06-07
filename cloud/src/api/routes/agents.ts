// ============================================================
    // Agents Routes - Interface para os agentes de IA
    // ============================================================
    
    import { Router, Request, Response } from "express";
    import { authMiddleware } from "../middleware/auth";
    import { plannerAgent } from "../../agents/planner";
    
    const router = Router();
    
    // Executa uma requisicao em um agente
    router.post(
      "/execute",
      authMiddleware,
      async (req: Request, res: Response) => {
        try {
          const { message, conversationId } = req.body;
    
          if (!message) {
            res.status(400).json({ error: "Mensagem obrigatoria" });
            return;
          }
    
          const result = await plannerAgent.process({
            userId: req.userId!,
            message,
            conversationId,
          });
    
          res.json(result);
        } catch (err: any) {
          console.error("[Agents] Erro:", err.message);
          res.status(500).json({ error: "Erro ao processar requisicao" });
        }
      }
    );
    
    // Lista agentes disponiveis
    router.get("/list", authMiddleware, (_req: Request, res: Response) => {
      res.json({
        agents: [
          { name: "DataAnalystAgent", description: "Analise de dados e geracao de relatorios" },
          { name: "GitAgent", description: "Operacoes Git e GitHub" },
          { name: "DBAgent", description: "Consultas SQL em linguagem natural" },
          { name: "ImageAgent", description: "Visao computacional e OCR" },
          { name: "NotificationAgent", description: "Notificacoes Push, Telegram, Slack" },
        ],
      });
    });
    
    export default router;
    