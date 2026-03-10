import { Agent } from "../agent/agent";

type SubAgent = {
  name: string;
  description: string;
  agent: Agent;
};

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

type RunInput = {
  input: string;
  history?: Message[];
};

export class AgentOrchestrator {

  constructor(
    private planner: Agent,
    private agents: SubAgent[],
    private debug = true
  ) {}

  private formatHistory(history: Message[] = []) {

    if (!history.length) return "No conversation history.";

    return history
      .map(m => {

        if (m.role === "tool") {
          return `tool(${m.name}): ${m.content}`;
        }

        return `${m.role}: ${m.content}`;

      })
      .join("\n");

  }

  async run({ input, history = [] }: RunInput) {

    if (this.debug) {
      console.log("\n==============================");
      console.log("🧠 ORCHESTRATOR START");
      console.log("📌 User input:", input);
    }

    const formattedHistory = this.formatHistory(history);

    let context = `
User request:
${input}

Conversation history:
${formattedHistory}
`;

    let steps = 0;
    let lastResult = "";
    let lastInstruction = "";

    const maxSteps = 10;

    while (steps < maxSteps) {

      if (this.debug) {
        console.log(`\n🔁 Step ${steps + 1}/${maxSteps}`);
      }

      const agentList = this.agents
        .map(a => `${a.name}: ${a.description}`)
        .join("\n");

      const plannerPrompt = `
User request:
${input}

Conversation history:
${formattedHistory}

Current context:
${context}

Available agents:
${agentList}

Rules:

1. ALWAYS select an agent for the first step.
2. Never return "finish" before an agent has produced a result.
3. Do NOT repeat the same instruction twice.
4. Use assistant for conversation and general questions.
5. Use python_code for calculations or code.
6. Use writer to produce the final response shown to the user.

Respond ONLY with JSON:

{
  "agent": "agent_name | finish",
  "instruction": "what the agent should do"
}
`;

      const decision = await this.planner.run(plannerPrompt);

      if (this.debug) {
        console.log("🧠 Planner raw decision:");
        console.log(decision);
      }

      let parsed: any;

      try {
        parsed = JSON.parse(decision);
      } catch {

        console.warn("⚠️ Planner returned invalid JSON");

        return lastResult || "Erro ao interpretar resposta do planner.";

      }

      if (this.debug) {
        console.log("📊 Parsed decision:", parsed);
      }

      // impedir finish antes de executar agente
      if (parsed.agent === "finish" && !lastResult) {

        if (this.debug) {
          console.warn("⚠️ Planner tried to finish before any agent ran.");
        }

        parsed.agent = this.agents[0].name;
        parsed.instruction = input;

      }

      // condição de parada correta
      if (parsed.agent === "finish") {

        if (this.debug) {
          console.log("\n✅ ORCHESTRATION FINISHED");
        }

        return lastResult || parsed.instruction || "Concluído.";

      }

      // proteção contra loop de instrução
      if (parsed.instruction === lastInstruction) {

        if (this.debug) {
          console.warn("⚠️ Repeated instruction detected. Stopping loop.");
        }

        return lastResult || context;

      }

      lastInstruction = parsed.instruction;

      const target = this.agents.find(a => a.name === parsed.agent);

      if (!target) {

        console.warn(`⚠️ Agent not found: ${parsed.agent}`);

        return lastResult || `Erro: agente '${parsed.agent}' não encontrado.`;

      }

      if (this.debug) {
        console.log(`🤖 Executing agent: ${parsed.agent}`);
        console.log("📨 Instruction:", parsed.instruction);
      }

      const agentPrompt = `
User request:
${input}

Conversation history:
${formattedHistory}

Instruction:
${parsed.instruction}

Context so far:
${context}
`;

      const result = await target.agent.run(agentPrompt);

      lastResult = result;

      if (this.debug) {
        console.log(`📥 Result from ${parsed.agent}:`);
        console.log(result);
      }

      context += `\n\n${parsed.agent} result:\n${result}`;

      steps++;

    }

    if (this.debug) {
      console.warn("\n⚠️ Max steps reached. Returning last result.");
    }

    return lastResult || "Não foi possível concluir a tarefa.";

  }

}