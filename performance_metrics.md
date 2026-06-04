# Performance Metrics - colabor-ai (lightweight-v2)
    
    > **Data:** 2026-06-04  
    > **Branch:** lightweight-v2  
    > **Runtime:** Node.js v23.1.0  
    > **TS Engine:** tsx v4.21.0  
    > **Node Modules:** 144.55 MB  
    
    ---
    
    ## 1. Initialization Benchmark (module load times)
    
    | # | Module | Load Time (ms) | Size (KB) | SLOC |
    |---|--------|:-------------:|:---------:|:----:|
    | 1 | `core/orchestrator/orchestrator.ts` | **169.34** | 42.4 | 834 |
    | 2 | `core/tools/toolRegistry.ts` | **11.72** | 0.8 | 30 |
    | 3 | `core/config/config.ts` | **3.41** | 1.9 | 42 |
    | 4 | `core/skills/skills-manager.ts` | **1.76** | 15.0 | 295 |
    | 5 | `core/types.ts` | **1.45** | <1 | <30 |
    | 6 | `core/session/transcript.ts` | **1.45** | 15.9 | 264 |
    | 7 | `core/tasks/background-task-manager.ts` | **0.16** | 13.5 | 288 |
    | 8 | `core/agent/agent.ts` | **0.15** | 22.7 | 457 |
    | 9 | `core/llm/provider.ts` | **0.06** | 4.5 | 68 |
    | 10 | `core/context/context-engine.ts` | **0.05** | 19.7 | 354 |
    | 11 | `core/scheduler/scheduler.ts` | **0.05** | <5 | <50 |
    | 12 | `core/utils/cache.ts` | **0.05** | <5 | <50 |
    | 13 | `core/permissions/permission-system.ts` | **0.04** | <5 | <50 |
    | 14 | `core/memory/memory-engine.ts` | **0.03** | 13.3 | 298 |
    | 15 | `core/hooks/hook-system.ts` | **0.03** | <5 | <50 |
    | 16 | `core/plan/plan-manager.ts` | **0.02** | 13.4 | 296 |
    | 17 | `core/agents/agent-registry.ts` | **0.02** | <5 | <50 |
    | 18 | `core/stream/event-stream.ts` | **0.02** | <5 | <50 |
    | 19 | `core/utils/logger.ts` | **0.02** | <5 | <50 |
    | 20 | `core/utils/rateLimiter.ts` | **0.02** | <5 | <50 |
    
    **Total:** 189.85 ms across 20 core modules  
    **Average:** 9.49 ms per module  
    
    ### Key findings:
    - **orchestrator.ts** dominates at **169.34ms** (~89% of total) — triggers agent initialization during load (side effects)
    - All other modules load in under **12ms**, with 12/20 modules loading in under **0.1ms**
    - The orchestration layer is the clear bottleneck for startup
    
    ---
    
    ## 2. Largest Module Files
    
    | File | Size (KB) | SLOC | % of Codebase |
    |------|:---------:|:----:|:------------:|
    | `core/orchestrator/orchestrator.ts` | 42.4 | 834 | 9.4% |
    | `core/orchestrator/orchestrator_fixed.ts` | 33.1 | 834 | 7.4% |
    | `core/agent/agent.ts` | 22.7 | 457 | 5.0% |
    | `core/tools/browserNavigateTool.ts` | 19.7 | 394 | 4.4% |
    | `src/core/memory/summarizer.ts` | 19.8 | 371 | 4.4% |
    | `core/context/context-engine.ts` | 19.7 | 354 | 4.4% |
    | `core/session/transcript.ts` | 15.9 | 264 | 3.5% |
    | `core/skills/skills-manager.ts` | 15.0 | 295 | 3.3% |
    | `core/tasks/background-task-manager.ts` | 13.5 | 288 | 3.0% |
    | `core/plan/plan-manager.ts` | 13.4 | 296 | 3.0% |
    | `core/memory/memory-engine.ts` | 13.3 | 298 | 3.0% |
    | `core/tools/browserExecTool.ts` | 13.3 | 273 | 3.0% |
    
    **Total project (no node_modules):** 1.31 MB / 251 files / ~4,500 SLOC
    
    ---
    
    ## 3. Top 10 Largest node_modules Dependencies
    
    | Dependency | Disk Size (MB) | Category |
    |-----------|:--------------:|----------|
    | `typescript` | **23.22** | Compiler |
    | `tiktoken` | **22.50** | OpenAI Tokenizer |
    | `@esbuild` | **10.85** | Bundler (tsx dep) |
    | `@babel` | **10.32** | Test transpiler |
    | `chromium-bidi` | **8.91** | Puppeteer dep |
    | `openai` | **7.15** | LLM SDK |
    | `puppeteer-core` | **5.41** | Browser automation |
    | `devtools-protocol` | **3.56** | Puppeteer dep |
    | `zod` | **3.43** | Validation |
    | `@types` | **2.76** | Type definitions |
    
    **Total:** 144.55 MB  
    
    ### Heavy dependencies analysis:
    - `typescript` (23.22 MB) + `@esbuild` (10.85 MB) = **34 MB for compilation** → could be dev-only
    - `puppeteer-core` + `chromium-bidi` + `devtools-protocol` = **17.88 MB for browser automation**
    - `tiktoken` (22.5 MB) is the largest runtime dependency — contains native bindings + vocabulary files
    - `openai` at 7.15 MB is moderate
    
    ---
    
    ## 4. Async/Await vs Sync Pattern Analysis
    
    **60 TypeScript files analyzed across core/ and src/**
    
    | Pattern | Occurrences | Files Using It |
    |---------|:----------:|:-------------:|
    | `await` | **205** | 29 |
    | `async function` | **23** | 5 |
    | `async arrow (=>)` | **45** | 19 |
    | `Promise` | **85** | 24 |
    | `Promise.all` | **1** | 1 |
    | `.then()` | **1** | 1 |
    | `readFileSync` | **18** | 12 |
    | `writeFileSync` | **9** | 8 |
    | `require()` | **2** | 1 |
    | `console.log` | **8** | 6 |
    | `try/catch` | **110** | 33 |
    
    ### Key findings:
    - **Async ratio:** 205 `await` + 23 `async function` + 45 `async arrow` = **273 async operations** vs **27 sync ops** (readFileSync + writeFileSync) → **~10:1 async-to-sync ratio**
    - **Top async files:**
      - `core/session/transcript.ts` — 31 awaits
      - `core/tools/browserExecTool.ts` — 30 awaits
      - `core/tools/browserNavigateTool.ts` — 29 awaits
      - `core/orchestrator/telegram.ts` — 22 awaits
      - `core/orchestrator/orchestrator.ts` — 19 awaits
    - **Sync concern:** 27 instances of `readFileSync`/`writeFileSync` across the codebase — these block the event loop
    - `try/catch` appears 110 times across 33 files — good error handling coverage
    
    ---
    
    ## 5. Project Architecture Overview
    
    | Directory | TS Files | Purpose |
    |-----------|:-------:|---------|
    | `core/tools/` | 14 | Tool implementations (browser, exec, etc.) |
    | `core/agents/` | 10 | Agent definitions and registry |
    | `core/agent/` | 5 | Core agent logic |
    | `core/orchestrator/` | 5 | Orchestration layer (main bottleneck) |
    | `core/context/` | 3 | Context management |
    | `core/memory/` | 3 | Memory system |
    | `core/utils/` | 3 | Utilities |
    | `src/` | 2 | Auxiliary files (summarizer, logger, Python manager) |
    
    ---
    
    ## 6. Recommendations
    
    1. **Lazy-load orchestrator.ts** — its 169ms load time is due to side effects during module initialization (agent creation). Convert to factory/lazy pattern.
    2. **Replace `readFileSync`/`writeFileSync`** — 27 sync I/O calls block the event loop. Use `fs.promises` instead.
    3. **Audit puppeteer dependency** — 17.88 MB is heavy. Consider lighter alternatives or loading on-demand.
    4. **Move typescript + @esbuild to devDependencies** — 34 MB unnecessarily bundled for production.
    5. **Consider tree-shaking tiktoken** — 22.5 MB is significant. Check if full vocab is needed.
    