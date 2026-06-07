// ============================================================
    // Auth Middleware - Protege rotas com JWT
    // ============================================================
    
    import { Request, Response, NextFunction } from "express";
    import { SessionModel } from "../../db/models/Session";
    
    // Estende o tipo Request para incluir userId
    declare global {
      namespace Express {
        interface Request {
          userId?: string;
        }
      }
    }
    
    export async function authMiddleware(
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> {
      const authHeader = req.headers.authorization;
    
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Token nao fornecido" });
        return;
      }
    
      const token = authHeader.substring(7);
    
      try {
        const userId = await SessionModel.validate(token);
        if (!userId) {
          res.status(401).json({ error: "Token invalido ou expirado" });
          return;
        }
        req.userId = userId;
        next();
      } catch (err) {
        res.status(500).json({ error: "Erro ao autenticar" });
      }
    }
    