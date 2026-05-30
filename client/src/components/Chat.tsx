import React, { useState, useRef, useEffect, useCallback } from "react";
    
    interface ChatMessage {
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      timestamp: number;
    }
    
    interface ChatProps {
      onConnectionChange: (connected: boolean, sessionId?: string) => void;
    }
    
    interface StreamChunk {
      chunkType: "text" | "tool_call" | "progress" | "end" | "error";
      content: string;
      agent?: string;
      sessionId: string;
    }
    
    interface ConnectionStatus {
      connected: boolean;
      sessionId?: string;
      error?: string;
    }
    
    declare global {
      interface Window {
        electronAPI?: {
          chat: { send: (message: string) => Promise<{ success?: boolean; error?: string }> };
          stream: {
            onChunk: (cb: (chunk: StreamChunk) => void) => () => void;
          };
          connection: {
            onStatusChange: (cb: (status: ConnectionStatus) => void) => () => void;
            getStatus: () => Promise<ConnectionStatus>;
          };
          tools: {
            onConfirmation: (cb: (req: any) => void) => () => void;
            respondConfirmation: (id: string, approved: boolean) => void;
          };
          platform: string;
        };
      }
    }
    
    export default function Chat({ onConnectionChange }: ChatProps) {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const [input, setInput] = useState("");
      const [loading, setLoading] = useState(false);
      const [sessionId, setSessionId] = useState<string | null>(null);
      const [connected, setConnected] = useState(false);
      const messagesEndRef = useRef<HTMLDivElement>(null);
      const cleanupRef = useRef<(() => void)[]>([]);
      const assistantBufferRef = useRef("");
    
      // Auto-scroll
      useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, [messages]);
    
      // Setup electron listeners
      useEffect(() => {
        const api = window.electronAPI;
        if (!api) return;
    
        // Connection status
        api.connection.getStatus().then((status) => {
          setConnected(status.connected);
          if (status.sessionId) setSessionId(status.sessionId);
          onConnectionChange(status.connected, status.sessionId);
        });
    
        const unsubConn = api.connection.onStatusChange((status) => {
          setConnected(status.connected);
          if (status.sessionId) setSessionId(status.sessionId);
          onConnectionChange(status.connected, status.sessionId);
          if (status.connected) {
            addSystemMessage("Conectado ao colabor-ai cloud");
          } else if (status.error) {
            addSystemMessage(`Conexao perdida: ${status.error}`);
          }
        });
        cleanupRef.current.push(unsubConn);
    
        // Stream chunks
        const unsubStream = api.stream.onChunk((chunk) => {
          switch (chunk.chunkType) {
            case "text":
              // Append to buffer and show in message
              assistantBufferRef.current += chunk.content;
              updateLastAssistantMessage(assistantBufferRef.current);
              break;
            case "tool_call":
              addSystemMessage(`[Tool: ${chunk.agent || "?"}] ${chunk.content.slice(0, 120)}`);
              break;
            case "progress":
              // Could update a progress bar
              break;
            case "end":
              assistantBufferRef.current = "";
              setLoading(false);
              break;
            case "error":
              addSystemMessage(`Erro: ${chunk.content}`);
              setLoading(false);
              break;
          }
        });
        cleanupRef.current.push(unsubStream);
    
        // Tool confirmations
        const unsubConfirm = api.tools.onConfirmation((req) => {
          const approved = window.confirm(
            `[Permissao] O assistente quer executar:\n\n` +
            `${req.agent}/${req.tool}\n` +
            `${req.description}\n\n` +
            `Permitir?`
          );
          api.tools.respondConfirmation(req.id, approved);
          if (!approved) {
            addSystemMessage(`Operacao bloqueada: ${req.description}`);
          }
        });
        cleanupRef.current.push(unsubConfirm);
    
        return () => {
          cleanupRef.current.forEach((fn) => fn());
          cleanupRef.current = [];
        };
      }, []);
    
      function updateLastAssistantMessage(content: string) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("stream-")) {
            // Update existing streaming message
            return [
              ...prev.slice(0, -1),
              { ...last, content },
            ];
          }
          // Create new streaming message
          return [
            ...prev,
            { id: `stream-${Date.now()}`, role: "assistant", content, timestamp: Date.now() },
          ];
        });
      }
    
      const addSystemMessage = (content: string) => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "system", content, timestamp: Date.now() },
        ]);
      };
    
      const addMessage = (role: "user" | "assistant", content: string) => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
        ]);
      };
    
      const handleSend = async () => {
        const text = input.trim();
        if (!text || loading) return;
    
        addMessage("user", text);
        setInput("");
        setLoading(true);
    
        const api = window.electronAPI;
    
        if (api && connected) {
          // Send via Electron WebSocket
          const result = await api.chat.send(text);
          if (result.error) {
            addSystemMessage(`Erro: ${result.error}`);
            setLoading(false);
          }
        } else {
          // Fallback: REST API (browser mode)
          await sendViaREST(text);
          setLoading(false);
        }
      };
    
      const sendViaREST = async (message: string) => {
        try {
          const CLOUD_URL = "http://localhost:3001";
          // Auto-login
          const authRes = await fetch(`${CLOUD_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: "colabor-ai-local-client-key-2024" }),
          });
          const auth = await authRes.json();
          if (!auth.token) throw new Error("Auth failed");
    
          const res = await fetch(`${CLOUD_URL}/chat/message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({ message, sessionId: auth.sessionId }),
          });
          const data = await res.json();
          if (data.finalResponse) {
            addMessage("assistant", data.finalResponse);
          }
          if (data.responses) {
            for (const r of data.responses) {
              if (r.type === "tool_call") {
                addSystemMessage(`[${r.agent}] ${r.content.slice(0, 100)}`);
              }
            }
          }
        } catch (err: any) {
          addSystemMessage(`Erro: ${err.message}`);
        }
      };
    
      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      };
    
      return (
        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="message system">
                Bem-vindo ao colabor-ai! Digite sua pergunta abaixo.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="message assistant">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
    
          <div className="chat-input-container">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem... (Enter para enviar)"
              rows={1}
              disabled={loading}
            />
            <button className="send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
              Enviar
            </button>
          </div>
        </div>
      );
    }
    