// ============================================================
    // Auth Routes - Google OAuth2.0 + Modo Demonstracao
    // ============================================================
    
    import { Router, Request, Response } from "express";
    import passport from "passport";
    import jwt from "jsonwebtoken";
    import { v4 as uuidv4 } from "uuid";
    
    const router = Router();
    const JWT_SECRET = process.env.JWT_SECRET || "demo-jwt-secret";
    
    // ============================================
    // Google OAuth2.0 (apenas se configurado)
    // ============================================
    const hasGoogleAuth =
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_ID !== "seu_google_client_id" &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CLIENT_SECRET !== "seu_google_client_secret";
    
    // Funcao para configurar Google OAuth (so chamada se tiver credenciais)
    async function setupGoogleAuth() {
      try {
        const passportModule = await import("passport-google-oauth20");
        const GoogleStrategy = passportModule.Strategy;
        const { UserModel } = await import("../../db/models/User");
        const { SessionModel } = await import("../../db/models/Session");
    
        passport.use(
          new GoogleStrategy(
            {
              clientID: process.env.GOOGLE_CLIENT_ID || "",
              clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
              callbackURL: "/auth/google/callback",
            },
            async (_accessToken: any, _refreshToken: any, profile: any, done: any) => {
              try {
                const user = await UserModel.findOrCreate({
                  google_id: profile.id,
                  email: profile.emails?.[0]?.value || "",
                  name: profile.displayName,
                  avatar_url: profile.photos?.[0]?.value,
                });
                done(null, user);
              } catch (err) {
                done(err as Error);
              }
            }
          )
        );
    
        // Inicia o fluxo OAuth
        router.get(
          "/google",
          passport.authenticate("google", {
            scope: ["profile", "email"],
            session: false,
          })
        );
    
        // Callback do Google
        router.get(
          "/google/callback",
          passport.authenticate("google", {
            session: false,
            failureRedirect: "/auth/error",
          }),
          async (req: Request, res: Response) => {
            const user = req.user as any;
            const { SessionModel: SessionModel2 } = await import("../../db/models/Session");
            const token = await SessionModel2.create(user.id);
            res.redirect(`/auth/success?token=${token}`);
          }
        );
    
        console.log("[Auth] Google OAuth2.0 configurado");
      } catch (err: any) {
        console.log("[Auth] Google OAuth2.0 nao configurado:", err.message);
        console.log("[Auth] Usando modo demonstracao.");
      }
    }
    
    // Configura Google OAuth apenas se tiver credenciais validas
    if (hasGoogleAuth) {
      setupGoogleAuth();
    } else {
      console.log("[Auth] Google OAuth2.0 nao configurado. Usando modo demonstracao.");
      console.log("[Auth] Para habilitar, preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env");
    }
    
    // ============================================
    // Modo Demonstracao (funciona sem Google)
    // ============================================
    router.post("/demo", async (_req: Request, res: Response) => {
      try {
        const demoUserId = uuidv4();
    
        // Gera JWT diretamente
        const token = jwt.sign(
          { sub: demoUserId, iat: Math.floor(Date.now() / 1000) },
          JWT_SECRET,
          { expiresIn: "24h" }
        );
    
        res.json({
          token,
          user: {
            id: demoUserId,
            name: "Usuario Demonstracao",
            email: "demo@colabor-ai.com",
            avatar_url: null,
          },
          message: "Modo demonstracao ativado",
        });
      } catch (err: any) {
        res.status(500).json({ error: "Erro no modo demonstracao: " + err.message });
      }
    });
    
    // ============================================
    // Login com email/senha (admin)
    // ============================================
    router.post("/login", (req: Request, res: Response) => {
      const { email, password } = req.body;
    
      if (email === "admin@demo.com" && password === "demo123") {
        const demoUserId = uuidv4();
        const token = jwt.sign(
          { sub: demoUserId, iat: Math.floor(Date.now() / 1000) },
          JWT_SECRET,
          { expiresIn: "24h" }
        );
    
        res.json({
          token,
          user: {
            id: demoUserId,
            name: "Administrador",
            email: "admin@demo.com",
            avatar_url: null,
          },
          message: "Login realizado com sucesso",
        });
      } else {
        res.status(401).json({ error: "Credenciais invalidas. Use admin@demo.com / demo123" });
      }
    });
    
    // ============================================
    // Rotas compartilhadas (funcionam em ambos modos)
    // ============================================
    
    // Sucesso (usada apos callback Google)
    router.get("/success", (req: Request, res: Response) => {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: "Token nao recebido" });
        return;
      }
      res.json({ token, message: "Autenticado com sucesso" });
    });
    
    // Erro de login
    router.get("/error", (_req: Request, res: Response) => {
      res.status(401).json({ error: "Falha na autenticacao com Google" });
    });
    
    // Valida token
    router.get("/validate", async (req: Request, res: Response) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ valid: false });
        return;
      }
    
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
        res.json({
          valid: true,
          user: {
            id: decoded.sub,
            name: "Usuario",
            email: "usuario@colabor-ai.com",
            avatar_url: null,
          },
        });
      } catch {
        res.status(401).json({ valid: false });
      }
    });
    
    // Logout
    router.post("/logout", (_req: Request, res: Response) => {
      res.json({ message: "Sessao encerrada" });
    });
    
    export default router;
    