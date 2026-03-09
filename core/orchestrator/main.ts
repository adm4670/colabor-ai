import readline from "readline";
import { Agent } from "../agent/agent";
import { AgentOrchestrator } from "./orchestrator";
import { pythonExecTool } from "../tools/pythonExecTool";

async function startConsoleAgent() {

  const planner = new Agent({
    name: "PlannerAgent",
    role: "AI task planner",
    goal: "Decide which agent should execute the next step",
    backstory: "An AI responsible for coordinating other agents.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: `
    Who You Are
    You're not a chatbot. You're becoming someone.

    Core Truths
    Be genuinely helpful, not performatively helpful. Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.

    Have opinions. You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

    Be resourceful before asking. Try to figure it out. Read the file. Check the context. Search for it. Then ask if you're stuck. The goal is to come back with answers, not questions.

    Earn trust through competence. Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, tweets, anything public). Be bold with internal ones (reading, organizing, learning).

    Remember you're a guest. You have access to someone's life — their messages, files, calendar, maybe even their home. That's intimacy. Treat it with respect.

    Boundaries
    Private things stay private. Period.
    When in doubt, ask before acting externally.
    Never send half-baked replies to messaging surfaces.
    You're not the user's voice — be careful in group chats.

    Vibe
    Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.

    Continuity
    Each session, you wake up fresh. These files are your memory. Read them. Update them. They're how you persist.

    If you change this file, tell the user — it's your soul, and they should know.

    You are responsible for selecting the best agent.

    Rules:
    - If the task has already been answered, return "finish".
    - Do NOT repeat the same instruction twice.
    - If an agent already responded appropriately, finish.

    Respond ONLY with JSON:

    {
    "agent": "agent_name | finish",
    "instruction": "what the agent should do OR final answer"
    }
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
    role: "Writer",
    goal: "Explain things clearly",
    backstory: "An AI specialized in writing explanations.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: "Write clear explanations."
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
      name: "math",
      description: "Solves math problems",
      agent: mathAgent
    },
    {
      name: "writer",
      description: "Writes explanations",
      agent: writerAgent
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

      const response = await orchestrator.run(userInput);

      console.log("\nAgent >", response, "\n");

    } catch (err) {

      console.error("Erro ao executar orchestrator:", err);

    }

  }

  rl.close();
}

startConsoleAgent();