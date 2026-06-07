// ============================================================
    // EdgeGateway - Gerenciamento de conexoes WebSocket com Edge
    // Responsavel por manter conexoes com cada cliente Electron
    // e rotear tool_calls entre Cloud e Edge
    // ============================================================
    
    import { Server as HttpServer } from "http";
    import { Server, Socket } from "socket.io";
    import { SessionModel } from "../db/models/Session";
    
    // Mapa de conexoes ativas: userId -> socketId
    const activeConnections = new Map<string, string[]>();
    
    // Callbacks para aguardar resposta de tools
    const pendingToolCalls = new Map<
      string,
      { resolve: (value: string) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }
    >();
    
    let io: Server | null = null;
    
    interface ToolCallMessage {
      userId: string;
      sessionId: string;
      toolName: string;
      params: any;
    }
    
    class EdgeGateway {
      initialize(httpServer: HttpServer): void {
        io = new Server(httpServer, {
          cors: {
            origin: "*",
            methods: ["GET", "POST"],
          },
          pingInterval: 30000,
          pingTimeout: 10000,
        });
    
        // Middleware de autenticacao
        io.use(async (socket, next) => {
          const token = socket.handshake.auth?.token || socket.handshake.query?.token;
          if (!token) {
            next(new Error("Token nao fornecido"));
            return;
          }
    
          try {
            const userId = await SessionModel.validate(token as string);
            if (!userId) {
              next(new Error("Token invalido"));
              return;
            }
            (socket as any).userId = userId;
            next();
          } catch {
            next(new Error("Erro de autenticacao"));
          }
        });
    
        io.on("connection", (socket: Socket) => {
          const userId = (socket as any).userId as string;
    
          // Registra conexao
          const connections = activeConnections.get(userId) || [];
          connections.push(socket.id);
          activeConnections.set(userId, connections);
    
          console.log(`[WS] Edge conectado: user=${userId.substring(0, 8)}... socket=${socket.id}`);
    
          // Recebe resultado de tool
          socket.on("tool_result", (data) => {
            const { requestId, result, error } = data;
            const pending = pendingToolCalls.get(requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              if (error) {
                pending.reject(new Error(error));
              } else {
                pending.resolve(result);
              }
              pendingToolCalls.delete(requestId);
            }
          });
    
          // Heartbeat
          socket.on("heartbeat", () => {
            socket.emit("heartbeat_ack", { timestamp: Date.now() });
          });
    
          // Desconexao
          socket.on("disconnect", () => {
            const conns = activeConnections.get(userId) || [];
            const updated = conns.filter((id) => id !== socket.id);
            if (updated.length === 0) {
              activeConnections.delete(userId);
            } else {
              activeConnections.set(userId, updated);
            }
            console.log(`[WS] Edge desconectado: user=${userId.substring(0, 8)}...`);
          });
        });
      }
    
      // Envia tool_call para o Edge e aguarda resposta
      async sendToolCall(msg: ToolCallMessage): Promise<string> {
        if (!io) throw new Error("WebSocket nao inicializado");
    
        const connections = activeConnections.get(msg.userId);
        if (!connections || connections.length === 0) {
          throw new Error("Edge desconectado. O usuario precisa estar online.");
        }
    
        const requestId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
        // Promise que aguarda resposta do Edge
        return new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingToolCalls.delete(requestId);
            reject(new Error("Timeout: Edge nao respondeu em 30s"));
          }, 30000);
    
          pendingToolCalls.set(requestId, { resolve, reject, timeout });
    
          // Envia para todas as conexoes do usuario
          for (const socketId of connections) {
            io!.to(socketId).emit("tool_call", {
              requestId,
              toolName: msg.toolName,
              params: msg.params,
            });
          }
        });
      }
    
      // Verifica se usuario esta online
      isUserOnline(userId: string): boolean {
        return activeConnections.has(userId) && (activeConnections.get(userId)?.length ?? 0) > 0;
      }
    
      // Numero de usuarios conectados
      getOnlineUsers(): number {
        return activeConnections.size;
      }
    }
    
    export const edgeGateway = new EdgeGateway();
    