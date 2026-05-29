/**
 * @deprecated Use MemoryEngine (core/memory/memory-engine.ts) instead.
 * Este arquivo sera removido em versoes futuras.
 */
/**
     * memory_search - Busca textual na memoria de longo prazo
     *
     * Inspirado no OpenClaw memory_search (docs/concepts/memory.md)
     * Ferramenta para agentes consultarem memorias persistentes.
     * 
     * Arquivos de memoria:
     * - MEMORY.md (raiz): fatos duradouros
     * - memory/YYYY-MM-DD.md: notas diarias
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    
    const MEMORY_DIR = path.join(process.cwd(), "memory");
    const MEMORY_FILE = path.join(process.cwd(), "MEMORY.md");
    
    function ensureMemoryDir(): void {
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }
    }
    
    interface MemoryEntry {
      file: string;
      line: number;
      content: string;
      score: number;
      date?: string;
    }
    
    /**
     * Busca termos no MEMORY.md e nos arquivos de memoria diaria
     */
    export function memorySearch(query: string, maxResults: number = 10): MemoryEntry[] {
      const results: MemoryEntry[] = [];
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    
      // Search MEMORY.md
      if (fs.existsSync(MEMORY_FILE)) {
        const content = fs.readFileSync(MEMORY_FILE, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          const matchCount = terms.filter((t) => line.includes(t)).length;
          if (matchCount > 0) {
            results.push({
              file: "MEMORY.md",
              line: i + 1,
              content: lines[i].trim(),
              score: matchCount / terms.length,
            });
          }
        }
      }
    
      // Search memory/ directory
      ensureMemoryDir();
      const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          const matchCount = terms.filter((t) => line.includes(t)).length;
          if (matchCount > 0) {
            results.push({
              file: `memory/${file}`,
              line: i + 1,
              content: lines[i].trim(),
              score: matchCount / terms.length,
              date: file.replace(/\.md$/, ""),
            });
          }
        }
      }
    
      // Sort by score and limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, maxResults);
    }
    
    /**
     * Le o conteudo completo de MEMORY.md
     */
    export function readMemoryFile(): string {
      if (fs.existsSync(MEMORY_FILE)) {
        return fs.readFileSync(MEMORY_FILE, "utf-8");
      }
      return "";
    }
    
    /**
     * Adiciona uma entrada ao MEMORY.md
     */
    export function appendToMemory(content: string, section?: string): void {
      const timestamp = new Date().toISOString().split("T")[0];
      const entry = section
        ? `\n## ${section}\n- [${timestamp}] ${content}\n`
        : `\n- [${timestamp}] ${content}\n`;
    
      fs.appendFileSync(MEMORY_FILE, entry, "utf-8");
      logger.info(`[Memory] Entry added to MEMORY.md: ${content.slice(0, 60)}`);
    }
    
    /**
     * Escreve uma nota diaria em memory/YYYY-MM-DD.md
     */
    export function writeDailyNote(content: string): string {
      ensureMemoryDir();
      const today = new Date().toISOString().split("T")[0];
      const filePath = path.join(MEMORY_DIR, `${today}.md`);
    
      const entry = `## ${new Date().toLocaleTimeString("pt-BR")}\n${content}\n\n`;
      fs.appendFileSync(filePath, entry, "utf-8");
      logger.info(`[Memory] Daily note written: memory/${today}.md`);
      return filePath;
    }
    
    /**
     * Obtem notas diarias recentes
     */
    export function getRecentDailyNotes(days: number = 7): Map<string, string> {
      ensureMemoryDir();
      const notes = new Map<string, string>();
      const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
      const recentFiles = files.slice(-days);
    
      for (const file of recentFiles) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
        notes.set(file.replace("\.md$", ""), content);
      }
      return notes;
    }
    
    /**
     * Registra memory_search como uma tool no formato OpenAI function calling
     */
    
    /**
     * Gera o nome do arquivo de nota diaria no formato memory/YYYY-MM-DD.md
     */
    function getDailyNotePath(): string {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const filename = `${year}-${month}-${day}.md`;
      return path.join(MEMORY_DIR, filename);
    }
    
    /**
     * Salva uma nota diaria no arquivo memory/YYYY-MM-DD.md
     * Se o arquivo ja existe, faz append. Senao, cria com cabecalho.
     */
    export function saveDailyNote(content: string): void {
      ensureMemoryDir();
      const filePath = getDailyNotePath();
    
      if (fs.existsSync(filePath)) {
        // Append ao arquivo existente
        const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
        const entry = `\n### ${timestamp}\n\n${content.trim()}\n`;
        fs.appendFileSync(filePath, entry, "utf-8");
        logger.info(`[Memory] Nota adicionada a ${path.basename(filePath)}`);
      } else {
        // Criar novo arquivo com cabecalho
        const header = `# Notas Diarias - ${path.basename(filePath).replace('.md', '')}\n\n`;
        const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
        const entry = `### ${timestamp}\n\n${content.trim()}\n`;
        fs.writeFileSync(filePath, header + entry, "utf-8");
        logger.info(`[Memory] Novo arquivo de notas criado: ${path.basename(filePath)}`);
      }
    }
    
    /**
     * Carrega as notas do dia atual e do dia anterior para contexto.
     * Retorna o conteudo concatenado.
     */
    export function loadRecentNotes(): string {
      ensureMemoryDir();
    
      const today = getDailyNotePath();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
      const yDay = String(yesterday.getDate()).padStart(2, "0");
      const yesterdayPath = path.join(MEMORY_DIR, `${yYear}-${yMonth}-${yDay}.md`);
    
      let result = "";
    
      if (fs.existsSync(yesterdayPath)) {
        const content = fs.readFileSync(yesterdayPath, "utf-8");
        // So pegar as primeiras linhas (resumo) - limitar a 500 chars
        result += `\n--- Notas de ${yYear}-${yMonth}-${yDay}: ---\n`;
        result += content.substring(0, 500);
        if (content.length > 500) result += "\n[...]";
        result += "\n";
      }
    
      if (fs.existsSync(today)) {
        const content = fs.readFileSync(today, "utf-8");
        result += `\n--- Notas de hoje (${path.basename(today).replace('.md', '')}): ---\n`;
        result += content.substring(0, 1000);
        if (content.length > 1000) result += "\n[...]";
        result += "\n";
      }
    
      return result;
    }
    

