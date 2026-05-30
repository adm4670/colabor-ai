/// <reference types="node" />
import http from "http";
import { WebSocket } from "ws";
import type { PendingToolCall } from "./protocol/tool-protocol";
declare const app: import("express-serve-static-core").Express;
declare const server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
declare const wss: import("ws").Server<typeof import("ws"), typeof http.IncomingMessage>;
declare const wsConnections: Map<string, Set<WebSocket>>;
declare const pendingToolCalls: Map<string, PendingToolCall>;
export { app, server, wss, wsConnections, pendingToolCalls };
//# sourceMappingURL=server.d.ts.map