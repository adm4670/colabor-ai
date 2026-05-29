/**
     * SkillsManager - Sistema de Skills para o agente
     *
     * Skills sao instrucoes em Markdown que expandem as capacidades
     * do agente sob demanda. Cada skill e um arquivo .md na pasta skills/.
     *
     * v2: Suporte a frontmatter YAML (formato SKILL.md do OpenClaw).
     *     Fallback para o formato antigo (secoes ## Keywords, ## Descricao).
     *
     * Formato esperado (recomendado):
     *   ---
     *   name: my-skill
     *   description: "Descricao curta do skill"
     *   keywords:
     *     - palavra1
     *     - palavra2
     *   ---
     *   # Titulo da Skill
     *   ... conteudo ...
     *
     * Inspirado no sistema de Skills do OpenClaw.
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export interface Skill {
      /** Nome extraido do frontmatter (name) ou do arquivo */
      name: string;
      /** Titulo extraido do frontmatter (title) ou do primeiro heading */
      title: string;
      /** Descricao extraida do frontmatter (description) ou do texto */
      description: string;
      /** Conteudo completo do skill (inclui frontmatter) */
      content: string;
      /** Corpo do skill sem o frontmatter */
      body: string;
      /** Palavras-chave para matching */
      keywords: string[];
      /** Caminho do arquivo */
      filePath: string;
    }
    
    export interface SkillsConfig {
      skillsDir: string;
      maxSkills: number;
      minScore: number;
    }
    
    // ============================================================
    // YAML Frontmatter Parser (sem dependencias externas)
    // ============================================================
    
    interface SkillFrontmatter {
      name?: string;
      title?: string;
      description?: string;
      keywords?: string[];
      [key: string]: unknown;
    }
    
    /**
     * Extrai e faz parse do frontmatter YAML entre marcadores ---.
     * Retorna { frontmatter, body } ou null se nao houver frontmatter.
     */
    function parseFrontmatter(raw: string): {
      frontmatter: SkillFrontmatter;
      body: string;
    } | null {
      const trimmed = raw.trimStart();
      if (!trimmed.startsWith("---")) return null;
    
      const endIdx = trimmed.indexOf("\n---", 3);
      if (endIdx === -1) return null;
    
      const fmBlock = trimmed.slice(3, endIdx).trim();
      const body = trimmed.slice(endIdx + 4).trim();
    
      const fm: SkillFrontmatter = {};
      const lines = fmBlock.split("\n");
      let currentKey: string | null = null;
      let currentList: string[] = [];
    
      function flushList(): void {
        if (currentKey && currentList.length > 0) {
          (fm as Record<string, unknown>)[currentKey] = [...currentList];
        }
        currentList = [];
        currentKey = null;
      }
    
      for (const line of lines) {
        // List item continuacao
        if (line.match(/^\s+-\s+(.+)/)) {
          if (currentKey) {
            const val = line.replace(/^\s+-\s+/, "").trim();
            // Remove aspas
            const clean = val.replace(/^["']|["']$/g, "");
            currentList.push(clean);
          }
          continue;
        }
    
        // Novo key: value
        const kvMatch = line.match(/^(\w[\w_-]*)\s*:\s*(.*)$/);
        if (kvMatch) {
          flushList();
          const key = kvMatch[1];
          let val = kvMatch[2].trim();
    
          if (val === "" || val === "|" || val === ">") {
            // Inicio de lista multilinha ou bloco
            currentKey = key;
            currentList = [];
          } else {
            // Valor inline - remove aspas
            val = val.replace(/^["']|["']$/g, "");
            (fm as Record<string, unknown>)[key] = val;
          }
        }
      }
      flushList(); // flush ultimo
    
      return { frontmatter: fm, body };
    }
    
    // ============================================================
    // SkillsManager
    // ============================================================
    
    const DEFAULT_CONFIG: SkillsConfig = {
      skillsDir: path.join(process.cwd(), "skills"),
      maxSkills: 3,
      minScore: 0.1,
    };
    
    export class SkillsManager {
      private config: SkillsConfig;
      private skillsCache: Skill[] | null = null;
      private lastLoadTime: number = 0;
      private readonly CACHE_TTL = 30_000; // 30 segundos
    
      constructor(config?: Partial<SkillsConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
      }
    
      /**
       * Carrega todas as skills do diretorio (com cache).
       * Suporta o novo formato SKILL.md (com frontmatter YAML)
       * e fallback para o formato antigo (secoes ## Keywords, ## Descricao).
       */
      loadAllSkills(): Skill[] {
        const now = Date.now();
        if (this.skillsCache && now - this.lastLoadTime < this.CACHE_TTL) {
          return this.skillsCache;
        }
    
        const skillsDir = this.config.skillsDir;
        const skills: Skill[] = [];
    
        try {
          if (!fs.existsSync(skillsDir)) {
            fs.mkdirSync(skillsDir, { recursive: true });
            logger.info(`[SkillsManager] Diretorio de skills criado: ${skillsDir}`);
            this.skillsCache = [];
            this.lastLoadTime = now;
            return [];
          }
    
          const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md") && !f.endsWith(".bak"));
    
          for (const file of files) {
            try {
              const filePath = path.join(skillsDir, file);
              const content = fs.readFileSync(filePath, "utf-8");
              const fileName = file.replace(/\.md$/, "");
    
              const parsed = parseFrontmatter(content);
    
              let name: string;
              let title: string;
              let description: string;
              let keywords: string[];
              let body: string;
    
              if (parsed) {
                // ==========================================
                // Formato NOVO: frontmatter YAML (SKILL.md)
                // ==========================================
                const fm = parsed.frontmatter;
                body = parsed.body;
    
                name = fm.name || fileName;
                title = fm.title || extractTitleFromBody(body) || name;
                description = fm.description || extractDescriptionLegacy(body) || "";
                keywords = fm.keywords || [];
    
                // Sempre incluir nome do arquivo e partes do nome como keywords
                const nameParts = name.split(/[-_\s]+/).filter((p) => p.length > 1);
                for (const part of nameParts) {
                  if (!keywords.includes(part.toLowerCase())) {
                    keywords.push(part.toLowerCase());
                  }
                }
                if (!keywords.includes(name.toLowerCase())) {
                  keywords.push(name.toLowerCase());
                }
              } else {
                // ==========================================
                // Formato ANTIGO: fallback (secoes markdown)
                // ==========================================
                body = content;
                name = fileName;
                title = extractTitleFromBody(content) || name;
                description = extractDescriptionLegacy(content);
                keywords = extractKeywordsLegacy(content, name);
              }
    
              skills.push({
                name,
                title,
                description,
                content,
                body,
                keywords,
                filePath,
              });
            } catch (err) {
              logger.warn(`[SkillsManager] Erro ao ler skill ${file}: ${err}`);
            }
          }
    
          logger.info(`[SkillsManager] ${skills.length} skills carregadas de ${skillsDir}`);
          this.skillsCache = skills;
          this.lastLoadTime = now;
          return skills;
        } catch (err) {
          logger.error(`[SkillsManager] Erro ao carregar skills: ${err}`);
          this.skillsCache = [];
          this.lastLoadTime = now;
          return [];
        }
      }
    
      /**
       * Filtra skills por relevancia ao contexto.
       * Usa correspondencia de palavras-chave com scoring.
       */
      loadRelevantSkills(context: string): string[] {
        const allSkills = this.loadAllSkills();
        if (allSkills.length === 0) return [];
    
        const contextLower = context.toLowerCase();
        const contextWords = new Set(
          contextLower.split(/[\s,.;!?_()\[\]{}]+/).filter((w) => w.length > 2)
        );
    
        const scored = allSkills.map((skill) => {
          let score = 0;
    
          // Match por palavra-chave no contexto
          for (const kw of skill.keywords) {
            if (contextLower.includes(kw)) {
              score += 0.3;
            }
          }
    
          // Match por palavras do contexto no titulo/descricao
          const titleDesc = (skill.title + " " + skill.description).toLowerCase();
          for (const word of contextWords) {
            if (titleDesc.includes(word)) {
              score += 0.15;
            }
            // Match no body
            if (skill.body.toLowerCase().includes(word)) {
              score += 0.05;
            }
          }
    
          return { skill, score };
        });
    
        const relevant = scored
          .filter((s) => s.score >= this.config.minScore)
          .sort((a, b) => b.score - a.score)
          .slice(0, this.config.maxSkills);
    
        if (relevant.length > 0) {
          logger.info(
            `[SkillsManager] Skills relevantes: ${relevant
              .map((s) => `${s.skill.name} (score: ${s.score.toFixed(2)})`)
              .join(", ")}`
          );
        }
    
        // Retorna o conteudo completo (com frontmatter, para compatibilidade)
        return relevant.map((s) => s.skill.content);
      }
    
      /**
       * Retorna a descricao de todas as skills para inclusao no system prompt.
       */
      getAllSkillsInstructions(): string {
        const allSkills = this.loadAllSkills();
        if (allSkills.length === 0) return "";
    
        return allSkills
          .map((skill) => `- **${skill.title}**: ${skill.description}`)
          .join("\n");
      }
    
      /**
       * Retorna os nomes das skills disponiveis.
       */
      listSkills(): { name: string; title: string; description: string }[] {
        return this.loadAllSkills().map((s) => ({
          name: s.name,
          title: s.title,
          description: s.description,
        }));
      }
    
      /**
       * Forca o recarregamento do cache.
       */
      refreshCache(): void {
        this.skillsCache = null;
        this.lastLoadTime = 0;
      }
    
      /**
       * Cria skills padrao se o diretorio estiver vazio.
       */
      createDefaultSkills(): void {
        const skillsDir = this.config.skillsDir;
        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }
    
        const existing = fs.readdirSync(skillsDir).filter(
          (f) => f.endsWith(".md") && !f.endsWith(".bak")
        );
        if (existing.length > 0) return;
    
        logger.info("[SkillsManager] Diretorio de skills vazio. Use 'skills/' para adicionar skills.");
      }
    
      /**
       * Carrega skills baseadas no contexto da tarefa atual.
       */
      loadSkillsForTask(userInput: string, currentContext?: string): string[] {
        const combinedContext = `${userInput} ${currentContext || ""}`;
        return this.loadRelevantSkills(combinedContext);
      }
    
      /**
       * Retorna sumario de todas as skills.
       */
      getSkillsSummary(): string {
        const skills = this.loadAllSkills();
        if (skills.length === 0) return "";
    
        return skills
          .map((s) => `- **${s.title}**: ${s.description}`)
          .join("\n");
      }
    }
    
    // ============================================================
    // Helpers para fallback (formato antigo)
    // ============================================================
    
    function extractTitleFromBody(body: string): string | null {
      const match = body.match(/^#\s+(.+)/m);
      return match ? match[1].trim() : null;
    }
    
    function extractDescriptionLegacy(body: string): string {
      // Primeiro paragrafo significativo apos o titulo
      const lines = body.split("\n");
      let foundTitle = false;
    
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#")) {
          foundTitle = true;
          continue;
        }
        if (trimmed.startsWith("##")) continue;
        if (trimmed.startsWith("---")) continue;
    
        if (foundTitle || trimmed.length > 10) {
          let desc = trimmed.replace(/^[#*\s]*/, "").trim();
          if (desc.length > 100) {
            desc = desc.substring(0, 100) + "...";
          }
          return desc;
        }
      }
    
      return "";
    }
    
    function extractKeywordsLegacy(content: string, name: string): string[] {
      const keywords: string[] = [name.toLowerCase(), ...name.split(/[-_\s]+/).map((k) => k.toLowerCase())];
    
      // Extrair da secao ## Keywords / ## Palavras-chave
      const kwMatch = content.match(/##\s*(?:Keywords|Palavras[- ]chave)\s*\n([^#]+)/i);
      if (kwMatch) {
        kwMatch[1].split(/[,;\n]+/).forEach((kw) => {
          const trimmed = kw.trim().toLowerCase();
          if (trimmed && !keywords.includes(trimmed)) {
            keywords.push(trimmed);
          }
        });
      }
    
      // Extrair tags do frontmatter antigo: ---tags: [a, b, c]---
      const tagsMatch = content.match(/---\ntags:\s*\[([^\]]+)\]\n---/);
      if (tagsMatch) {
        tagsMatch[1].split(",").forEach((t) => {
          const trimmed = t.trim().toLowerCase().replace(/['"]/g, "");
          if (trimmed && !keywords.includes(trimmed)) {
            keywords.push(trimmed);
          }
        });
      }
    
      return keywords;
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let defaultManager: SkillsManager | null = null;
    
    export function getSkillsManager(): SkillsManager {
      if (!defaultManager) {
        defaultManager = new SkillsManager();
      }
      return defaultManager;
    }
    
    export function resetSkillsManager(): void {
      defaultManager = null;
    }
    