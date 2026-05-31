/**
     * PlanManager - Sistema de planejamento persistente multi-step.
     *
     * Inspirado no Plan Mode do claude-code.
     * Cria e mantem um arquivo .colabor-ai/plan.md com:
     * - Objetivo principal
     * - Passos numerados com status (pending | in_progress | done | failed)
     * - Dependencias entre passos
     * - Criterios de sucesso
     * - Learning/log do que foi tentado
     *
     * O PlannerAgent consulta este plano antes de decidir o proximo passo.
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type StepStatus = "pending" | "in_progress" | "done" | "failed";
    
    export interface PlanStep {
      /** Numero do passo (1-based) */
      number: number;
      /** Descricao do que fazer */
      description: string;
      /** Status atual */
      status: StepStatus;
      /** Agente recomendado para este passo */
      agent?: string;
      /** Depende de quais passos (numeros) */
      dependsOn: number[];
      /** Resultado apos execucao */
      result?: string;
      /** Instrucao exata dada ao agente */
      instruction?: string;
    }
    
    export interface Plan {
      /** Objetivo principal */
      goal: string;
      /** Passos do plano */
      steps: PlanStep[];
      /** Criterios de sucesso */
      successCriteria: string[];
      /** Data de criacao */
      createdAt: string;
      /** Data da ultima atualizacao */
      updatedAt: string;
      /** Sessao ID associada */
      sessionId: string;
      /** Resumo do que foi aprendido durante execucao */
      learnings: string[];
    }
    
    // ============================================================
    // Constantes
    // ============================================================
    
    const PLAN_DIR = path.join(process.cwd(), ".colabor-ai");
    const PLAN_FILE = path.join(PLAN_DIR, "plan.md");
    
    // ============================================================
    // PlanManager
    // ============================================================
    
    export class PlanManager {
      private currentPlan: Plan | null = null;
    
      constructor() {
        this.ensurePlanDir();
      }
    
      private ensurePlanDir(): void {
        if (!fs.existsSync(PLAN_DIR)) {
          fs.mkdirSync(PLAN_DIR, { recursive: true });
          logger.info("[PlanManager] Diretorio .colabor-ai criado");
        }
      }
    
      /** Carrega o plano existente do disco */
      load(): Plan | null {
        try {
          if (!fs.existsSync(PLAN_FILE)) return null;
          const content = fs.readFileSync(PLAN_FILE, "utf-8");
          const parsed = this.parseMarkdown(content);
          this.currentPlan = parsed;
          return parsed;
        } catch (err) {
          logger.warn(`[PlanManager] Erro ao carregar plano: ${err}`);
          return null;
        }
      }
    
      /** Cria um novo plano multi-step baseado na analise do input */
      create(goal: string, sessionId: string): Plan {
        const plan: Plan = {
          goal,
          steps: [],
          successCriteria: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sessionId,
          learnings: [],
        };
        this.currentPlan = plan;
        this.save();
        return plan;
      }
    
      /** Adiciona steps ao plano (tipicamente apos o Planner analisar) */
      addSteps(steps: Omit<PlanStep, "status">[]): void {
        if (!this.currentPlan) return;
        this.currentPlan.steps.push(
          ...steps.map((s) => ({ ...s, status: "pending" as StepStatus }))
        );
        this.currentPlan.updatedAt = new Date().toISOString();
        this.save();
      }
    
      /** Atualiza o status de um step */
      updateStep(
        stepNumber: number,
        update: Partial<Pick<PlanStep, "status" | "result" | "instruction">>
      ): void {
        if (!this.currentPlan) return;
        const step = this.currentPlan.steps.find((s) => s.number === stepNumber);
        if (!step) return;
    
        if (update.status) step.status = update.status;
        if (update.result) step.result = update.result;
        if (update.instruction) step.instruction = update.instruction;
    
        this.currentPlan.updatedAt = new Date().toISOString();
        this.save();
      }
    
      /** Adiciona um aprendizado */
      addLearning(learning: string): void {
        if (!this.currentPlan) return;
        this.currentPlan.learnings.push(learning);
        this.save();
      }
    
      /** Retorna os proximos passos pendentes (considerando dependencias) */
      getNextSteps(): PlanStep[] {
        if (!this.currentPlan) return [];
        return this.currentPlan.steps
          .filter((s) => s.status === "pending")
          .filter((s) => {
            // So retorna se todas as dependencias estao concluidas
            return s.dependsOn.every((depNum) => {
              const dep = this.currentPlan!.steps.find((st) => st.number === depNum);
              return dep && dep.status === "done";
            });
          });
      }
    
      /** Verifica se todos os steps estao completos */
      isComplete(): boolean {
        if (!this.currentPlan || this.currentPlan.steps.length === 0) return false;
        return this.currentPlan.steps.every((s) => s.status === "done");
      }
    
      /** Retorna o plano formatado para o prompt do planner */
      getPlanForPrompt(): string {
        if (!this.currentPlan || this.currentPlan.steps.length === 0) return "";
    
        const lines: string[] = [
          "=== CURRENT PLAN ===",
          `Goal: ${this.currentPlan.goal}`,
          "",
          "Steps:",
        ];
    
        for (const step of this.currentPlan.steps) {
          const statusIcon =
            step.status === "done"
              ? "[OK]"
              : step.status === "in_progress"
                ? "[>>]"
                : step.status === "failed"
                  ? "[XX]"
                  : "[  ]";
          const agentInfo = step.agent ? ` (agent: ${step.agent})` : "";
          lines.push(
            `  ${statusIcon} Step ${step.number}: ${step.description}${agentInfo}`
          );
          if (step.result) {
            lines.push(`       Result: ${step.result.slice(0, 150)}`);
          }
        }
    
        if (this.currentPlan.learnings.length > 0) {
          lines.push("");
          lines.push("Learnings:");
          for (const l of this.currentPlan.learnings) {
            lines.push(`  - ${l}`);
          }
        }
    
        return lines.join("\n");
      }
    
      /** Destroi o plano atual (ao finalizar com sucesso) */
      destroy(): void {
        this.currentPlan = null;
        try {
          if (fs.existsSync(PLAN_FILE)) {
            fs.unlinkSync(PLAN_FILE);
          }
        } catch {
          // ignore
        }
      }
    
      /** Verifica se ha um plano ativo */
      hasPlan(): boolean {
        return this.currentPlan !== null && this.currentPlan.steps.length > 0;
      }
    
      getPlan(): Plan | null {
        return this.currentPlan;
      }
    
      // ============================================================
      // Serializacao Markdown
      // ============================================================
    
      private save(): void {
        if (!this.currentPlan) return;
        this.ensurePlanDir();
        const md = this.toMarkdown();
        fs.writeFileSync(PLAN_FILE, md, "utf-8");
      }
    
      private toMarkdown(): string {
        if (!this.currentPlan) return "";
        const p = this.currentPlan;
    
        const lines: string[] = [
          "# Plan",
          "",
          `**Goal:** ${p.goal}`,
          `**Session:** ${p.sessionId}`,
          `**Created:** ${p.createdAt}`,
          `**Updated:** ${p.updatedAt}`,
          "",
          "## Success Criteria",
          ...p.successCriteria.map((c) => `- ${c}`),
          "",
          "## Steps",
        ];
    
        for (const step of p.steps) {
          const statusLabel = step.status.toUpperCase();
          const deps =
            step.dependsOn.length > 0
              ? ` (depends on: ${step.dependsOn.join(", ")})`
              : "";
          lines.push(`### Step ${step.number}: ${step.description} [${statusLabel}]${deps}`);
          if (step.agent) lines.push(`- **Agent:** ${step.agent}`);
          if (step.instruction) lines.push(`- **Instruction:** ${step.instruction}`);
          if (step.result) lines.push(`- **Result:** ${step.result}`);
          lines.push("");
        }
    
        if (p.learnings.length > 0) {
          lines.push("## Learnings");
          for (const l of p.learnings) {
            lines.push(`- ${l}`);
          }
        }
    
        return lines.join("\n");
      }
    
      private parseMarkdown(content: string): Plan | null {
        try {
          const lines = content.split("\n");
          const plan: Plan = {
            goal: "",
            steps: [],
            successCriteria: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sessionId: "",
            learnings: [],
          };
    
          let section: "header" | "criteria" | "steps" | "learnings" = "header";
          let currentStep: Partial<PlanStep> | null = null;
    
          for (const line of lines) {
            const trimmed = line.trim();
    
            if (trimmed.startsWith("**Goal:**")) {
              plan.goal = trimmed.replace("**Goal:**", "").trim();
              continue;
            }
            if (trimmed.startsWith("**Session:**")) {
              plan.sessionId = trimmed.replace("**Session:**", "").trim();
              continue;
            }
            if (trimmed.startsWith("**Created:**")) {
              plan.createdAt = trimmed.replace("**Created:**", "").trim();
              continue;
            }
            if (trimmed.startsWith("**Updated:**")) {
              plan.updatedAt = trimmed.replace("**Updated:**", "").trim();
              continue;
            }
    
            if (trimmed === "## Success Criteria") {
              section = "criteria";
              continue;
            }
            if (trimmed === "## Steps") {
              section = "steps";
              continue;
            }
            if (trimmed === "## Learnings") {
              section = "learnings";
              continue;
            }
    
            if (section === "criteria" && trimmed.startsWith("-")) {
              plan.successCriteria.push(trimmed.slice(1).trim());
              continue;
            }
    
            if (section === "learnings" && trimmed.startsWith("-")) {
              plan.learnings.push(trimmed.slice(1).trim());
              continue;
            }
    
            if (section === "steps") {
              // Detect new step: ### Step N: description [STATUS]
              const stepMatch = trimmed.match(
                /^###\s+Step\s+(\d+):\s+(.+?)\s+\[(PENDING|IN_PROGRESS|DONE|FAILED)\](?:\s*\(depends on:\s*(.+)\))?/
              );
              if (stepMatch) {
                // Save previous step
                if (currentStep && currentStep.number) {
                  plan.steps.push(currentStep as PlanStep);
                }
                currentStep = {
                  number: parseInt(stepMatch[1]),
                  description: stepMatch[2],
                  status: stepMatch[3].toLowerCase() as StepStatus,
                  dependsOn: stepMatch[4]
                    ? stepMatch[4].split(",").map((n) => parseInt(n.trim()))
                    : [],
                };
                continue;
              }
    
              if (currentStep && trimmed.startsWith("- **Agent:**")) {
                currentStep.agent = trimmed.replace("- **Agent:**", "").trim();
                continue;
              }
              if (currentStep && trimmed.startsWith("- **Instruction:**")) {
                currentStep.instruction = trimmed
                  .replace("- **Instruction:**", "")
                  .trim();
                continue;
              }
              if (currentStep && trimmed.startsWith("- **Result:**")) {
                currentStep.result = trimmed.replace("- **Result:**", "").trim();
                continue;
              }
            }
          }
    
          // Save last step
          if (currentStep && currentStep.number) {
            plan.steps.push(currentStep as PlanStep);
          }
    
          return plan.goal ? plan : null;
        } catch (err) {
          logger.warn(`[PlanManager] Erro ao parsear plano: ${err}`);
          return null;
        }
      }
    }
    
    // ============================================================
    // Singleton
    // ============================================================
    
    let instance: PlanManager | null = null;
    
    export function getPlanManager(): PlanManager {
      if (!instance) {
        instance = new PlanManager();
      }
      return instance;
    }
    