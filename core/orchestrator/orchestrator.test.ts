import { Agent } from "../agent/agent";
import { AgentOrchestrator } from "./orchestrator";

describe("AgentOrchestrator Integration Test", () => {

  const hasApiKey = !!process.env.OPENAI_API_KEY;

  const planner = new Agent({
    name: "PlannerAgent",
    role: "Task planner",
    goal: "Decide which agent should execute the next step",
    backstory: "An AI specialized in coordinating other agents.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: `
You are an orchestrator planner.

You must decide which agent should act next.

Always respond ONLY with valid JSON:

{
 "agent": "agent_name | finish",
 "instruction": "what the agent should do"
}
`
  });

  const mathAgent = new Agent({
    name: "MathAgent",
    role: "Math specialist",
    goal: "Solve simple math operations",
    backstory: "An AI designed to perform mathematical calculations.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: "Return only the numeric result."
  });

  const writerAgent = new Agent({
    name: "WriterAgent",
    role: "Writer",
    goal: "Explain results clearly",
    backstory: "An AI specialized in writing explanations.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: "Write short explanations."
  });

  const orchestrator = new AgentOrchestrator(planner, [
    {
      name: "math",
      description: "Performs mathematical calculations",
      agent: mathAgent
    },
    {
      name: "writer",
      description: "Writes explanations",
      agent: writerAgent
    }
  ]);

  it("should coordinate agents to complete a task", async () => {

    if (!hasApiKey) {
      console.warn("⚠️ OPENAI_API_KEY not found. Skipping integration test.");
      return;
    }

    const result = await orchestrator.run(
      "Calculate 2 + 3 and explain the result."
    );

    expect(result).toBeDefined();
    expect(typeof result).toBe("string");

    expect(result).toMatch(/5/);

  }, 30000);

});