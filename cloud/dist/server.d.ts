import http from "http";
import { WebSocket } from "ws";
import type { PendingToolCall } from "./protocol/tool-protocol";
declare const app: any;
declare const server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
declare const wss: any;
declare const wsConnections: Map<string, Set<WebSocket>>;
declare const pendingToolCalls: Map<string, PendingToolCall>;
export { app, server, wss, wsConnections, pendingToolCalls };
//# sourceMappingURL=server.d.ts.map