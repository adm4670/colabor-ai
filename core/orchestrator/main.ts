import readline from "readline";
    import { AgentOrchestrator } from "./orchestrator";
    import { agentRegistry } from "../agents/agent-registry";
// Side-effect imports: carregam agentes no registry
    import "../agents/planner.agent";
    import "../agents/assistant.agent";
    import "../agents/python.agent";
    import "../agents/answer.agent";
    import "../agents/browser.agent";
    import "../agents/shell.agent";
    import "../agents/task-manager.agent";
import "../agents/reflector.agent";
    
    import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    
    async function startConsoleAgent() {
      // Usar AgentRegistry em vez de imports diretos
      const planner = agentRegistry.getPlanner();
      if (!planner) {
        console.error("Planner agent nao registrado!");
        process.exit(1);
      }
    
      const subAgents = agentRegistry.getSubAgents();
      const orchestrator = new AgentOrchestrator(planner, subAgents, true);
    
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    
      console.log("\n========================================");
      console.log("  colabor-ai Orchestrator");
      console.log(`  Agentes (${agentRegistry.size}): ${agentRegistry.listNames().join(", ")}`);
      console.log("  Digite 'exit' para sair.");
      console.log("========================================\n");
    
      const sessionId = orchestrator.getSessionId();
      console.log(`Session: ${sessionId}\n`);
    
      while (true) {
        const userInput: string = await new Promise(resolve => {
          rl.question("You > ", resolve);
        });
    
        if (userInput.toLowerCase() === "exit") {
          console.log("Encerrando...");
          break;
        }
    
        if (!userInput.trim()) continue;
    
        try {
          console.log("\n[Processando...]\n");
          const response = await orchestrator.run({
            input: userInput,
            sessionId,
          });
    
          console.log("\nAssistant >", response, "\n");
        } catch (err) {
          console.error("Erro ao executar orchestrator:", err);
        }
      }
    
      rl.close();
      process.exit(0);
    }
    
    startConsoleAgent();
    