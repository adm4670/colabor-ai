
    /**
     * SkillsManager - Sistema de Skills para o agente
     *
     * Skills sao instrucoes em Markdown que expandem as capacidades
     * do agente sob demanda. Cada skill e um arquivo .md na pasta skills/.
     *
     * O agente carrega as skills mais relevantes para o contexto atual,
     * sem poluir o prompt principal com instrucoes desnecessarias.
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
      /** Nome do arquivo sem extensao */
      name: string;
      /** Titulo extraido do frontmatter ou nome do arquivo */
      title: string;
      /** Descricao curta (primeira linha ou frontmatter) */
      description: string;
      /** Conteudo completo do skill */
      content: string;
      /** Palavras-chave para matching */
      keywords: string[];
      /** Caminho do arquivo */
      filePath: string;
    }
    
    export interface SkillsConfig {
      /** Diretorio onde as skills estao armazenadas */
      skillsDir: string;
      /** Numero maximo de skills a carregar por vez (default: 3) */
      maxSkills: number;
      /** Score minimo para considerar uma skill relevante (0-1) */
      minScore: number;
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
      private readonly CACHE_TTL = 30000; // 30 segundos
    
      constructor(config?: Partial<SkillsConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
      }
    
      /**
       * Carrega todas as skills do diretorio (com cache)
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
    
          const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md"));
    
          for (const file of files) {
            try {
              const filePath = path.join(skillsDir, file);
              const content = fs.readFileSync(filePath, "utf-8");
              const name = file.replace(/\.md$/, "");
    
              // Extrair titulo da primeira linha (# Titulo) ou do nome do arquivo
              const titleMatch = content.match(/^#\s+(.+)/m);
              const title = titleMatch ? titleMatch[1].trim() : name;
    
              // Extrair descricao (primeira linha apos o titulo, ou segunda linha)
              const lines = content.split("\n").filter((l) => l.trim());
              let description = "";
              for (const line of lines) {
                if (!line.startsWith("#") && !line.startsWith("---")) {
                  description = line.replace(/^[#*\s]*/, "").trim();
                  if (description.length > 100) {
                    description = description.substring(0, 100) + "...";
                  }
                  break;
                }
              }
    
              // Extrair palavras-chave (da secao ## Keywords ou tags)
              const keywords: string[] = [name, ...name.split(/[-_\s]+/)];
    
              const keywordMatch = content.match(
                /##\s*Keywords?\s*\n([^#]+)/i
              );
              if (keywordMatch) {
                const kwText = keywordMatch[1].trim();
                kwText.split(/[,;\n]+/).forEach((kw) => {
                  const trimmed = kw.trim().toLowerCase();
                  if (trimmed && !keywords.includes(trimmed)) {
                    keywords.push(trimmed);
                  }
                });
              }
    
              // Extrair tags do frontmatter (formato ---tags: [a, b, c]---)
              const tagsMatch = content.match(/---\n([^]+?)\n---/);
              if (tagsMatch) {
                const fm = tagsMatch[1];
                const tagMatch = fm.match(/tags:\s*\[([^\]]+)\]/);
                if (tagMatch) {
                  tagMatch[1].split(",").forEach((t) => {
                    const trimmed = t.trim().toLowerCase().replace(/['"]/g, "");
                    if (trimmed && !keywords.includes(trimmed)) {
                      keywords.push(trimmed);
                    }
                  });
                }
              }
    
              skills.push({
                name,
                title,
                description,
                content,
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
       * Filtra skills por relevancia ao contexto
       * Usa correspondencia simples de palavras-chave
       */
      loadRelevantSkills(context: string): string[] {
        const allSkills = this.loadAllSkills();
        if (allSkills.length === 0) return [];
    
        const contextLower = context.toLowerCase();
        const contextWords = new Set(
          contextLower
            .split(/[\s,.;!?_()\[\]{}]+/)
            .filter((w) => w.length > 2)
        );
    
        // Calcular score para cada skill
        const scored = allSkills.map((skill) => {
          let score = 0;
    
          // Match por palavra-chave
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
            // Match no conteudo
            if (skill.content.toLowerCase().includes(word)) {
              score += 0.05;
            }
          }
    
          return { skill, score };
        });
    
        // Filtrar por score minimo e ordenar
        const relevant = scored
          .filter((s) => s.score >= this.config.minScore)
          .sort((a, b) => b.score - a.score)
          .slice(0, this.config.maxSkills);
    
        if (relevant.length > 0) {
          logger.info(
            `[SkillsManager] Skills relevantes encontradas: ${relevant
              .map((s) => `${s.skill.name} (score: ${s.score.toFixed(2)})`)
              .join(", ")}`
          );
        }
    
        return relevant.map((s) => s.skill.content);
      }
    
      /**
       * Retorna todas as skills concatenadas como string
       */
      getAllSkillsInstructions(): string {
        const allSkills = this.loadAllSkills();
        if (allSkills.length === 0) return "";
    
        return allSkills
          .map(
            (skill) =>
              `=== Skill: ${skill.title} ===\n${skill.description}\n---`
          )
          .join("\n\n");
      }
    
      /**
       * Retorna os nomes das skills disponiveis
       */
      listSkills(): { name: string; title: string; description: string }[] {
        return this.loadAllSkills().map((s) => ({
          name: s.name,
          title: s.title,
          description: s.description,
        }));
      }
    
      /**
       * Forca o recarregamento do cache
       */
      refreshCache(): void {
        this.skillsCache = null;
        this.lastLoadTime = 0;
      }
    
      /**
       * Cria uma skill padrao se o diretorio estiver vazio
       */
      createDefaultSkills(): void {
        const skillsDir = this.config.skillsDir;
        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }
    
        const existing = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md"));
        if (existing.length > 0) return;
    
        // Skills default serao criadas separadamente
        logger.info("[SkillsManager] Diretorio de skills vazio. Skills padrao serao criadas.");
      }
    
      /**
       * Carrega skills baseadas no contexto da tarefa atual.
       * Analisa o input do usuario para determinar quais skills sao necessarias.
       */
      loadSkillsForTask(userInput: string, currentContext?: string): string[] {
        const combinedContext = `${userInput} ${currentContext || ""}`;
        return this.loadRelevantSkills(combinedContext);
      }
    
      /**
       * Retorna descricao de todas as skills para inclusao no system prompt.
       */
      getSkillsSummary(): string {
        const skills = this.loadAllSkills();
        if (skills.length === 0) return "";
    
        return skills
          .map((s) => `- **${s.title}**: ${s.description}`)
          .join("\n");
      }
    
}
    
    // Singleton
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
    