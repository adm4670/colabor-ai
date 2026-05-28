/**
     * Session Transcript - Persistencia de historico de conversa em JSONL
     *
     * Inspirado no OpenClaw session management (docs/concepts/session.md)
     * Substitui o historico em RAM por arquivos .jsonl no disco.
     *
     * Formato: cada linha e um JSON com { role, content, timestamp }
     * Localizacao: .colabor-ai/sessions/<sessionId>.jsonl
     */
    
    import * as fs from "fs";
    import * as path from "path";
    
    export interface TranscriptMessage {
      role: "user" | "assistant" | "tool" | "system";
      content: string;
      name?: string;
      timestamp: number;
      tool_call_id?: string;
    }
    
    const SESSIONS_DIR = path.join(process.cwd(), ".colabor-ai", "sessions");
    
    function ensureSessionsDir(): void {
      if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      }
    }
    
    function getSessionPath(sessionId: string): string {
      // Sanitize sessionId for filesystem
      const safeId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
      return path.join(SESSIONS_DIR, `${safeId}.jsonl`);
    }
    
    /**
     * Salva uma mensagem no transcript da sessao (append)
     */
    export function appendToTranscript(
      sessionId: string,
      message: TranscriptMessage
    ): void {
      ensureSessionsDir();
      const filePath = getSessionPath(sessionId);
      const line = JSON.stringify(message) + "\n";
      fs.appendFileSync(filePath, line, "utf-8");
    }
    
    /**
     * Carrega todo o transcript de uma sessao
     */
    export function loadSessionTranscript(
      sessionId: string
    ): TranscriptMessage[] {
      const filePath = getSessionPath(sessionId);
      if (!fs.existsSync(filePath)) {
        return [];
      }
      const content = fs.readFileSync(filePath, "utf-8");
      const messages: TranscriptMessage[] = [];
      for (const line of content.split("\n").filter(Boolean)) {
        try {
          const msg = JSON.parse(line) as TranscriptMessage;
          messages.push(msg);
        } catch {
          // Skip malformed lines
          continue;
        }
      }
      return messages;
    }
    
    /**
     * Salva multiplas mensagens de uma vez (ex: no final de uma execucao)
     */
    export function saveSessionTranscript(
      sessionId: string,
      messages: TranscriptMessage[]
    ): void {
      ensureSessionsDir();
      const filePath = getSessionPath(sessionId);
      const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
      fs.writeFileSync(filePath, lines, "utf-8");
    }
    
    /**
     * Obtem as ultimas N mensagens da sessao
     */
    export function getRecentMessages(
      sessionId: string,
      count: number = 20
    ): TranscriptMessage[] {
      const all = loadSessionTranscript(sessionId);
      return all.slice(-count);
    }
    
    /**
     * Compacta o historico: mantem apenas as ultimas N mensagens
     * e salva um resumo das mais antigas
     */
    export function compactTranscript(
      sessionId: string,
      keepCount: number = 30
    ): { kept: number; compacted: number } {
      const all = loadSessionTranscript(sessionId);
      if (all.length <= keepCount + 5) {
        return { kept: all.length, compacted: 0 };
      }
      const toKeep = all.slice(-keepCount);
      const compacted = all.length - toKeep.length;
      saveSessionTranscript(sessionId, toKeep);
      return { kept: toKeep.length, compacted };
    }
    
    /**
     * Gera um ID de sessao simple baseado em timestamp + random
     */
    export function generateSessionId(prefix: string = "session"): string {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    
    /**
     * Lista todas as sessoes disponiveis
     */
    export function listSessions(): string[] {
      ensureSessionsDir();
      return fs
        .readdirSync(SESSIONS_DIR)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.replace(".jsonl", ""));
    }
    
    /**
     * Deleta o transcript de uma sessao
     */
    export function deleteSession(sessionId: string): boolean {
      const filePath = getSessionPath(sessionId);
      if (fs.existsSync(filePath)) {
        // Renomeia para .deleted ao inves de deletar (seguranca)
        fs.renameSync(filePath, filePath + ".deleted." + Date.now());
        return true;
      }
      return false;
    }
    