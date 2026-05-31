/**
     * ToolSearch - Busca semantica de ferramentas disponiveis.
     *
     * Inspirado no ToolSearchTool do claude-code.
     * Permite ao agente descobrir tools em runtime por descricao em linguagem natural.
     * Usa TF-IDF simples como fallback (sem dependencia de embeddings).
     */
    
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface ToolIndexEntry {
      name: string;
      description: string;
      keywords: string[];
      category: string;
    }
    
    export interface ToolSearchResult {
      name: string;
      description: string;
      score: number;
      category: string;
    }
    
    // ============================================================
    // Indice de Tools
    // ============================================================
    
    const TOOL_INDEX: ToolIndexEntry[] = [
      {
        name: "spawn_agent",
        description: "Spawn a sub-agent to handle a specific task. Use for delegating complex sub-tasks to specialized agents.",
        keywords: ["delegate", "sub-agent", "parallel", "specialized", "task", "spawn", "agent"],
        category: "orchestration",
      },
      {
        name: "create_background_task",
        description: "Schedule a task to run in the background asynchronously.",
        keywords: ["background", "async", "schedule", "long-running", "autonomous"],
        category: "orchestration",
      },
      {
        name: "list_background_tasks",
        description: "List all background tasks and their statuses.",
        keywords: ["background", "status", "tasks", "list", "monitor"],
        category: "orchestration",
      },
      {
        name: "todo_write",
        description: "Manage an internal task list during execution. Track progress on complex multi-step tasks.",
        keywords: ["todo", "task", "list", "progress", "track", "checklist"],
        category: "productivity",
      },
      {
        name: "web_search",
        description: "Search the web using DuckDuckGo and return structured results.",
        keywords: ["search", "web", "internet", "google", "find", "lookup", "research"],
        category: "web",
      },
      {
        name: "schedule_task",
        description: "Schedule a recurring task using cron expressions.",
        keywords: ["schedule", "cron", "recurring", "periodic", "timer", "daily", "weekly"],
        category: "orchestration",
      },
      {
        name: "execute_python",
        description: "Execute Python code and return stdout/stderr.",
        keywords: ["python", "code", "execute", "run", "script", "calculation"],
        category: "execution",
      },
      {
        name: "browser_action",
        description: "Navigate web pages, click elements, fill forms, extract text, take screenshots.",
        keywords: ["browser", "web", "navigate", "click", "form", "screenshot", "scrape"],
        category: "web",
      },
      {
        name: "memory_search",
        description: "Search long-term memory for facts, preferences, and decisions.",
        keywords: ["memory", "remember", "recall", "past", "history", "context"],
        category: "memory",
      },
      {
        name: "create_activity",
        description: "Create a new activity/task in the system.",
        keywords: ["activity", "task", "create", "calendar", "schedule"],
        category: "productivity",
      },
      {
        name: "get_activities_by_day",
        description: "List activities for a specific day.",
        keywords: ["activity", "day", "list", "calendar", "agenda"],
        category: "productivity",
      },
      {
        name: "delete_activity",
        description: "Remove an activity.",
        keywords: ["activity", "delete", "remove", "task"],
        category: "productivity",
      },
    ];
    
    // ============================================================
    // TF-IDF Search Engine
    // ============================================================
    
    function tokenize(text: string): string[] {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
    }
    
    function computeTF(term: string, document: string[]): number {
      const count = document.filter((t) => t === term).length;
      return document.length > 0 ? count / document.length : 0;
    }
    
    function computeIDF(term: string, documents: string[][]): number {
      const docsWithTerm = documents.filter((doc) => doc.includes(term)).length;
      return Math.log((documents.length + 1) / (docsWithTerm + 1)) + 1;
    }
    
    // ============================================================
    // ToolSearch
    // ============================================================
    
    export class ToolSearch {
      private index: ToolIndexEntry[];
      private documentVectors: Map<string, string[]>;
    
      constructor() {
        this.index = TOOL_INDEX;
        this.documentVectors = new Map();
    
        // Pre-computar vetores de documento
        for (const entry of this.index) {
          const text = `${entry.name} ${entry.description} ${entry.keywords.join(" ")}`;
          this.documentVectors.set(entry.name, tokenize(text));
        }
      }
    
      /** Busca tools por query em linguagem natural */
      search(query: string, maxResults: number = 5): ToolSearchResult[] {
        const queryTerms = tokenize(query);
        if (queryTerms.length === 0) return [];
    
        const allDocs = Array.from(this.documentVectors.values());
        const results: ToolSearchResult[] = [];
    
        for (const entry of this.index) {
          const docVector = this.documentVectors.get(entry.name)!;
          let score = 0;
    
          // TF-IDF scoring
          for (const term of queryTerms) {
            const tf = computeTF(term, docVector);
            const idf = computeIDF(term, allDocs);
            score += tf * idf;
          }
    
          // Bonus para match exato no nome
          if (entry.name.toLowerCase().includes(query.toLowerCase())) {
            score += 2;
          }
    
          // Bonus para match em keywords
          for (const kw of entry.keywords) {
            if (query.toLowerCase().includes(kw)) {
              score += 0.5;
            }
          }
    
          if (score > 0) {
            results.push({
              name: entry.name,
              description: entry.description,
              score: Math.round(score * 100) / 100,
              category: entry.category,
            });
          }
        }
    
        return results
          .sort((a, b) => b.score - a.score)
          .slice(0, maxResults);
      }
    
      /** Retorna detalhes de uma tool especifica */
      getTool(name: string): ToolIndexEntry | undefined {
        return this.index.find((t) => t.name === name);
      }
    
      /** Lista todas as tools por categoria */
      listByCategory(): Record<string, ToolIndexEntry[]> {
        const categories: Record<string, ToolIndexEntry[]> = {};
        for (const entry of this.index) {
          if (!categories[entry.category]) {
            categories[entry.category] = [];
          }
          categories[entry.category].push(entry);
        }
        return categories;
      }
    
      /** Formata resultados para o prompt do agente */
      formatResults(results: ToolSearchResult[]): string {
        if (results.length === 0) return "No matching tools found.";
        return results
          .map(
            (r) =>
              `- **${r.name}** (${r.category}, score: ${r.score}): ${r.description}`
          )
          .join("\n");
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: ToolSearch | null = null;
    
    export function getToolSearch(): ToolSearch {
      if (!instance) {
        instance = new ToolSearch();
      }
      return instance;
    }
    
    export function searchTools(query: string): ToolSearchResult[] {
      return getToolSearch().search(query);
    }
    