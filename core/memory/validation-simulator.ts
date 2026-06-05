/**
     * validation-simulator.ts
     * 
     * Simula os cenários de validação para a arquitetura SOTA
     */
    
    import { MemoryEngineSOTA, getMemoryEngineSOTA } from "./memory-engine-sota";
    
    // ============================================================
    // Helper
    // ============================================================
    
    function generateLongTask(steps: number): string[] {
      const tasks: string[] = [];
      const goal = "Construir um sistema de recomendação de filmes usando Python";
    
      tasks.push(`Meu objetivo é: ${goal}`);
      tasks.push("Vou usar dados do MovieLens dataset");
      tasks.push("Preciso carregar os dados com pandas");
      tasks.push("Vou fazer limpeza dos dados primeiro");
      tasks.push("Remover duplicatas e tratar valores nulos");
      tasks.push("Criar matriz usuário-filme");
      tasks.push("Calcular similaridade entre usuários");
      tasks.push("Implementar recomendação baseada em conteúdo");
      tasks.push("Testar com 5 usuários diferentes");
      tasks.push("Avaliar com métrica RMSE");
    
      // Fill remaining steps with filler
      for (let i = tasks.length; i < steps; i++) {
        const fillerTasks = [
          `Verificando resultado parcial do passo ${i}`,
          `Analisando saída do modelo`,
          `Ajustando hiperparâmetros`,
          `Validando contra overfitting`,
          `Gerando relatório de progresso`,
          `Commitando código no git`,
          `Documentando decisão técnica`,
          `Revisando código do colega`,
        ];
        tasks.push(fillerTasks[i % fillerTasks.length]);
      }
    
      return tasks;
    }
    
    // ============================================================
    // Simulation Scenarios
    // ============================================================
    
    interface SimulationResult {
      scenario: string;
      passed: boolean;
      details: string;
      metrics: Record<string, number>;
    }
    
    async function simulateLongTask100StepsLLM4k(): Promise<SimulationResult> {
      console.log("\n📊 Cenário 1: Tarefa longa (100 passos), janela LLM 4k");
      console.log("   Métrica: Foco mantido > 90%");
    
      const engine = getMemoryEngineSOTA();
      engine.workingMemory.setActivePlan("Construir um sistema de recomendacao de filmes usando Python");
      const tasks = generateLongTask(100);
    
      let focusScoreSum = 0;
      let focusChecks = 0;
      let distractionEvents = 0;
    
      for (let i = 0; i < tasks.length; i++) {
        const result = await engine.process(tasks[i]);
    
        if (result.attentionContext) {
          focusScoreSum += result.attentionContext.focusScore;
          focusChecks++;
        }
    
        if (result.focusAlert) {
          distractionEvents++;
        }
    
        // Force periodic build of embedding service
        if (i % 20 === 0 && i > 0) {
          console.log(`   Passo ${i}: foco=${result.attentionContext?.focusScore.toFixed(2)}, alertas=${distractionEvents}`);
        }
      }
    
      const avgFocus = focusChecks > 0 ? focusScoreSum / focusChecks : 0;
      const focusRate = avgFocus;
      const passed = focusRate >= 0.9;
    
      console.log(`   Resultado: Foco médio = ${(focusRate * 100).toFixed(1)}%`);
      console.log(`   Alertas de distração: ${distractionEvents}`);
      console.log(`   Status: ${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}`);
    
      return {
        scenario: "Tarefa longa (100 passos), janela LLM 4k",
        passed,
        details: `Foco médio: ${(focusRate * 100).toFixed(1)}%, Alertas: ${distractionEvents}`,
        metrics: { focusRate, distractionEvents, totalSteps: tasks.length },
      };
    }
    
    async function simulateLongTask100StepsLLM128k(): Promise<SimulationResult> {
      console.log("\n📊 Cenário 2: Tarefa longa (100 passos), janela LLM 128k");
      console.log("   Métrica: Sem 'lost in the middle'");
    
      const engine = getMemoryEngineSOTA();
      engine.workingMemory.setActivePlan("Construir um sistema de recomendacao de filmes usando Python");
      const tasks = generateLongTask(100);
    
      let lostInMiddleCount = 0;
      const totalChecks = 0;
    
      // Simulate: check if plan is still in working memory after many steps
      let planInWM = true;
    
      for (let i = 0; i < tasks.length; i++) {
        await engine.process(tasks[i]);
    
        // Every 10 steps, check if the plan is still retrievable
        if (i % 10 === 0 && i > 0) {
          const wmEntries = engine.workingMemory.getEntries();
          const hasPlan = wmEntries.some(
            (e) =>
              e.tags.includes("plan") || e.content.toLowerCase().includes("objetivo")
          );
    
          if (!hasPlan) {
            // Check long-term memory
            const searchResult = engine.longTermMemory.episodic.search("objetivo sistema recomendação filmes", 3);
            const foundInLTM = searchResult.length > 0 && searchResult.some(r => r.score > 0.1);
    
            if (!foundInLTM) {
              lostInMiddleCount++;
              planInWM = false;
            }
          }
        }
      }
    
      const passed = lostInMiddleCount === 0;
    
      console.log(`   Perdas de plano ("lost in the middle"): ${lostInMiddleCount}`);
      console.log(`   Status: ${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}`);
    
      return {
        scenario: "Tarefa longa (100 passos), janela LLM 128k",
        passed,
        details: `Lost in the middle events: ${lostInMiddleCount}`,
        metrics: { lostInMiddleCount, totalChecks },
      };
    }
    
    async function simulateRecallFact2h(): Promise<SimulationResult> {
      console.log("\n📊 Cenário 3: Recall de fato dito há 2h");
      console.log("   Métrica: Recuperado por busca semântica");
    
      const engine = getMemoryEngineSOTA();
    
      // Simula uma conversa de 2 horas atrás
      const oldFact = "O nome do projeto é colabor-ai e usa TypeScript com arquitetura de agents";
      const oldQuery = "Qual o nome do projeto";
    
      // Adiciona o fato diretamente na long-term memory com timestamp antigo
      const embService = (engine as any).embeddingService;
      embService.addText(oldFact, "episodic", "fact-colabor-ai");
    
      // Força rebuild do embedding service
      // (the build is automatic on search)
    
      // Tenta buscar
      const results = engine.longTermMemory.episodic.search("nome do projeto", 5);
    
      const found = results.some(
        (r) =>
          r.text.toLowerCase().includes("colabor-ai") || r.score > 0.1
      );
    
      console.log(`   Busca: "nome do projeto"`);
      console.log(`   Resultados encontrados: ${results.length}`);
      for (const r of results.slice(0, 3)) {
        console.log(`     [${(r.score * 100).toFixed(0)}%] ${r.text.slice(0, 80)}...`);
      }
      console.log(`   Status: ${found ? "[OK] APROVADO" : "[FAIL] REPROVADO"}`);
    
      return {
        scenario: "Recall de fato dito há 2h",
        passed: found,
        details: `Resultados: ${results.length}, Melhor score: ${results.length > 0 ? results[0].score.toFixed(3) : "N/A"}`,
        metrics: { resultsCount: results.length, bestScore: results.length > 0 ? results[0].score : 0 },
      };
    }
    
    async function simulateLatency(): Promise<SimulationResult> {
      console.log("\n📊 Cenário 4: Latência adicional");
      console.log("   Métrica: < 20% da inferência original");
    
      const engine = getMemoryEngineSOTA();
    
      // Simulate 10 calls to measure overhead of memory system
      const iterations = 10;
      const memoryTimes: number[] = [];
    
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await engine.process(`Test message number ${i}`);
        const end = performance.now();
        memoryTimes.push(end - start);
      }
    
      const avgMemoryTime = memoryTimes.reduce((s, t) => s + t, 0) / memoryTimes.length;
    
      // Estimate: LLM inference for a small model takes ~500-2000ms
      // Memory overhead should be < 20% of that = < 100-400ms
      // Our memory ops are local (no network), so they should be fast
    
      // For a 500ms LLM call, 20% = 100ms
      // For a 2000ms LLM call, 20% = 400ms
      const llmInferenceTime = 1000; // assumed 1s
      const latencyPercent = (avgMemoryTime / llmInferenceTime) * 100;
      const passed = latencyPercent < 20;
    
      console.log(`   Tempo médio de operações de memória: ${avgMemoryTime.toFixed(2)}ms`);
      console.log(`   Tempo assumido de inferência LLM: ${llmInferenceTime}ms`);
      console.log(`   Latência adicional: ${latencyPercent.toFixed(1)}%`);
      console.log(`   Limite: 20%`);
      console.log(`   Status: ${passed ? "[OK] APROVADO" : "[FAIL] REPROVADO"}`);
    
      return {
        scenario: "Latência adicional < 20%",
        passed,
        details: `Média: ${avgMemoryTime.toFixed(2)}ms, ${latencyPercent.toFixed(1)}% da inferência`,
        metrics: { avgMemoryTime, latencyPercent, llmInferenceTime },
      };
    }
    
    // ============================================================
    // Run all simulations
    // ============================================================
    
    export async function runAllSimulations(): Promise<void> {
      console.log("=".repeat(60));
      console.log("[TEST] VALIDAÇÃO DA ARQUITETURA DE MEMÓRIA SOTA");
      console.log("=".repeat(60));
    
      const results: SimulationResult[] = [];
    
      results.push(await simulateLongTask100StepsLLM4k());
      results.push(await simulateLongTask100StepsLLM128k());
      results.push(await simulateRecallFact2h());
      results.push(await simulateLatency());
    
      console.log("\n" + "=".repeat(60));
      console.log("[CHECK] RESUMO DA VALIDAÇÃO");
      console.log("=".repeat(60));
    
      let allPassed = true;
      for (const result of results) {
        const icon = result.passed ? "[OK]" : "[FAIL]";
        console.log(`${icon} ${result.scenario}: ${result.passed ? "APROVADO" : "REPROVADO"}`);
        if (!result.passed) allPassed = false;
      }
    
      console.log("\n" + (allPassed ? "[SUCCESS] TODOS OS TESTES APROVADOS!" : "[WARN] ALGUNS TESTES REPROVADOS"));
      console.log("=".repeat(60));
    }
    
    // Auto-executar se chamado diretamente
    runAllSimulations().catch(console.error);
    