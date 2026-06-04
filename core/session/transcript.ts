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
         * v3: Toda E/S agora assincrona (fs.promises).
         *     getRecentMessages() usa reverse-read para ler apenas as ultimas N linhas.
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
    
        // ============================================================
        // Helpers de E/S assincrona
        // ============================================================
    
        async function fileExists(filePath: string): Promise<boolean> {
          try {
            await fs.promises.access(filePath);
            return true;
          } catch {
            return false;
          }
        }
    
        async function ensureSessionsDir(): Promise<void> {
          try {
            await fs.promises.mkdir(SESSIONS_DIR, { recursive: true });
          } catch {
            // Diretorio ja existe, ignorar
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
        async function ensureHeader(sessionId: string): Promise<void> {
          const filePath = getSessionPath(sessionId);
          await ensureSessionsDir();
    
          try {
            const stats = await fs.promises.stat(filePath);
            if (stats.size === 0) {
              // Arquivo vazio - escrever header
              const header = createSessionHeader(sessionId);
              await fs.promises.writeFile(filePath, JSON.stringify(header) + "\n", "utf-8");
              return;
            }
          } catch (err: any) {
            if (err.code === "ENOENT") {
              // Arquivo nao existe - criar com header
              const header = createSessionHeader(sessionId);
              await fs.promises.writeFile(filePath, JSON.stringify(header) + "\n", "utf-8");
              return;
            }
            throw err;
          }
    
          // Arquivo existe - verificar se ja tem header
          const content = await fs.promises.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0];
          if (!parseHeaderLine(firstLine)) {
            // Arquivo existe mas sem header - adicionar header no inicio
            const header = createSessionHeader(sessionId);
            const remaining = content.trim() ? content : "";
            await fs.promises.writeFile(filePath, JSON.stringify(header) + "\n" + remaining, "utf-8");
          }
        }
    
        // ============================================================
        // Operacoes de leitura/escrita
        // ============================================================
    
        /**
         * Salva uma mensagem no transcript da sessao (append).
         * Garante que o header exista antes de append.
         */
        export async function appendToTranscript(
          sessionId: string,
          message: TranscriptMessage
        ): Promise<void> {
          await ensureSessionsDir();
          const filePath = getSessionPath(sessionId);
    
          // Garantir header
          await ensureHeader(sessionId);
    
          const line = JSON.stringify(message) + "\n";
          await fs.promises.appendFile(filePath, line, "utf-8");
        }
    
        /**
         * Carrega todo o transcript de uma sessao, ignorando o header.
         * Suporta arquivos antigos (sem header) como fallback (versao 0).
         */
        export async function loadSessionTranscript(
          sessionId: string
        ): Promise<TranscriptMessage[]> {
          const filePath = getSessionPath(sessionId);
    
          if (!(await fileExists(filePath))) {
            return [];
          }
    
          const content = await fs.promises.readFile(filePath, "utf-8");
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
        export async function getSessionHeader(sessionId: string): Promise<SessionHeader | null> {
          const filePath = getSessionPath(sessionId);
    
          if (!(await fileExists(filePath))) return null;
    
          const content = await fs.promises.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0];
          return parseHeaderLine(firstLine);
        }
    
        /**
         * Salva multiplas mensagens de uma vez, com header versionado.
         */
        export async function saveSessionTranscript(
          sessionId: string,
          messages: TranscriptMessage[],
          parentSession?: string
        ): Promise<void> {
          await ensureSessionsDir();
          const filePath = getSessionPath(sessionId);
    
          const header = createSessionHeader(sessionId, parentSession);
          const headerLine = JSON.stringify(header) + "\n";
          const messageLines = messages.map((m) => JSON.stringify(m)).join("\n");
    
          await fs.promises.writeFile(filePath, headerLine + messageLines + "\n", "utf-8");
        }
    
        /**
         * Obtem as ultimas N mensagens da sessao (ignorando header).
         *
         * Usa reverse-read: le apenas os ultimos bytes do arquivo ao inves
         * de carregar o arquivo inteiro. Eficiente para sessoes longas.
         */
        export async function getRecentMessages(
          sessionId: string,
          count: number = 20
        ): Promise<TranscriptMessage[]> {
          const filePath = getSessionPath(sessionId);
    
          let fileHandle: fs.promises.FileHandle | null = null;
          try {
            fileHandle = await fs.promises.open(filePath, "r");
          } catch {
            return [];
          }
    
          try {
            const stats = await fileHandle.stat();
            const fileSize = stats.size;
            if (fileSize === 0) return [];
    
            const CHUNK_SIZE = 8192; // 8KB chunks
            let data = "";
            let pos = fileSize;
            // Precisamos do header (1 linha) + count mensagens = aprox count + 1 linhas
            // Margem de seguranca: count + 10
            let lineCount = 0;
            const targetLines = count + 10;
    
            while (pos > 0) {
              const chunkSize = Math.min(CHUNK_SIZE, pos);
              pos -= chunkSize;
    
              const buf = Buffer.alloc(chunkSize);
              await fileHandle.read(buf, 0, chunkSize, pos);
              data = buf.toString("utf-8") + data;
    
              lineCount = data.split("\n").length;
              if (lineCount >= targetLines) break;
            }
    
            // Separar linhas e descartar ultimo elemento vazio (se houver trailing newline)
            const allLines = data.split("\n");
            const lines = allLines.filter(Boolean);
    
            if (lines.length === 0) return [];
    
            // Identificar se a primeira linha capturada e um header
            let startIdx = 0;
            const header = parseHeaderLine(lines[0]);
            if (header) {
              startIdx = 1;
            }
    
            // Pegar apenas as ultimas `count` mensagens
            const messageLines = lines.slice(startIdx);
            const relevantLines = messageLines.slice(-Math.min(count, messageLines.length));
    
            const messages: TranscriptMessage[] = [];
            for (const line of relevantLines) {
              try {
                const msg = JSON.parse(line) as TranscriptMessage;
                if (msg.role && msg.content !== undefined) {
                  messages.push(msg);
                }
              } catch {
                // Linhas corrompidas no final do chunk sao ignoradas
                continue;
              }
            }
    
            return messages;
          } finally {
            if (fileHandle) await fileHandle.close();
          }
        }
    
        /**
         * Compacta o historico: mantem apenas as ultimas N mensagens
         * e preserva o header da sessao.
         */
        export async function compactTranscript(
          sessionId: string,
          keepCount: number = 30
        ): Promise<{ kept: number; compacted: number }> {
          const all = await loadSessionTranscript(sessionId);
          if (all.length <= keepCount + 5) {
            return { kept: all.length, compacted: 0 };
          }
    
          // Safe truncation: garante que tool messages nao fiquem orfas
          let startIdx = Math.max(0, all.length - keepCount);
    
          if (startIdx < all.length && all[startIdx]?.role === "tool") {
            let scanIdx = startIdx - 1;
            while (scanIdx >= 0 && all[scanIdx]?.role === "tool") {
              scanIdx--;
            }
            if (scanIdx >= 0 && all[scanIdx]?.role === "assistant") {
              startIdx = scanIdx;
            } else {
              while (startIdx < all.length && all[startIdx]?.role === "tool") {
                startIdx++;
              }
            }
          }
    
          const toKeep = all.slice(startIdx);
          const compacted = all.length - toKeep.length;
    
          const existingHeader = await getSessionHeader(sessionId);
          await saveSessionTranscript(sessionId, toKeep, existingHeader?.parentSession);
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
        export async function listSessions(): Promise<string[]> {
          await ensureSessionsDir();
          const files = await fs.promises.readdir(SESSIONS_DIR);
          return files
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => f.replace(".jsonl", ""));
        }
    
        /**
         * Deleta o transcript de uma sessao.
         * Renomeia para .deleted ao inves de deletar (seguranca).
         */
        export async function deleteSession(sessionId: string): Promise<boolean> {
          const filePath = getSessionPath(sessionId);
          if (await fileExists(filePath)) {
            await fs.promises.rename(filePath, filePath + ".deleted." + Date.now());
            return true;
          }
          return false;
        }
    
        /**
         * Migra um arquivo antigo (sem header) para o novo formato.
         * Adiciona o header preservando todas as mensagens existentes.
         */
        export async function migrateSessionToV1(sessionId: string): Promise<boolean> {
          const filePath = getSessionPath(sessionId);
          if (!(await fileExists(filePath))) return false;
    
          const content = await fs.promises.readFile(filePath, "utf-8");
          const firstLine = content.split("\n")[0];
    
          // Ja tem header?
          if (parseHeaderLine(firstLine)) return false;
    
          // Adicionar header
          const header = createSessionHeader(sessionId);
          await fs.promises.writeFile(filePath, JSON.stringify(header) + "\n" + content, "utf-8");
          return true;
        }
    