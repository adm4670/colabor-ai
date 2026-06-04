======================================================================
  COLLABOR-AI ORCHESTRATOR PROFILER
  Generated: 2026-06-04T13:23:14.821997
======================================================================


--- IMPORTS ---
  import { Agent } from "../agent/agent";
  import { logger, createLogger } from "../utils/logger";
  import { browserAgent } from "../agents/browser.agent";
  import { reflectorAgent } from "../agents/reflector.agent";
  import { getMemoryEngine } from "../memory/memory-engine";
  import { ContextEngine, getDefaultEngine } from "../context/context-engine";
  import { getSkillsManager } from "../skills/skills-manager";
  import { getPlanManager, PlanManager } from "../plan/plan-manager";
  import { getSubAgentRunner, SubAgentRunner } from "../agent/sub-agent-runner";
  import { getDreamTask, DreamTask } from "../tasks/dream-task";
  import { getHookManager, HookManager } from "../hooks/hook-system";
  import { getPermissionSystem, PermissionSystem } from "../permissions/permission-system";
  import { getBackgroundTaskManager } from "../tasks/background-task-manager";
  import { getScheduler } from "../scheduler/scheduler";
  import { agentRegistry } from "../agents/agent-registry";
  import { CORE_INSTRUCTIONS, DEFAULT_MODEL, FALLBACK_MODEL } from "../constants/instructions";


--- CLASS & CONSTRUCTOR PROPERTIES ---
  this.sessionId = generateSessionId("orchestrator")
  this.eventStream = new EventStream()
  this.contextEngine = getDefaultEngine()
  this.planManager = getPlanManager()
  this.subAgentRunner = getSubAgentRunner()
  this.dreamTask = getDreamTask()
  this.hookManager = getHookManager()
  this.permissionSystem = getPermissionSystem()


--- KEY METHODS ---

  run()
    /** Callback para feedback de progresso ao usuario */
    Signature:  run(runInput: RunInput) {...

  reflectOnResult()
    /** Callback para feedback de progresso ao usuario */
    Signature:  reflectOnResult(...

  formatHistory()
    /** Callback para feedback de progresso ao usuario */
    Signature:  formatHistory(history: Message[] = []) {...

  checkRateLimit()
    Signature:  checkRateLimit(sessionId: string): boolean {...

  loadSessionTranscript()
    Signature:  loadSessionTranscript(sessionId);...

  appendToTranscript()
    Signature:  appendToTranscript(sessionId, {...

  saveDailyNote()
    /** Callback para feedback de progresso ao usuario */
    Signature:  saveDailyNote(noteContent);...

  getSessionId()
    /** Callback para feedback de progresso ao usuario */
    Signature:  getSessionId(): string {...

  resetSession()
    /** Callback para feedback de progresso ao usuario */
    Signature:  resetSession(): void {...


--- TOOLS ---
  ScheduleTaskTool.ts -> unknown  | ScheduleTaskTool - Tool para agendar tarefas recorrentes.
  TodoWriteTool.ts -> unknown  | TodoWriteTool - Gerenciamento de TODOs durante execucao.
  WebSearchTool.ts -> unknown  | WebSearchTool - Busca web real usando DuckDuckGo API.
  agentTool.ts -> unknown  | AgentTool - Ferramenta que permite ao agente spawnar sub-agentes.
  browserExecTool.ts -> unknown  | 
  browserNavigateTool.ts -> unknown  | BrowserNavigateTool - Automacao avancada de navegador.
  pythonExecTool.ts -> unknown  | 
  shellExecTool.ts -> unknown  | 
  task.tools.ts -> unknown  | 
  taskCreateTool.ts -> unknown  | TaskCreateTool - Ferramenta para criar tarefas em background.
  tool-search.ts -> ToolSearch  | ToolSearch - Busca semantica de ferramentas disponiveis.
  toolDefinition.ts -> unknown  | 
  toolRegistry.spec.ts -> unknown  | 
  toolRegistry.ts -> ToolRegistry  | 


--- MEMORY FILES ---
  core\memory\memory-engine.ts
  core\memory\memory-extractor.ts
  core\memory\memory_search.ts


--- BACKGROUND TASK MANAGER ---
  BackgroundTaskManager class found: True
  Scheduler class found: False


--- EXECUTION FLOW ---

      1. User sends message
      2. orchestrator.execute(message)
      3. loadSessionTranscript() -> restore session state
      4. checkRateLimit() -> enforce limits
      5. appendToTranscript() -> persist message
      6. addMessage() -> send to context engine
      7. formatHistory():
           - recall() -> search memory
           - hasPlan()? -> getPlanForPrompt()
           - buildContext() -> compress/summarize
      8. Decide execution mode:
           - run() -> direct LLM call (simple)
           - create() -> plan + execute steps (complex)
           - execute() -> tool handler (tool call)
      9. reflectOnResult() -> self-reflection
      10. saveDailyNote() -> persist to daily notes
      11. consolidate() -> memory consolidation
      12. Return result to user
    


--- COMPONENT INTERACTION MAP ---

      Orchestrator
        |-- ContextEngine (MemorySummarizer) -> LLM Client
        |-- PlanManager -> plan files
        |-- SubAgentRunner -> AgentRegistry -> Agents
        |-- DreamTask -> background consolidation
        |-- HookManager -> pre/post hooks
        |-- PermissionSystem
        |-- BackgroundTaskManager -> task queue
        |-- Scheduler -> cron jobs
        |-- MemoryEngine -> MEMORY.md + daily notes
        |-- RateLimiter
        |-- SkillManager
        |-- Tools (14 registered)
    


--- CODEBASE STATS ---
  Total .ts files: 61
  Total lines of code: 13047

======================================================================
  PROFILING COMPLETE
======================================================================