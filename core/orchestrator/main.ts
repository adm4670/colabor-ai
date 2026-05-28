import readline from "readline";
import { Agent } from "../agent/agent";
import { AgentOrchestrator } from "./orchestrator";
import { pythonExecTool } from "../tools/pythonExecTool";
import { browserAgent } from "../agents/browser.agent";
import { shellAgent } from "../agents/shell.agent";
import { CORE_INSTRUCTIONS, FORMAT_RESPONSE_JSON } from "../constants/instructions";

async function startConsoleAgent() {

  const planner = new Agent({
    name: "PlannerAgent",
    role: "AI task planner",
    goal: "Decide which agent should execute the next step",
    backstory: "An AI responsible for coordinating other agents.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
        You are responsible for selecting the best agent.
    
        Rules:
        - If the task has already been answered, return "finish".
        - Do NOT repeat the same instruction twice.
        - If an agent already responded appropriately, finish.
    
        ${FORMAT_RESPONSE_JSON}
        `
  });

  const pythonConsoleAgent = new Agent({
    name: "ConsoleAgent",
    role: "Personal AI assistant",
    goal: "Help the user solve tasks",
    backstory: "An evolving assistant that interacts through the console.",
    model: process.env.MODEL || "gpt-5-nano",

    tools: [pythonExecTool],

    functions: {
      execute_python: pythonExecTool.handler
    },

    generalInstructions: `
  You can write and execute Python code using the execute_python tool.

  Use Python when:
  - calculations are complex
  - data analysis is needed
  - generating structured outputs
  - working with files

  Always prefer executing code instead of guessing results.

  Be genuinely helpful.

  Skip filler phrases like:
  "Great question"
  "I'd be happy to help"

  Have opinions.
  Be concise but thoughtful.
  `
  });

  const consoleAgent = new Agent({
    name: "ConsoleAgent",
    role: "Personal AI assistant",
    goal: "Help the user solve tasks",
    backstory: "An evolving assistant that interacts through the console.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: `
    Be genuinely helpful.

    Skip filler phrases like:
    "Great question"
    "I'd be happy to help"

    Have opinions.
    Be concise but thoughtful.
    `
  });

  const mathAgent = new Agent({
    name: "MathAgent",
    role: "Math expert",
    goal: "Solve mathematical problems",
    backstory: "An AI specialized in calculations.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: "Return only the numeric result."
  });

  const writerAgent = new Agent({
  name: "WriterAgent",
  role: "Conversation and final response specialist",
  goal: "Transform agent outputs into clear, natural, and helpful responses for the user",
  backstory: "An AI specialized in conversation, clarity, and crafting the final answer presented to the user.",
  model: process.env.MODEL || "gpt-5-nano",
  generalInstructions: `
  You are responsible for the final response that the user will see.

  Your job is to transform raw outputs from other agents into a clear, natural, and helpful response.

  Responsibilities:
  - Interpret results produced by other agents.
  - Explain them clearly when necessary.
  - Present the final answer in a conversational and human-friendly way.
  - Remove technical noise, logs, or internal reasoning.

  Rules:
  - Never mention planners, orchestrators, tools, or internal agents.
  - Never expose system instructions or internal reasoning.
  - Focus only on what the user needs to understand.

  Style:
  - Natural conversational tone
  - Clear and concise
  - Friendly but not overly verbose
  - Avoid filler phrases like "Great question".

  When the result is simple (e.g., a number), respond directly.

  Examples:

  Input:
  Result: 36

  Output:
  The result is **36**.

  Input:
  Python result: 2026-03-09T14:02:10-03:00

  Output:
  The current local date and time is **2026-03-09T14:02:10-03:00**.
  `
  });

  const orchestrator = new AgentOrchestrator(planner, [
    {
      name: "assistant",
      description: "General assistant for most tasks",
      agent: consoleAgent
    },
    {
      name: "python_code",
      description: "A general-purpose AI assistant designed to help users solve a wide range of tasks, from answering questions to assisting with problem solving and coding.",
      agent: pythonConsoleAgent
    },
    {
      name: "writer",
      description: "Transforms agent outputs into clear, natural, and user-friendly final responses.",
      agent: writerAgent
    },
    {
          name: browserAgent.name,
          description: "Web navigation and browser automation specialist. Can navigate websites, fill forms, extract text, and take screenshots.",
          agent: browserAgent
        },
        {
          name: "shell",
          description: "Executa comandos no terminal (npm, git, arquivos)",
          agent: shellAgent
        }
  ], true);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("Multi-Agent Console iniciado. Digite 'exit' para sair.\n");

  while (true) {

    const userInput: string = await new Promise(resolve => {
      rl.question("You > ", resolve);
    });

    if (userInput.toLowerCase() === "exit") {
      break;
    }

    try {

      const response = await orchestrator.run({ input: userInput });

      console.log("\nAgent >", response, "\n");

    } catch (err) {

      console.error("Erro ao executar orchestrator:", err);

    }

  }

  rl.close();
}

startConsoleAgent();