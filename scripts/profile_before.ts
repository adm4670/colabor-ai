
    const fs = require('fs');
    const path = require('path');
    const { performance } = require('perf_hooks');
    
    async function runProfile() {
      const results = {};
      const startWall = performance.now();
      
      console.log('=== COLABOR-AI PROFILER ===');
      console.log(`Started at: ${new Date().toISOString()}`);
      console.log('');
      
      // --- Phase 1: Module loading ---
      console.log('[Phase 1] Loading modules...');
      const t0 = performance.now();
      
      const { Agent } = await import('../core/agent/agent.ts');
      const { AgentOrchestrator } = await import('../core/orchestrator/orchestrator.ts');
      const { ContextEngine } = await import('../core/context/context-engine.ts');
      const { MemoryEngine } = await import('../core/memory/memory-engine.ts');
      const { SkillsManager } = await import('../core/skills/skills-manager.ts');
      const { AgentRegistry } = await import('../core/agents/agent-registry.ts');
      const { ToolRegistry } = await import('../core/tools/toolRegistry.ts');
      const { TokenCounter } = await import('../core/context/token-counter.ts');
      const { EventStream } = await import('../core/stream/event-stream.ts');
      const { BackgroundTaskManager } = await import('../core/tasks/background-task-manager.ts');
      const { HookSystem } = await import('../core/hooks/hook-system.ts');
      const { PermissionSystem } = await import('../core/permissions/permission-system.ts');
      const { Scheduler } = await import('../core/scheduler/scheduler.ts');
      const { PlanManager } = await import('../core/plan/plan-manager.ts');
      
      const t1 = performance.now();
      results.moduleLoadTimeMs = Math.round(t1 - t0);
      console.log(`  Module load: ${results.moduleLoadTimeMs}ms`);
      
      // --- Phase 2: Initialization ---
      console.log('[Phase 2] Initializing subsystems...');
      const t2 = performance.now();
      
      const toolRegistry = ToolRegistry.getInstance();
      const agentRegistry = AgentRegistry.getInstance();
      agentRegistry.registerAll();
      const skillsManager = SkillsManager.getInstance();
      skillsManager.loadAll();
      const memoryEngine = MemoryEngine.getInstance();
      const permissionSystem = PermissionSystem.getInstance();
      const hookSystem = HookSystem.getInstance();
      const scheduler = Scheduler.getInstance();
      const planManager = PlanManager.getInstance();
      const backgroundTaskManager = BackgroundTaskManager.getInstance();
      
      const t3 = performance.now();
      results.initTimeMs = Math.round(t3 - t2);
      console.log(`  Initialization: ${results.initTimeMs}ms`);
      
      // --- Phase 3: Context building ---
      console.log('[Phase 3] Building context for a simple message...');
      const t4 = performance.now();
      
      const contextEngine = new ContextEngine({
        memory: memoryEngine,
        skills: skillsManager,
        agentRegistry,
      });
      
      const context = contextEngine.build({
        messages: [{ role: 'user', content: 'Ola, tudo bem?' }],
        agentType: 'assistant',
      });
      
      const t5 = performance.now();
      results.contextBuildTimeMs = Math.round(t5 - t4);
      results.contextSizeTokens = context ? (context.length || 0) : 0;
      console.log(`  Context build: ${results.contextBuildTimeMs}ms`);
      
      // --- Phase 4: Agent creation cost ---
      console.log('[Phase 4] Creating agent instance...');
      const t6 = performance.now();
      
      const agent = new Agent({
        agentType: 'assistant',
        tools: toolRegistry.getAll(),
        memory: memoryEngine,
      });
      
      const t7 = performance.now();
      results.agentCreationTimeMs = Math.round(t7 - t6);
      console.log(`  Agent creation: ${results.agentCreationTimeMs}ms`);
      
      // --- Phase 5: Tool registration count ---
      const tools = toolRegistry.getAll();
      results.toolCount = tools.length;
      console.log(`  Registered tools: ${results.toolCount}`);
      
      // --- Phase 6: Skills loaded count ---
      const skills = skillsManager.getAll();
      results.skillsCount = skills.length;
      console.log(`  Skills loaded: ${results.skillsCount}`);
      
      results.totalWallTimeMs = Math.round(performance.now() - startWall);
      console.log(`\n=== TOTAL WALL TIME: ${results.totalWallTimeMs}ms ===`);
      
      // Estimate potential LLM call cost (0.01 tokens as base)
      results.estimatedPromptTokens = Math.round(results.contextSizeTokens * 0.75);
      
      // Save
      const outputPath = path.join(process.cwd(), 'data', 'profile_before.json');
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\nSaved to: ${outputPath}`);
      console.log(JSON.stringify(results, null, 2));
    }
    
    runProfile().catch(err => {
      console.error('FATAL:', err.message);
      console.error(err.stack?.substring(0, 1000));
      process.exit(1);
    });
    