import readline from "readline";
    import { AgentOrchestrator } from "./orchestrator";
    
    // Importar agentes centralizados (unificado com telegram.ts)
    import { plannerAgent } from "../agents/planner.agent";
    import { pythonAgent } from "../agents/python.agent";
    import { answerAgent } from "../agents/answer.agent";
    import { assistantAgent } from "../agents/assistant.agent";
    import { shellAgent } from "../agents/shell.agent";
    import { browserAgent } from "../agents/browser.agent";
    import { taskManagerAgent } from "../agents/task-manager.agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    
    async function startConsoleAgent() {
      const orchestrator = new AgentOrchestrator(plannerAgent, [
        {
          name: assistantAgent.name,
          description: "General assistant for conversation, questions and explanations. Can search memory.",
          agent: assistantAgent
        },
        {
          name: pythonAgent.name,
          description: "Python execution specialist. Can write and run Python scripts for calculations, data analysis, and file manipulation.",
          agent: pythonAgent
        },
        {
          name: answerAgent.name,
          description: "Transforms agent outputs into clear, natural, and user-friendly final responses for chat.",
          agent: answerAgent
        },
        {
          name: browserAgent.name,
          description: "Web navigation and browser automation specialist. Can navigate websites, fill forms, extract text, and take screenshots.",
          agent: browserAgent
        },
        {
          name: shellAgent.name,
          description: "Shell command execution specialist. Can run npm, git, file operations, and system commands.",
          agent: shellAgent
        },
        {
          name: taskManagerAgent.name,
          description: "Task and activity management. Can create, list, and delete tasks/activities.",
          agent: taskManagerAgent
        }
      ], true);
    
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    
      console.log("\n========================================");
      console.log("  colabor-ai Orchestrator");
      console.log(`  Agentes: ${assistantAgent.name}, ${pythonAgent.name}, ${answerAgent.name}, ${browserAgent.name}, ${shellAgent.name}, ${taskManagerAgent.name}`);
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
    