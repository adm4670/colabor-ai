/**
     * Session Transcript - Persistencia de historico de conversa em JSONL
     *
     * Inspirado no OpenClaw session management (docs/concepts/session.md)
     * Substitui o historico em RAM por arquivos .jsonl no disco.
     *
     * v2: Schema versionado com header.
     *     Primeira linha: {"type":"session","version":1,"id":"...","timestamp":"..."}
     *     Linhas seguintes: mensagens no formato { role, content, timestamp, ... }
     *
     * Formato:
     *   Linha 1: header (SessionHeader)
     *   Linhas 2+: mensagens (TranscriptMessage)
     *
     * Localizacao: .colabor-ai/sessions/<sessionId>.jsonl
     */
    
    import * as fs from "fs";
    import * as path from "path";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface TranscriptMessage {
      role: "user" | "assistant" | "tool" | "system";
      content: string;
      name?: string;
      timestamp: number;
      tool_call_id?: string;
    }
    
    export interface SessionHeader {
      type: "session";
      version: number;
      id: string;
      timestamp: string;
      /** Sessao pai (para sub-sessoes / sub-agentes) */
      parentSession?: string;
    }
    
    /** Versao atual do schema de sessao */
    export const SESSION_VERSION = 1;
    
    // ============================================================
    // Constantes
    // ============================================================
    
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
    
    // ============================================================
    // Header
    // ============================================================
    
    /**
     * Cria o header padrao para uma nova sessao.
     */
    export function createSessionHeader(
      sessionId: string,
      parentSession?: string
    ): SessionHeader {
      return {
        type: "session",
        version: SESSION_VERSION,
        id: sessionId,
        timestamp: new Date().toISOString(),
        ...(parentSession ? { parentSession } : {}),
      };
    }
    
    /**
     * Verifica se a primeira linha de um arquivo e um header valido.
     * Retorna o header parseado ou null.
     */
    function parseHeaderLine(line: string): SessionHeader | null {
      try {
        const parsed = JSON.parse(line);
        if (
          parsed &&
          parsed.type === "session" &&
          typeof parsed.version === "number" &&
          typeof parsed.id === "string" &&
          typeof parsed.timestamp === "string"
        ) {
          return parsed as SessionHeader;
        }
      } catch {
        // Nao e JSON valido - provavelmente uma mensagem
      }
      return null;
    }
    
    /**
     * Garante que o arquivo da sessao tenha um header.
     * Se o arquivo nao existir ou estiver vazio, escreve o header.
     * Se ja tiver header, nao faz nada.
     */
    function ensureHeader(sessionId: string): void {
      const filePath = getSessionPath(sessionId);
      ensureSessionsDir();
    
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        const header = createSessionHeader(sessionId);
        fs.writeFileSync(filePath, JSON.stringify(header) + "\n", "utf-8");
        return;
      }
    
      // Verificar se ja tem header
      const content = fs.readFileSync(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
      if (!parseHeaderLine(firstLine)) {
        // Arquivo existe mas sem header - adicionar header no inicio
        // (backup implicito: lemos tudo e reescrevemos com header)
        const header = createSessionHeader(sessionId);
        const remaining = content.trim() ? content : "";
        fs.writeFileSync(filePath, JSON.stringify(header) + "\n" + remaining, "utf-8");
      }
    }
    
    // ============================================================
    // Operacoes de leitura/escrita
    // ============================================================
    
    /**
     * Salva uma mensagem no transcript da sessao (append).
     * Garante que o header exista antes de append.
     */
    export function appendToTranscript(
      sessionId: string,
      message: TranscriptMessage
    ): void {
      ensureSessionsDir();
      const filePath = getSessionPath(sessionId);
    
      // Garantir header
      ensureHeader(sessionId);
    
      const line = JSON.stringify(message) + "\n";
      fs.appendFileSync(filePath, line, "utf-8");
    }
    
    /**
     * Carrega todo o transcript de uma sessao, ignorando o header.
     * Suporta arquivos antigos (sem header) como fallback (versao 0).
     */
    export function loadSessionTranscript(
      sessionId: string
    ): TranscriptMessage[] {
      const filePath = getSessionPath(sessionId);
      if (!fs.existsSync(filePath)) {
        return [];
      }
    
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
    
      if (lines.length === 0) return [];
    
      const messages: TranscriptMessage[] = [];
      let startIndex = 0;
    
      // Tentar parse da primeira linha como header
      const header = parseHeaderLine(lines[0]);
      if (header) {
        // Se for header, pular a primeira linha
        if (header.version > SESSION_VERSION) {
          console.warn(
            `[Transcript] Session ${sessionId} has version ${header.version} (current: ${SESSION_VERSION}). ` +
            `Attempting to read anyway - some fields may be missing.`
          );
        }
        startIndex = 1;
      }
      // Se nao for header, processa todas as linhas como mensagens (fallback)
    
      for (let i = startIndex; i < lines.length; i++) {
        try {
          const msg = JSON.parse(lines[i]) as TranscriptMessage;
          // Validacao basica
          if (msg.role && msg.content !== undefined) {
            messages.push(msg);
          }
        } catch {
          // Skip malformed lines
          continue;
        }
      }
    
      return messages;
    }
    
    /**
     * Le o header de uma sessao sem carregar as mensagens.
     * Retorna null se o arquivo nao existir ou nao tiver header.
     */
    export function getSessionHeader(sessionId: string): SessionHeader | null {
      const filePath = getSessionPath(sessionId);
      if (!fs.existsSync(filePath)) return null;
    
      const content = fs.readFileSync(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
      return parseHeaderLine(firstLine);
    }
    
    /**
     * Salva multiplas mensagens de uma vez, com header versionado.
     */
    export function saveSessionTranscript(
      sessionId: string,
      messages: TranscriptMessage[],
      parentSession?: string
    ): void {
      ensureSessionsDir();
      const filePath = getSessionPath(sessionId);
    
      const header = createSessionHeader(sessionId, parentSession);
      const headerLine = JSON.stringify(header) + "\n";
      const messageLines = messages.map((m) => JSON.stringify(m)).join("\n");
    
      fs.writeFileSync(filePath, headerLine + messageLines + "\n", "utf-8");
    }
    
    /**
     * Obtem as ultimas N mensagens da sessao (ignorando header).
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
     * e preserva o header da sessao.
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
    
      // Preservar o header original
      const existingHeader = getSessionHeader(sessionId);
      saveSessionTranscript(sessionId, toKeep, existingHeader?.parentSession);
      return { kept: toKeep.length, compacted };
    }
    
    /**
     * Gera um ID de sessao baseado em timestamp + random.
     */
    export function generateSessionId(prefix: string = "session"): string {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    
    /**
     * Lista todas as sessoes disponiveis.
     */
    export function listSessions(): string[] {
      ensureSessionsDir();
      return fs
        .readdirSync(SESSIONS_DIR)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.replace(".jsonl", ""));
    }
    
    /**
     * Deleta o transcript de uma sessao.
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
    
    /**
     * Migra um arquivo antigo (sem header) para o novo formato.
     * Adiciona o header preservando todas as mensagens existentes.
     */
    export function migrateSessionToV1(sessionId: string): boolean {
      const filePath = getSessionPath(sessionId);
      if (!fs.existsSync(filePath)) return false;
    
      const content = fs.readFileSync(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
    
      // Ja tem header?
      if (parseHeaderLine(firstLine)) return false;
    
      // Adicionar header
      const header = createSessionHeader(sessionId);
      fs.writeFileSync(filePath, JSON.stringify(header) + "\n" + content, "utf-8");
      return true;
    }
    