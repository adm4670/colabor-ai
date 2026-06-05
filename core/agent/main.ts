import { logger } from "../utils/logger";
import readline from "readline";
    import { Agent } from "./agent";
    import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    
    async function startConsoleAgent() {
    
      const agent = new Agent({
        name: "ConsoleAgent",
        role: "Personal AI assistant",
        goal: "Be a competent and trustworthy assistant",
        backstory: "An evolving assistant that interacts through the console.",
        model: process.env.MODEL || DEFAULT_MODEL,
        generalInstructions: CORE_INSTRUCTIONS
      });
    
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    
      logger.info("Agent iniciado. Digite 'exit' para sair.");
    
      while (true) {
    
        const userInput: string = await new Promise(resolve => {
          rl.question("You > ", resolve);
        });
    
        if (userInput.toLowerCase() === "exit") {
          break;
        }
    
        try {
    
          const response = await agent.run(userInput);
    
          logger.info("Agent >", { response });
    
        } catch (err) {
    
          console.error("Erro ao executar agent:", err);
    
        }
    
      }
    
      rl.close();
    }
    
    startConsoleAgent();
    