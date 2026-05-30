/**
     * Electron Main Process v2
     * 
     * Cria janela, gerencia IPC, conecta ao cloud via WebSocket,
     * executa tool calls locais sob comando do orchestrator remoto.
     */
    import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
    import path from "path";
    import WebSocket from "ws";
    import { registerLocalAgents } from "./agents";
    import { executeToolCall, type ToolCallMessage } from "./agents/tool-executor";
    
    // ============================================================
    // Config
    // ============================================================
    const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:3001";
    const WS_URL = CLOUD_URL.replace("http", "ws") + "/ws";
    const RECONNECT_DELAY_MS = 3000;
    const MAX_RECONNECT_DELAY_MS = 30000;
    
    let mainWindow: BrowserWindow | null = null;
    let ws: WebSocket | null = null;
    let token: string | null = null;
    let sessionId: string | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isIntentionalClose = false;
    
    // ============================================================
    // Window
    // ============================================================
    function createWindow() {
      mainWindow = new BrowserWindow({
        width: 900,
        height: 680,
        minWidth: 500,
        minHeight: 400,
        title: "colabor-ai",
        icon: path.join(__dirname, "../build/icon.png"),
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
        frame: true,
        autoHideMenuBar: true,
      });
    
      if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
      } else {
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
      }
    
      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    }
    
    // ============================================================
    // WebSocket Client
    // ============================================================
    async function authenticate(): Promise<{ token: string; sessionId: string } | null> {
      try {
        const response = await fetch(`${CLOUD_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: "colabor-ai-local-client-key-2024" }),
        });
        const data = await response.json();
        if (data.token) {
          console.log("[WS] Authenticated:", data.userId, data.sessionId);
          return { token: data.token, sessionId: data.sessionId };
        }
        return null;
      } catch (err: any) {
        console.error("[WS] Auth failed:", err.message);
        return null;
      }
    }
    
    function connectWebSocket() {
      if (!token || !sessionId) {
        console.error("[WS] Cannot connect: no token/sessionId");
        return;
      }
    
      const url = `${WS_URL}?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;
      console.log(`[WS] Connecting to ${WS_URL}...`);
    
      try {
        ws = new WebSocket(url);
      } catch (err: any) {
        console.error("[WS] Connection error:", err.message);
        scheduleReconnect();
        return;
      }
    
      ws.on("open", () => {
        console.log("[WS] Connected to cloud");
        reconnectAttempts = 0;
        sendToRenderer("ws:status", { connected: true, sessionId });
      });
    
      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleCloudMessage(msg);
        } catch (err: any) {
          console.error("[WS] Parse error:", err.message);
        }
      });
    
      ws.on("close", (code, reason) => {
        console.log(`[WS] Disconnected: code=${code} reason=${reason}`);
        sendToRenderer("ws:status", { connected: false, sessionId });
        ws = null;
    
        if (!isIntentionalClose) {
          scheduleReconnect();
        }
      });
    
      ws.on("error", (err) => {
        console.error("[WS] Error:", err.message);
        // onclose will fire after this
      });
    }
    
    function scheduleReconnect() {
      if (reconnectTimer) return;
    
      const delay = Math.min(
        RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY_MS
      );
      reconnectAttempts++;
    
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
      sendToRenderer("ws:reconnecting", { attempt: reconnectAttempts, delay });
    
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
      }, delay);
    }
    
    function handleCloudMessage(msg: any) {
      switch (msg.type) {
        case "connected":
          console.log("[WS] Welcome:", msg.payload?.message);
          break;
    
        case "stream":
          // Forward stream chunks to renderer
          sendToRenderer("stream:chunk", msg.payload);
          break;
    
        case "tool_call":
          // Cloud wants us to execute a local tool
          handleToolCall(msg.payload as ToolCallMessage);
          break;
    
        case "pong":
          // Heartbeat response
          break;
    
        case "error":
          console.error("[WS] Cloud error:", msg.payload?.message);
          sendToRenderer("stream:chunk", {
            chunkType: "error",
            content: msg.payload?.message || "Unknown error",
          });
          break;
    
        case "confirmation_required":
          // Ask user for confirmation
          sendToRenderer("tool:confirmation", msg.payload);
          break;
    
        default:
          console.log("[WS] Unknown message type:", msg.type);
      }
    }
    
    async function handleToolCall(toolCall: ToolCallMessage) {
      console.log(
        `[Tool] Received: ${toolCall.agent}/${toolCall.tool} id=${toolCall.id} confirmation=${toolCall.requireConfirmation}`
      );
    
      // If confirmation required, ask user first
      if (toolCall.requireConfirmation) {
        const approved = await requestUserConfirmation(toolCall);
        if (!approved) {
          // Send cancelled result
          const cancelMsg = {
            type: "tool_result",
            id: toolCall.id,
            status: "cancelled" as const,
            sessionId: toolCall.sessionId,
          };
          ws?.send(JSON.stringify(cancelMsg));
          return;
        }
      }
    
      // Execute the tool
      const result = await executeToolCall(toolCall);
    
      // Send result back to cloud
      if (ws?.readyState === WebSocket.OPEN) {
        const msg = { type: "tool_result", payload: result };
        ws.send(JSON.stringify(msg));
        console.log(`[Tool] Result sent: id=${result.id} status=${result.status}`);
      } else {
        console.error("[Tool] WebSocket not connected, cannot send result");
      }
    }
    
    /**
     * Ask user for confirmation via renderer IPC.
     * Returns a Promise that resolves when user responds.
     */
    function requestUserConfirmation(toolCall: ToolCallMessage): Promise<boolean> {
      return new Promise((resolve) => {
        // Send to renderer
        sendToRenderer("tool:confirmation", {
          id: toolCall.id,
          agent: toolCall.agent,
          tool: toolCall.tool,
          description: toolCall.description,
          params: toolCall.params,
        });
    
        // Listen for response (one-time)
        const handler = (_event: any, response: { id: string; approved: boolean }) => {
          if (response.id === toolCall.id) {
            ipcMain.removeListener("tool:confirmationResponse", handler);
            resolve(response.approved);
          }
        };
    
        ipcMain.on("tool:confirmationResponse", handler);
    
        // Timeout: auto-deny after 30 seconds
        setTimeout(() => {
          ipcMain.removeListener("tool:confirmationResponse", handler);
          resolve(false);
        }, 30000);
      });
    }
    
    function sendToRenderer(channel: string, data: any) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    }
    
    // ============================================================
    // IPC Handlers
    // ============================================================
    
    // Window controls
    ipcMain.handle("window:minimize", () => mainWindow?.minimize());
    ipcMain.handle("window:maximize", () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize();
      else mainWindow?.maximize();
    });
    ipcMain.handle("window:close", () => mainWindow?.close());
    
    // Dialog
    ipcMain.handle("dialog:openFile", async (_e, opts) => {
      if (!mainWindow) return null;
      return dialog.showOpenDialog(mainWindow, opts || {});
    });
    ipcMain.handle("dialog:saveFile", async (_e, opts) => {
      if (!mainWindow) return null;
      return dialog.showSaveDialog(mainWindow, opts || {});
    });
    
    // Shell
    ipcMain.handle("shell:openExternal", async (_e, url: string) => {
      return shell.openExternal(url);
    });
    
    // Chat: send message via WebSocket
    ipcMain.handle("chat:send", async (_event, message: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return { error: "Not connected to cloud" };
      }
      ws.send(JSON.stringify({ type: "chat", payload: { message } }));
      return { success: true };
    });
    
    // Tool confirmation response from renderer
    ipcMain.on("tool:confirmationResponse", (_event, response: { id: string; approved: boolean }) => {
      // Handled by the Promise in requestUserConfirmation
    });
    
    // Get connection status
    ipcMain.handle("ws:getStatus", () => ({
      connected: ws?.readyState === WebSocket.OPEN,
      sessionId,
      reconnectAttempts,
    }));
    
    // ============================================================
    // App Lifecycle
    // ============================================================
    app.whenReady().then(async () => {
      // Register local agents
      registerLocalAgents(ipcMain);
    
      createWindow();
    
      // Authenticate with cloud
      const auth = await authenticate();
      if (auth) {
        token = auth.token;
        sessionId = auth.sessionId;
        connectWebSocket();
      } else {
        console.error("[App] Authentication failed. Cloud server might be down.");
        sendToRenderer("ws:status", { connected: false, error: "Auth failed" });
      }
    
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    });
    
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    
    app.on("before-quit", () => {
      isIntentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close(1000, "App closing");
        ws = null;
      }
    });
    
    export { mainWindow };
    