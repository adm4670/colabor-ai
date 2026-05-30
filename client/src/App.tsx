import React, { useState, useCallback } from "react";
    import Chat from "./components/Chat";
    
    // Electron API type (exposed via preload)
    declare global {
      interface Window {
        electronAPI?: {
          window: { minimize: () => Promise<void>; maximize: () => Promise<void>; close: () => Promise<void> };
          agents: { runTool: (tool: string, args: Record<string, unknown>) => Promise<{ result: string; error?: string }>; getAvailableTools: () => Promise<string[]> };
          platform: string;
        };
      }
    }
    
    const isElectron = !!window.electronAPI;
    
    export default function App() {
      const [connected, setConnected] = useState(false);
      const [sessionId, setSessionId] = useState<string | null>(null);
    
      const handleConnectionChange = useCallback((status: boolean, sid?: string) => {
        setConnected(status);
        if (sid) setSessionId(sid);
      }, []);
    
      return (
        <div className="app-container">
          <header className="app-header">
            <h1>colabor-ai</h1>
            <div className="header-actions">
              {isElectron && (
                <>
                  <button className="header-btn" onClick={() => window.electronAPI!.window.minimize()}>_</button>
                  <button className="header-btn" onClick={() => window.electronAPI!.window.maximize()}>[]</button>
                  <button className="header-btn" onClick={() => window.electronAPI!.window.close()}>X</button>
                </>
              )}
            </div>
          </header>
    
          <Chat onConnectionChange={handleConnectionChange} />
    
          <div className="status-bar">
            <div className="status-indicator">
              <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
              <span>{connected ? "Conectado" : "Desconectado"}</span>
            </div>
            <span>{sessionId ? `Session: ${sessionId.slice(0, 12)}...` : ""}</span>
            <span>{isElectron ? `Windows (${window.electronAPI?.platform})` : "Browser"}</span>
          </div>
        </div>
      );
    }
    