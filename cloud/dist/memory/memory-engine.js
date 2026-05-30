"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemoryEngine = exports.MemoryEngine = void 0;
/**
 * MemoryEngine - Cloud edition
 * Busca e consolidacao de memoria de longo prazo.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEMORY_FILE = path.join(process.cwd(), "MEMORY.md");
const MEMORY_DIR = path.join(process.cwd(), process.env.MEMORY_DIR || "memory");
class MemoryEngine {
    memoryCache = null;
    memoryCacheTime = 0;
    CACHE_TTL = 10_000;
    recall(query, context, maxResults = 5) {
        const results = [];
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
                        this.scoreAndAdd(results, sectionBuffer, "MEMORY.md", sectionLine, allTerms, queryTerms);
                    }
                    sectionBuffer = line;
                    sectionLine = i + 1;
                }
                else if (line.trim()) {
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
        }
        catch {
            // Memory dir might not exist yet
        }
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, maxResults);
        if (top.length === 0)
            return "";
        return ("=== MEMORIA RELEVANTE ===\n\n" +
            top
                .map((r) => `[${r.source}] (relevancia: ${Math.round(r.score * 100)}%)\n${r.content.slice(0, 500)}`)
                .join("\n\n"));
    }
    consolidate(transcript) {
        const facts = [];
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
            if (msg.role !== "user" && msg.role !== "assistant")
                continue;
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
    manageWorkingMemory(messages, maxTokens) {
        const estimated = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
        if (estimated <= maxTokens || messages.length <= 7)
            return messages;
        const keepFirst = 2;
        const keepLast = 5;
        const middle = messages.slice(keepFirst, -keepLast);
        if (middle.length === 0)
            return messages;
        const summary = this.summarizeMessages(middle);
        return [
            ...messages.slice(0, keepFirst),
            { role: "system", content: `[Resumo de ${middle.length} mensagens]: ${summary}` },
            ...messages.slice(-keepLast),
        ];
    }
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((t) => t.length > 1);
    }
    getMemoryContent() {
        const now = Date.now();
        if (this.memoryCache && now - this.memoryCacheTime < this.CACHE_TTL)
            return this.memoryCache;
        try {
            this.memoryCache = fs.readFileSync(MEMORY_FILE, "utf-8");
            this.memoryCacheTime = now;
            return this.memoryCache;
        }
        catch {
            return "";
        }
    }
    ensureMemoryDir() {
        if (!fs.existsSync(MEMORY_DIR)) {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
        }
    }
    scoreAndAdd(results, text, source, line, allTerms, queryTerms) {
        const lower = text.toLowerCase();
        let score = 0;
        for (const term of allTerms) {
            const t = term.endsWith("_ctx") ? term.replace("_ctx", "") : term;
            if (lower.includes(t))
                score += term.endsWith("_ctx") ? 1 : 2;
        }
        for (const term of queryTerms) {
            if (term.length >= 5 && lower.includes(term))
                score += 1;
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
    summarizeMessages(messages) {
        const userMs = messages.filter((m) => m.role === "user").map((m) => m.content.slice(0, 80));
        const asstMs = messages
            .filter((m) => m.role === "assistant")
            .map((m) => m.content.slice(0, 80));
        const parts = [];
        if (userMs.length)
            parts.push(`Usuario perguntou: ${userMs.join("; ")}`);
        if (asstMs.length)
            parts.push(`Assistente respondeu: ${asstMs.join("; ")}`);
        return parts.join(". ").slice(0, 300);
    }
    appendFactsToMemory(facts) {
        const typeLabels = {
            fact: "Fatos",
            decision: "Decisoes",
            preference: "Preferencias",
            learning: "Aprendizados",
        };
        const grouped = {};
        for (const f of facts) {
            if (!grouped[f.type])
                grouped[f.type] = [];
            grouped[f.type].push(f.content);
        }
        const ts = new Date().toISOString().split("T")[0];
        let newContent = "";
        for (const [type, items] of Object.entries(grouped)) {
            newContent += `\n## ${typeLabels[type] || type}\n`;
            for (const item of items)
                newContent += `- [${ts}] ${item}\n`;
        }
        try {
            fs.appendFileSync(MEMORY_FILE, newContent, "utf-8");
        }
        catch {
            /* non-critical */
        }
    }
}
exports.MemoryEngine = MemoryEngine;
let instance = null;
function getMemoryEngine() {
    if (!instance)
        instance = new MemoryEngine();
    return instance;
}
exports.getMemoryEngine = getMemoryEngine;
//# sourceMappingURL=memory-engine.js.map