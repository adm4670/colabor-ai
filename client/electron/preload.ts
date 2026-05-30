/**
     * Preload Script v2 (Context Bridge)
     * 
     * Exposes safe API to renderer process including:
     * - Window controls, dialogs, shell
     * - Local agent tool execution
     * - WebSocket streaming listeners
     * - Tool confirmation dialogs
     */
    import { contextBridge, ipcRenderer } from "electron";
    
    export interface ElectronAPI {
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
      };
      dialog: {
        openFile: (options?: any) => Promise<any>;
        saveFile: (options?: any) => Promise<any>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      agents: {
        runTool: (tool: string, args: Record<string, unknown>) => Promise<{ result: string; error?: string }>;
        getAvailableTools: () => Promise<string[]>;
      };
      /** Send a chat message via WebSocket */
      chat: {
        send: (message: string) => Promise<{ success?: boolean; error?: string }>;
      };
      /** Listen for streaming chunks from cloud */
      stream: {
        onChunk: (callback: (chunk: StreamChunk) => void) => () => void;
      };
      /** Listen for tool execution requests from cloud */
      tools: {
        onToolCall: (callback: (toolCall: ToolCallInfo) => void) => () => void;
        onConfirmation: (callback: (confirm: ConfirmationRequest) => void) => () => void;
        respondConfirmation: (id: string, approved: boolean) => void;
      };
      /** WebSocket connection status */
      connection: {
        onStatusChange: (callback: (status: ConnectionStatus) => void) => () => void;
        getStatus: () => Promise<ConnectionStatus>;
      };
      platform: string;
    }
    
    export interface StreamChunk {
      chunkType: "text" | "tool_call" | "progress" | "end" | "error";
      content: string;
      agent?: string;
      sessionId: string;
    }
    
    export interface ToolCallInfo {
      id: string;
      agent: string;
      tool: string;
      params: Record<string, unknown>;
      requireConfirmation: boolean;
      description: string;
      sessionId: string;
    }
    
    export interface ConfirmationRequest {
      id: string;
      agent: string;
      tool: string;
      description: string;
      params: Record<string, unknown>;
    }
    
    export interface ConnectionStatus {
      connected: boolean;
      sessionId?: string;
      error?: string;
    }
    
    const api: ElectronAPI = {
      window: {
        minimize: () => ipcRenderer.invoke("window:minimize"),
        maximize: () => ipcRenderer.invoke("window:maximize"),
        close: () => ipcRenderer.invoke("window:close"),
      },
      dialog: {
        openFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
        saveFile: (options) => ipcRenderer.invoke("dialog:saveFile", options),
      },
      shell: {
        openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
      },
      agents: {
        runTool: (tool, args) => ipcRenderer.invoke("agent:runTool", tool, args),
        getAvailableTools: () => ipcRenderer.invoke("agent:getAvailableTools"),
      },
      chat: {
        send: (message) => ipcRenderer.invoke("chat:send", message),
      },
      stream: {
        onChunk: (callback) => {
          const handler = (_event: any, chunk: StreamChunk) => callback(chunk);
          ipcRenderer.on("stream:chunk", handler);
          return () => ipcRenderer.removeListener("stream:chunk", handler);
        },
      },
      tools: {
        onToolCall: (callback) => {
          const handler = (_event: any, info: ToolCallInfo) => callback(info);
          ipcRenderer.on("tool:call", handler);
          return () => ipcRenderer.removeListener("tool:call", handler);
        },
        onConfirmation: (callback) => {
          const handler = (_event: any, req: ConfirmationRequest) => callback(req);
          ipcRenderer.on("tool:confirmation", handler);
          return () => ipcRenderer.removeListener("tool:confirmation", handler);
        },
        respondConfirmation: (id, approved) => {
          ipcRenderer.send("tool:confirmationResponse", { id, approved });
        },
      },
      connection: {
        onStatusChange: (callback) => {
          const handler = (_event: any, status: ConnectionStatus) => callback(status);
          ipcRenderer.on("ws:status", handler);
          return () => ipcRenderer.removeListener("ws:status", handler);
        },
        getStatus: () => ipcRenderer.invoke("ws:getStatus"),
      },
      platform: process.platform,
    };
    
    contextBridge.exposeInMainWorld("electronAPI", api);
    