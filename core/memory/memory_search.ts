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
    
    import * as fsp from "fs/promises";
    import * as path from "path";
    import { logger } from "../utils/logger";
    
    const MEMORY_DIR = path.join(process.cwd(), "memory");
    const MEMORY_FILE = path.join(process.cwd(), "MEMORY.md");
    
    async function ensureMemoryDir(): Promise<void> {
          try {
            await fsp.access(MEMORY_DIR);
          } catch {
            await fsp.mkdir(MEMORY_DIR, { recursive: true });
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
    export async function memorySearch(query: string, maxResults: number = 10): Promise<MemoryEntry[]> {
      const results: MemoryEntry[] = [];
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    
      // Search MEMORY.md
      try {
        const content = await fsp.readFile(MEMORY_FILE, "utf-8");
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
      } catch {
        // MEMORY.md not found
      }
    
      // Search memory/ directory
      await ensureMemoryDir();
      let files: string[];
      try {
        files = (await fsp.readdir(MEMORY_DIR)).filter((f) => f.endsWith(".md"));
      } catch {
        files = [];
      }
      for (const file of files) {
        const content = await fsp.readFile(path.join(MEMORY_DIR, file), "utf-8");
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
    export async function readMemoryFile(): Promise<string> {
          try {
            return await fsp.readFile(MEMORY_FILE, "utf-8");
          } catch {
            return "";
          }
        }
    
    /**
     * Adiciona uma entrada ao MEMORY.md
     */
    export async function appendToMemory(content: string, section?: string): Promise<void> {
          const timestamp = new Date().toISOString().split("T")[0];
          const entry = section
            ? `\n## ${section}\n- [${timestamp}] ${content}\n`
            : `\n- [${timestamp}] ${content}\n`;
        
          await fsp.appendFile(MEMORY_FILE, entry, "utf-8");
          logger.info(`[Memory] Entry added to MEMORY.md: ${content.slice(0, 60)}`);
        }
    
    /**
     * Escreve uma nota diaria em memory/YYYY-MM-DD.md
     */
    export async function writeDailyNote(content: string): Promise<string> {
          await ensureMemoryDir();
          const today = new Date().toISOString().split("T")[0];
          const filePath = path.join(MEMORY_DIR, `${today}.md`);
        
          const entry = `## ${new Date().toLocaleTimeString("pt-BR")}\n${content}\n\n`;
          await fsp.appendFile(filePath, entry, "utf-8");
          logger.info(`[Memory] Daily note written: memory/${today}.md`);
          return filePath;
        }
    
    /**
     * Obtem notas diarias recentes
     */
    export async function getRecentDailyNotes(days: number = 7): Promise<Map<string, string>> {
          await ensureMemoryDir();
          const notes = new Map<string, string>();
          let files: string[];
          try {
            files = (await fsp.readdir(MEMORY_DIR)).filter((f) => f.endsWith(".md"));
          } catch {
            files = [];
          }
          const recentFiles = files.slice(-days);
        
          for (const file of recentFiles) {
            const content = await fsp.readFile(path.join(MEMORY_DIR, file), "utf-8").catch(() => "");
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
    export async function saveDailyNote(content: string): Promise<void> {
          await ensureMemoryDir();
          const filePath = getDailyNotePath();
        
          try {
            await fsp.access(filePath);
            // Append ao arquivo existente
            const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
            const entry = `\n### ${timestamp}\n\n${content.trim()}\n`;
            await fsp.appendFile(filePath, entry, "utf-8");
            logger.info(`[Memory] Nota adicionada a ${path.basename(filePath)}`);
          } catch {
            // Criar novo arquivo com cabecalho
            const header = `# Notas Diarias - ${path.basename(filePath).replace('.md', '')}\n\n`;
            const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
            const entry = `### ${timestamp}\n\n${content.trim()}\n`;
            await fsp.writeFile(filePath, header + entry, "utf-8");
            logger.info(`[Memory] Novo arquivo de notas criado: ${path.basename(filePath)}`);
          }
        }
    
    /**
     * Carrega as notas do dia atual e do dia anterior para contexto.
     * Retorna o conteudo concatenado.
     */
    export async function loadRecentNotes(): Promise<string> {
          await ensureMemoryDir();
        
          const today = getDailyNotePath();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yYear = yesterday.getFullYear();
          const yMonth = String(yesterday.getMonth() + 1).padStart(2, "0");
          const yDay = String(yesterday.getDate()).padStart(2, "0");
          const yesterdayPath = path.join(MEMORY_DIR, `${yYear}-${yMonth}-${yDay}.md`);
        
          let result = "";
        
          const yesterdayContent = await fsp.readFile(yesterdayPath, "utf-8").catch(() => "");
          if (yesterdayContent) {
            result += `\n--- Notas de ${yYear}-${yMonth}-${yDay}: ---\n`;
            result += yesterdayContent.substring(0, 500);
            if (yesterdayContent.length > 500) result += "\n[...]";
            result += "\n";
          }
        
          const todayContent = await fsp.readFile(today, "utf-8").catch(() => "");
          if (todayContent) {
            result += `\n--- Notas de hoje (${path.basename(today).replace('.md', '')}): ---\n`;
            result += todayContent.substring(0, 1000);
            if (todayContent.length > 1000) result += "\n[...]";
            result += "\n";
          }
        
          return result;
        }
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
        await appendToMemory(content, sectionName);
        return {
          success: true,
          message: `Entrada adicionada na secao "${sectionName}"`,
          content
        };
      }
    };


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
      async handler({ query, maxResults }: { query: string; maxResults?: number }) {
        const results = await memorySearch(query, maxResults ?? 5);
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
    
    

