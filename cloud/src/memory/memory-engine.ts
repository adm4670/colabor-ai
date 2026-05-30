/**
 * MemoryEngine - Cloud edition
 * Busca e consolidacao de memoria de longo prazo.
 */
import * as fs from "fs";
import * as path from "path";

interface MemoryFragment {
  source: string;
  content: string;
  score: number;
  line: number;
}

interface TranscriptMessage {
  role: string;
  content: string;
}

const MEMORY_FILE = path.join(process.cwd(), "MEMORY.md");
const MEMORY_DIR = path.join(process.cwd(), process.env.MEMORY_DIR || "memory");

export class MemoryEngine {
  private memoryCache: string | null = null;
  private memoryCacheTime = 0;
  private readonly CACHE_TTL = 10_000;

  recall(query: string, context?: string, maxResults = 5): string {
    const results: MemoryFragment[] = [];
    const queryTerms = this.tokenize(query);
    const contextTerms = context ? this.tokenize(context) : [];
    const allTerms = [...queryTerms, ...contextTerms.map((t) => t + "_ctx")];

    const memoryContent = this.getMemoryContent();
    if (memoryContent) {
      const lines = memoryContent.split("\n");
      let sectionBuffer = "";
      let sectionLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("## ") || line.startsWith("### ")) {
          if (sectionBuffer.length > 0) {
            this.scoreAndAdd(
              results,
              sectionBuffer,
              "MEMORY.md",
              sectionLine,
              allTerms,
              queryTerms,
            );
          }
          sectionBuffer = line;
          sectionLine = i + 1;
        } else if (line.trim()) {
          sectionBuffer += "\n" + line;
        }
      }
      if (sectionBuffer.length > 1) {
        this.scoreAndAdd(results, sectionBuffer, "MEMORY.md", sectionLine, allTerms, queryTerms);
      }
    }

    // Search daily notes
    this.ensureMemoryDir();
    try {
      const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(MEMORY_DIR, file), "utf-8");
        const paragraphs = content.split("\n\n");
        for (let i = 0; i < paragraphs.length; i++) {
          this.scoreAndAdd(results, paragraphs[i], file, i + 1, allTerms, queryTerms);
        }
      }
    } catch {
      // Memory dir might not exist yet
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxResults);

    if (top.length === 0) return "";

    return (
      "=== MEMORIA RELEVANTE ===\n\n" +
      top
        .map(
          (r) =>
            `[${r.source}] (relevancia: ${Math.round(r.score * 100)}%)\n${r.content.slice(0, 500)}`,
        )
        .join("\n\n")
    );
  }

  consolidate(transcript: TranscriptMessage[]): { type: string; content: string }[] {
    const facts: { type: string; content: string }[] = [];
    const patterns = [
      {
        regex: /(?:lembre|recorda|anota|guarda)[^.]*?(?:que|de)\s+(.+?)(?:[.!]|$)/gi,
        type: "fact",
      },
      {
        regex: /(?:prefiro|prefere|gosto mais de|gosto de)[^.]*\s+(.+?)(?:[.!]|$)/gi,
        type: "preference",
      },
      { regex: /(?:decidi|decidiu|vamos \w+ porque)[^.]*\s+(.+?)(?:[.!]|$)/gi, type: "decision" },
      {
        regex: /(?:aprendi|descobri|aprendeu|descobriu)[^.]*\s+(.+?)(?:[.!]|$)/gi,
        type: "learning",
      },
    ];

    for (const msg of transcript) {
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      for (const pattern of patterns) {
        const matches = msg.content.matchAll(pattern.regex);
        for (const match of matches) {
          const fact = match[1]?.trim();
          if (fact && fact.length > 10) {
            facts.push({ type: pattern.type, content: fact });
          }
        }
      }
    }

    if (facts.length > 0) {
      this.appendFactsToMemory(facts);
    }
    return facts;
  }

  manageWorkingMemory(messages: TranscriptMessage[], maxTokens: number): TranscriptMessage[] {
    const estimated = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
    if (estimated <= maxTokens || messages.length <= 7) return messages;

    const keepFirst = 2;
    const keepLast = 5;
    const middle = messages.slice(keepFirst, -keepLast);
    if (middle.length === 0) return messages;

    const summary = this.summarizeMessages(middle);
    return [
      ...messages.slice(0, keepFirst),
      { role: "system", content: `[Resumo de ${middle.length} mensagens]: ${summary}` },
      ...messages.slice(-keepLast),
    ];
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private getMemoryContent(): string {
    const now = Date.now();
    if (this.memoryCache && now - this.memoryCacheTime < this.CACHE_TTL) return this.memoryCache;
    try {
      this.memoryCache = fs.readFileSync(MEMORY_FILE, "utf-8");
      this.memoryCacheTime = now;
      return this.memoryCache;
    } catch {
      return "";
    }
  }

  private ensureMemoryDir(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }

  private scoreAndAdd(
    results: MemoryFragment[],
    text: string,
    source: string,
    line: number,
    allTerms: string[],
    queryTerms: string[],
  ): void {
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of allTerms) {
      const t = term.endsWith("_ctx") ? term.replace("_ctx", "") : term;
      if (lower.includes(t)) score += term.endsWith("_ctx") ? 1 : 2;
    }
    for (const term of queryTerms) {
      if (term.length >= 5 && lower.includes(term)) score += 1;
    }
    if (score > 0) {
      results.push({
        source,
        content: text.slice(0, 500),
        score: score / Math.max(allTerms.length * 2 + queryTerms.length, 1),
        line,
      });
    }
  }

  private summarizeMessages(messages: TranscriptMessage[]): string {
    const userMs = messages.filter((m) => m.role === "user").map((m) => m.content.slice(0, 80));
    const asstMs = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content.slice(0, 80));
    const parts: string[] = [];
    if (userMs.length) parts.push(`Usuario perguntou: ${userMs.join("; ")}`);
    if (asstMs.length) parts.push(`Assistente respondeu: ${asstMs.join("; ")}`);
    return parts.join(". ").slice(0, 300);
  }

  private appendFactsToMemory(facts: { type: string; content: string }[]): void {
    const typeLabels: Record<string, string> = {
      fact: "Fatos",
      decision: "Decisoes",
      preference: "Preferencias",
      learning: "Aprendizados",
    };
    const grouped: Record<string, string[]> = {};
    for (const f of facts) {
      if (!grouped[f.type]) grouped[f.type] = [];
      grouped[f.type].push(f.content);
    }
    const ts = new Date().toISOString().split("T")[0];
    let newContent = "";
    for (const [type, items] of Object.entries(grouped)) {
      newContent += `\n## ${typeLabels[type] || type}\n`;
      for (const item of items) newContent += `- [${ts}] ${item}\n`;
    }
    try {
      fs.appendFileSync(MEMORY_FILE, newContent, "utf-8");
    } catch {
      /* non-critical */
    }
  }
}

let instance: MemoryEngine | null = null;

export function getMemoryEngine(): MemoryEngine {
  if (!instance) instance = new MemoryEngine();
  return instance;
}
