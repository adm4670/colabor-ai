import { Agent } from "../agent/agent";

type SubAgent = {
  name: string;
  description: string;
  agent: Agent;
};

export class AgentOrchestrator {

  constructor(
    private planner: Agent,
    private agents: SubAgent[]
  ) {}

  async run(task: string) {

    let context = task;
    let steps = 0;
    const maxSteps = 10;

    while (steps < maxSteps) {

      const agentList = this.agents
        .map(a => `${a.name}: ${a.description}`)
        .join("\n");

      const decision = await this.planner.run(`
Task:
${context}

Available agents:
${agentList}

Decide which agent should act next.

Respond JSON:
{
 "agent": "agent_name | finish",
 "instruction": "what the agent should do"
}
`);

      const parsed = JSON.parse(decision);

      if (parsed.agent === "finish") {
        return parsed.instruction;
      }

      const target = this.agents.find(a => a.name === parsed.agent);

      if (!target) {
        throw new Error("Agent not found");
      }

      const result = await target.agent.run(parsed.instruction);

      context += `\n\n${parsed.agent} result:\n${result}`;

      steps++;
    }

    return context;
  }
}