export const memorySearchTool = {
      type: "function",
      function: {
        name: "memory_search",
        description: "Busca informacoes na memoria de longo prazo (MEMORY.md e notas diarias)",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Termo de busca (ex: 'arquitetura agents preferencias')",
            },
            maxResults: {
              type: "number",
              description: "Numero maximo de resultados (default: 5)",
            },
          },
          required: ["query"],
        },
      },
      handler: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
        const results = memorySearch(query, maxResults ?? 5);
        return {
          success: true,
          results,
          count: results.length,
          message:
            results.length > 0
              ? `Encontrados ${results.length} resultados.`
              : "Nenhum resultado encontrado.",
        };
      },
    };
    

    
    // ============================================================
    // memory_append tool - Adiciona entradas a memoria
    // ============================================================
    
    export const memoryAppendTool = {
      type: "function",
      function: {
        name: "memory_append",
        description: "Adiciona uma nova entrada a memoria de longo prazo (MEMORY.md). Use para salvar preferencias, decisoes, fatos e aprendizados.",
        parameters: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Conteudo a ser salvo na memoria"
            },
            section: {
              type: "string",
              description: "Secao onde salvar: Preferencias, Decisoes, Aprendizados, ou Geral (default: Aprendizados)"
            }
          },
          required: ["content"]
        }
      },
    
      async handler({ content, section }: { content: string; section?: string }) {
        const sectionName = section || "Aprendizados";
        appendToMemory(content, sectionName);
        return {
          success: true,
          message: `Entrada adicionada na secao "${sectionName}"`,
          content
        };
      }
    };
    