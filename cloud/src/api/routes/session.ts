// ============================================================
    // Session Routes - Gerenciamento de sessoes do usuario
    // ============================================================
    
    import { Router, Request, Response } from "express";
    import { authMiddleware } from "../middleware/auth";
    import { SessionModel } from "../../db/models/Session";
    import { UserModel } from "../../db/models/User";
    import { ConversationModel } from "../../db/models/Conversation";
    
    const router = Router();
    
    // Get perfil do usuario logado
    router.get("/me", authMiddleware, async (req: Request, res: Response) => {
      try {
        const user = await UserModel.findById(req.userId!);
        if (!user) {
          res.status(404).json({ error: "Usuario nao encontrado" });
          return;
        }
        res.json({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
        });
      } catch (err) {
        res.status(500).json({ error: "Erro ao buscar usuario" });
      }
    });
    
    // Lista conversas do usuario
    router.get(
      "/conversations",
      authMiddleware,
      async (req: Request, res: Response) => {
        try {
          const limit = parseInt(req.query.limit as string) || 20;
          const offset = parseInt(req.query.offset as string) || 0;
          const conversations = await ConversationModel.findByUser(
            req.userId!,
            limit,
            offset
          );
          res.json({ conversations });
        } catch (err) {
          res.status(500).json({ error: "Erro ao listar conversas" });
        }
      }
    );
    
    // Revoga todas as sessoes
    router.post(
      "/revoke-all",
      authMiddleware,
      async (req: Request, res: Response) => {
        try {
          await SessionModel.revokeAll(req.userId!);
          res.json({ message: "Todas as sessoes foram revogadas" });
        } catch (err) {
          res.status(500).json({ error: "Erro ao revogar sessoes" });
        }
      }
    );
    
    export default router;
    