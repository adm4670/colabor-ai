/**
 * image-audit.ts - Sistema de Auditoria de Geração de Imagens
 *
 * Registra em arquivo todas as tentativas de geração de imagem:
 * - Modelo utilizado
 * - Prompt completo enviado para a API
 * - Timestamp da chamada
 * - Status da resposta (sucesso/erro)
 * - Caminho do arquivo gerado (se houver)
 * - Resumo da resposta da API
 *
 * O arquivo de auditoria fica em: <projeto>/logs/image-generation-audit.log
 */

import * as fs from "fs";
import * as path from "path";

export interface ImageAuditEntry {
  /** Timestamp ISO da tentativa */
  timestamp: string;
  /** Modelo utilizado (ex: models/gemini-3.1-flash-image) */
  model: string;
  /** Prompt completo enviado para a API */
  prompt: string;
  /** Status da chamada: "success" | "error" | "fallback" */
  status: "success" | "error" | "fallback";
  /** Caminho do arquivo de imagem gerado (se houver) */
  outputPath?: string;
  /** Código HTTP da resposta (se aplicável) */
  httpStatus?: number;
  /** Mensagem de erro (se houver) */
  errorMessage?: string;
  /** Tamanho da imagem gerada em bytes (se houver) */
  imageSize?: number;
  /** Resumo da resposta da API (primeiros 500 chars) */
  responseSummary?: string;
  /** Nome do agente que efetivamente gerou a imagem */
  generatedBy?: string;
}

const AUDIT_LOG_DIR = path.join(process.cwd(), "logs");
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, "image-generation-audit.log");

/**
 * Garante que o diretório de logs existe
 */
function ensureLogDir(): void {
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
  }
}

/**
 * Formata uma entrada de auditoria para o arquivo de log
 */
function formatAuditEntry(entry: ImageAuditEntry): string {
  const separator = "=".repeat(80);
  const lines: string[] = [];

  lines.push(separator);
  lines.push(`[${entry.timestamp}] AUDITORIA DE GERACAO DE IMAGEM`);
  lines.push(separator);
  lines.push(`  Modelo:          ${entry.model}`);
  lines.push(`  Status:          ${entry.status.toUpperCase()}`);
  lines.push(`  Gerado por:      ${entry.generatedBy || "image-generator"}`);
  lines.push(`  Prompt:          ${entry.prompt.slice(0, 3000)}`);
  if (entry.prompt.length > 3000) {
    lines.push(`  [Prompt truncado: ${entry.prompt.length} caracteres no total]`);
  }
  lines.push(`  Output:          ${entry.outputPath || "(nenhum)"}`);
  if (entry.imageSize) {
    lines.push(`  Tamanho:         ${(entry.imageSize / 1024).toFixed(1)} KB`);
  }
  if (entry.httpStatus) {
    lines.push(`  HTTP Status:     ${entry.httpStatus}`);
  }
  if (entry.errorMessage) {
    lines.push(`  Erro:            ${entry.errorMessage}`);
  }
  if (entry.responseSummary) {
    lines.push(`  Resposta API:    ${entry.responseSummary}`);
  }
  lines.push(separator);
  lines.push(""); // linha em branco

  return lines.join("\n");
}

/**
 * Registra uma entrada de auditoria no arquivo de log
 * e também no console (via console.log)
 */
export function logImageAudit(entry: ImageAuditEntry): void {
  try {
    ensureLogDir();
    const formatted = formatAuditEntry(entry);

    // Escreve no arquivo (append)
    fs.appendFileSync(AUDIT_LOG_FILE, formatted, "utf-8");

    // Também loga no console com destaque
    const emoji = entry.status === "success" ? "✅" : entry.status === "fallback" ? "⚠️" : "❌";
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${emoji} [IMAGE AUDIT] ${entry.timestamp}`);
    console.log(`   Modelo: ${entry.model}`);
    console.log(`   Status: ${entry.status.toUpperCase()}`);
    console.log(`   Prompt: ${entry.prompt.slice(0, 120)}${entry.prompt.length > 120 ? "..." : ""}`);
    if (entry.outputPath) console.log(`   Arquivo: ${entry.outputPath}`);
    if (entry.errorMessage) console.log(`   Erro: ${entry.errorMessage}`);
    if (entry.httpStatus) console.log(`   HTTP: ${entry.httpStatus}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (e) {
    // Não crítico - se falhar, não quebra a execução
    console.error("[ImageAudit] Erro ao escrever auditoria:", e);
  }
}

/**
 * Lê as últimas N entradas do arquivo de auditoria
 */
export function readRecentAuditEntries(count: number = 10): string {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) {
      return "Nenhum registro de auditoria encontrado.";
    }
    const content = fs.readFileSync(AUDIT_LOG_FILE, "utf-8");
    const entries = content.split("\n" + "=".repeat(80) + "\n").filter(Boolean);
    const recent = entries.slice(-count);
    return recent.join("\n" + "=".repeat(80) + "\n");
  } catch (e: any) {
    return `Erro ao ler auditoria: ${e.message}`;
  }
}

/**
 * Retorna o caminho do arquivo de auditoria
 */
export function getAuditLogPath(): string {
  return AUDIT_LOG_FILE;
}

/**
 * Verifica quantas entradas de auditoria existem
 */
export function getAuditStats(): { totalEntries: number; filePath: string; fileSizeKB: number } {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) {
      return { totalEntries: 0, filePath: AUDIT_LOG_FILE, fileSizeKB: 0 };
    }
    const content = fs.readFileSync(AUDIT_LOG_FILE, "utf-8");
    const entries = content.split("=".repeat(80)).filter((l) => l.includes("AUDITORIA")).length;
    const stats = fs.statSync(AUDIT_LOG_FILE);
    return {
      totalEntries: entries,
      filePath: AUDIT_LOG_FILE,
      fileSizeKB: Math.round(stats.size / 1024),
    };
  } catch {
    return { totalEntries: 0, filePath: AUDIT_LOG_FILE, fileSizeKB: 0 };
  }
}
