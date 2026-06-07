/**
 * knowledgeGraphScanTool.ts - Scanner de ambiente para KnowledgeGraph
 *
 * Escaneia diretórios, arquivos, dependências e estrutura do projeto
 * para extrair fatos e alimentar o KnowledgeGraphStore.
 *
 * AGORA: Após escanear, os fatos são automaticamente adicionados
 * à instância GLOBAL do KnowledgeGraphStore e persistidos em disco.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative, basename, extname } from "path";
import { logger } from "../utils/logger";
import { getKnowledgeGraphStore } from "../memory/knowledge-graph";

// ============================================================
// Tipos
// ============================================================

export interface GraphFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface ScanResult {
  facts: GraphFact[];
  stats: {
    totalFiles: number;
    totalDirs: number;
    totalFacts: number;
    scannedPaths: string[];
  };
}

// ============================================================
// Scan Tool Definition
// ============================================================

const SCANNABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml",
  ".html", ".css", ".env", ".env.example",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "coverage", ".colabor-ai",
  "tmp", "cloud/node_modules",
]);

const IGNORED_FILES = new Set([
  "package-lock.json", ".gitignore", ".editorconfig", ".prettierrc",
  "babel.config.js", "eslint.config.js",
]);

// ============================================================
// Core scanning logic
// ============================================================

function scanDirectory(
  dirPath: string,
  basePath: string,
  facts: GraphFact[],
  depth: number = 0
): { files: number; dirs: number } {
  if (depth > 5) return { files: 0, dirs: 0 }; // Safety limit

  let totalFiles = 0;
  let totalDirs = 0;

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const relPath = relative(basePath, fullPath).replace(/\\/g, "/");

      try {
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          if (IGNORED_DIRS.has(entry)) continue;

          totalDirs++;

          // Fact: directory exists
          facts.push({
            subject: relPath,
            predicate: "is_directory",
            object: "true",
            confidence: 1.0,
          });

          // Fact: parent contains child
          const parentRel = relative(basePath, dirPath).replace(/\\/g, "/");
          if (parentRel) {
            facts.push({
              subject: parentRel,
              predicate: "contains",
              object: relPath,
              confidence: 1.0,
            });
          }

          const sub = scanDirectory(fullPath, basePath, facts, depth + 1);
          totalFiles += sub.files;
          totalDirs += sub.dirs;
        } else if (stats.isFile()) {
          if (IGNORED_FILES.has(entry)) continue;

          const ext = extname(entry).toLowerCase();
          totalFiles++;

          // Fact: file exists
          facts.push({
            subject: relPath,
            predicate: "is_file",
            object: "true",
            confidence: 1.0,
          });

          // Fact: file extension
          if (ext) {
            facts.push({
              subject: relPath,
              predicate: "has_extension",
              object: ext,
              confidence: 1.0,
            });
          }

          // Fact: file size category
          const sizeMB = stats.size / (1024 * 1024);
          let sizeCategory = "small";
          if (sizeMB > 1) sizeCategory = "medium";
          if (sizeMB > 10) sizeCategory = "large";
          if (sizeMB > 100) sizeCategory = "huge";
          facts.push({
            subject: relPath,
            predicate: "size_category",
            object: sizeCategory,
            confidence: 0.9,
          });

          // Parse file for imports and exports (TS/JS)
          if (SCANNABLE_EXTENSIONS.has(ext)) {
            try {
              const content = readFileSync(fullPath, "utf-8");
              parseFileContent(relPath, content, ext, facts);
            } catch {
              // Skip unreadable files
            }
          }

          // Parent contains file
          const parentRel = relative(basePath, dirPath).replace(/\\/g, "/");
          if (parentRel) {
            facts.push({
              subject: parentRel,
              predicate: "contains",
              object: relPath,
              confidence: 1.0,
            });
          }
        }
      } catch {
        // Skip entries we can't stat
        continue;
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return { files: totalFiles, dirs: totalDirs };
}

// ============================================================
// File content parsing
// ============================================================

function parseFileContent(
  filePath: string,
  content: string,
  ext: string,
  facts: GraphFact[]
): void {
  const lines = content.split("\n");

  // Detect imports/exports
  for (const line of lines) {
    const trimmed = line.trim();

    // import { X } from "y"
    const importMatch = trimmed.match(
      /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/
    );
    if (importMatch) {
      const imported = importMatch[1];
      facts.push({
        subject: filePath,
        predicate: "imports",
        object: imported,
        confidence: 0.95,
      });
      continue;
    }

    // import "x"
    const bareImport = trimmed.match(/^import\s+["']([^"']+)["']/);
    if (bareImport) {
      facts.push({
        subject: filePath,
        predicate: "imports",
        object: bareImport[1],
        confidence: 0.9,
      });
      continue;
    }

    // export class/interface/function X
    const exportMatch = trimmed.match(/^export\s+(class|interface|type|function|const|enum|abstract\s+class)\s+(\w+)/);
    if (exportMatch) {
      facts.push({
        subject: filePath,
        predicate: "exports",
        object: exportMatch[2],
        confidence: 0.98,
      });
      facts.push({
        subject: exportMatch[2],
        predicate: "is_defined_in",
        object: filePath,
        confidence: 0.98,
      });
      facts.push({
        subject: exportMatch[2],
        predicate: "is_" + exportMatch[1].replace(/\s+/g, "_"),
        object: "true",
        confidence: 0.95,
      });
      continue;
    }

    // Agent registration pattern
    const agentReg = trimmed.match(/agentRegistry\.register\(\{\s*\n?\s*name:\s*["']([^"']+)["']/);
    if (agentReg) {
      facts.push({
        subject: agentReg[1],
        predicate: "is_registered_agent",
        object: "true",
        confidence: 1.0,
      });
      facts.push({
        subject: agentReg[1],
        predicate: "registered_in",
        object: filePath,
        confidence: 1.0,
      });
    }

    // new Agent({ name: "..." })
    const agentCreate = trimmed.match(/new\s+Agent\(\{[\s\S]*?name:\s*["']([^"']+)["']/);
    if (agentCreate && !agentReg) {
      facts.push({
        subject: agentCreate[1],
        predicate: "is_agent_definition",
        object: "true",
        confidence: 1.0,
      });
      facts.push({
        subject: agentCreate[1],
        predicate: "defined_in",
        object: filePath,
        confidence: 1.0,
      });
    }

    // class X extends Y
    const classExtends = trimmed.match(/^class\s+(\w+)\s+extends\s+(\w+)/);
    if (classExtends) {
      facts.push({
        subject: classExtends[1],
        predicate: "extends",
        object: classExtends[2],
        confidence: 1.0,
      });
    }

    // Tool definition pattern
    const toolDef = trimmed.match(/name:\s*"([^"]+)",?\s*\n?\s*description:\s*"([^"]+)"/);
    if (toolDef && trimmed.includes("type:") && trimmed.includes("function:")) {
      facts.push({
        subject: toolDef[1],
        predicate: "is_tool",
        object: "true",
        confidence: 1.0,
      });
      facts.push({
        subject: toolDef[1],
        predicate: "described_as",
        object: toolDef[2].substring(0, 100),
        confidence: 0.9,
      });
    }
  }

  // package.json parsing
  if (basename(filePath) === "package.json") {
    try {
      const pkg = JSON.parse(content);
      if (pkg.name) {
        facts.push({
          subject: pkg.name,
          predicate: "is_package",
          object: "true",
          confidence: 1.0,
        });
        facts.push({
          subject: pkg.name,
          predicate: "version",
          object: pkg.version || "unknown",
          confidence: 1.0,
        });
      }
      // Dependencies
      if (pkg.dependencies) {
        for (const [dep, ver] of Object.entries(pkg.dependencies)) {
          facts.push({
            subject: filePath,
            predicate: "depends_on",
            object: dep,
            confidence: 1.0,
          });
          facts.push({
            subject: dep,
            predicate: "version",
            object: ver as string,
            confidence: 0.95,
          });
        }
      }
      if (pkg.devDependencies) {
        for (const [dep, ver] of Object.entries(pkg.devDependencies)) {
          facts.push({
            subject: filePath,
            predicate: "dev_depends_on",
            object: dep,
            confidence: 1.0,
          });
          facts.push({
            subject: dep,
            predicate: "version",
            object: ver as string,
            confidence: 0.95,
          });
        }
      }
      // Scripts
      if (pkg.scripts) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          facts.push({
            subject: filePath,
            predicate: "has_script",
            object: name,
            confidence: 1.0,
          });
          facts.push({
            subject: name,
            predicate: "runs",
            object: (cmd as string).substring(0, 100),
            confidence: 0.9,
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  }
}

// ============================================================
// Main scan function
// ============================================================

export interface ScanOptions {
  paths?: string[];           // Specific paths to scan (default: [process.cwd()])
  includeNodeModules?: boolean;
  maxFacts?: number;          // Max facts to generate (default: 5000)
}

export async function scanProject(
  options: ScanOptions = {}
): Promise<ScanResult> {
  const basePath = process.cwd();
  const scanPaths = options.paths ?? [basePath];
  const maxFacts = options.maxFacts ?? 5000;
  const facts: GraphFact[] = [];
  let totalFiles = 0;
  let totalDirs = 0;

  logger.info(`[KnowledgeGraphScan] Iniciando scan de ${scanPaths.length} caminho(s)`);

  for (const scanPath of scanPaths) {
    const absPath = join(basePath, scanPath);
    if (!existsSync(absPath)) {
      logger.warn(`[KnowledgeGraphScan] Caminho nao encontrado: ${absPath}`);
      continue;
    }

    const result = scanDirectory(absPath, basePath, facts);
    totalFiles += result.files;
    totalDirs += result.dirs;

    if (facts.length >= maxFacts) {
      logger.warn(`[KnowledgeGraphScan] Limite de ${maxFacts} fatos atingido. Truncando.`);
      facts.splice(maxFacts);
      break;
    }
  }

  // Add project-level facts
  facts.push({
    subject: "colabor-ai",
    predicate: "has_total_files",
    object: String(totalFiles),
    confidence: 1.0,
  });
  facts.push({
    subject: "colabor-ai",
    predicate: "has_total_directories",
    object: String(totalDirs),
    confidence: 1.0,
  });
  facts.push({
    subject: "colabor-ai",
    predicate: "has_total_facts",
    object: String(facts.length),
    confidence: 1.0,
  });

  // ============================================================
  // NOVO: Alimentar automaticamente o KnowledgeGraphStore global
  // ============================================================
  try {
    const kg = getKnowledgeGraphStore();
    for (const fact of facts) {
      kg.addFact(fact.subject, fact.predicate, fact.object, fact.confidence);
    }
    logger.info(`[KnowledgeGraphScan] ${facts.length} fatos adicionados ao KnowledgeGraph global`);
  } catch (err: any) {
    logger.error(`[KnowledgeGraphScan] Erro ao alimentar KG: ${err.message}`);
  }

  const result: ScanResult = {
    facts,
    stats: {
      totalFiles,
      totalDirs,
      totalFacts: facts.length,
      scannedPaths: scanPaths,
    },
  };

  logger.info(
    `[KnowledgeGraphScan] Scan concluido: ${totalFiles} arquivos, ${totalDirs} diretorios, ${facts.length} fatos`
  );

  return result;
}

// ============================================================
// OpenAI Tool Definition
// ============================================================

export const knowledgeGraphScanTool = {
  type: "function" as const,
  function: {
    name: "knowledge_graph_scan",
    description: "Scan project directories and files to build a Knowledge Graph. Extracts facts about files, directories, imports/exports, agents, tools, dependencies and project structure.",
    parameters: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Paths to scan relative to project root (default: whole project)",
        },
        includeNodeModules: {
          type: "boolean",
          description: "Include node_modules in scan (default: false)",
        },
        maxFacts: {
          type: "number",
          description: "Maximum number of facts to generate (default: 5000)",
        },
      },
    },
  },

  async handler(args: { paths?: string[]; includeNodeModules?: boolean; maxFacts?: number }) {
    try {
      const result = await scanProject({
        paths: args.paths,
        includeNodeModules: args.includeNodeModules,
        maxFacts: args.maxFacts,
      });

      // Forçar save após scan completo
      try {
        getKnowledgeGraphStore().save();
      } catch {}

      return {
        success: true,
        stats: result.stats,
        sampleFacts: result.facts.slice(0, 20),
        totalFacts: result.facts.length,
        message: `Scan concluído: ${result.stats.totalFiles} arquivos, ${result.stats.totalDirs} diretórios, ${result.facts.length} fatos extraídos e adicionados ao KnowledgeGraph.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Erro no scan: ${error.message}`,
      };
    }
  },
};
