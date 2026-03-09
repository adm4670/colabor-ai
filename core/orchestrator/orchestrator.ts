import { Agent } from "../agent/agent";

type SubAgent = {
  name: string;
  description: string;
  agent: Agent;
};

export class AgentOrchestrator {
  constructor(
    private planner: Agent,
    private agents: SubAgent[],
    private debug = true
  ) {}

  async run(task: string) {

    if (this.debug) {
      console.log("\n🧠 Orchestrator started");
      console.log("📌 Task:", task);
    }

    let context = task;
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

      const decision = await this.planner.run(`
        Task:
        ${context}

        Available agents:
        ${agentList}

        Rules:
        - You MUST select an agent to perform the work.
        - Do NOT answer the user directly.
        - Only return "finish" after an agent has produced the final result.
        - Do NOT repeat the same instruction twice.

        Respond ONLY with JSON:

        {
        "agent": "agent_name | finish",
        "instruction": "what the agent should do"
        }
        `);

      if (this.debug) {
        console.log("🧠 Planner raw decision:");
        console.log(decision);
      }

      let parsed: any;

      try {
        parsed = JSON.parse(decision);
      } catch (err) {
        throw new Error("Planner returned invalid JSON");
      }

      if (this.debug) {
        console.log("📊 Parsed decision:", parsed);
      }

      // finish condition
      if (parsed.agent === "finish") {

        if (this.debug) {
          console.log("\n✅ Orchestration finished");
        }

        return lastResult || parsed.instruction || context;
      }

      // detect repeated instruction (loop protection)
      if (parsed.instruction === lastInstruction) {

        if (this.debug) {
          console.warn("⚠️ Repeated instruction detected. Stopping loop.");
        }

        return lastResult || context;
      }

      lastInstruction = parsed.instruction;

      const target = this.agents.find(a => a.name === parsed.agent);

      if (!target) {
        throw new Error(`Agent not found: ${parsed.agent}`);
      }

      if (this.debug) {
        console.log(`🤖 Executing agent: ${parsed.agent}`);
        console.log("📨 Instruction:", parsed.instruction);
      }

      const result = await target.agent.run(parsed.instruction);

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

    return lastResult || context;
  }
}