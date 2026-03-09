import { Agent } from "./agent";

describe("Agent Integration Test (with tools)", () => {

  const hasApiKey = !!process.env.OPENAI_API_KEY;

  const sumTool = {
    type: "function",
    function: {
      name: "sum_numbers",
      description: "Sum two numbers",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" }
        },
        required: ["a", "b"]
      }
    },
    execute: async ({ a, b }: { a: number; b: number }) => {
      return a + b;
    }
  };

  const agent = new Agent({
    name: "IntegrationBot",
    role: "Test assistant",
    goal: "Answer simple questions to validate integration",
    backstory: "An AI created specifically for integration testing.",
    model: process.env.MODEL || "gpt-5-nano",
    generalInstructions: "Use tools whenever necessary and answer concisely.",
    tools: [sumTool]
  });

  it("should call tool and return correct result", async () => {

    if (!hasApiKey) {
      console.warn("⚠️ OPENAI_API_KEY not found. Skipping integration test.");
      return;
    }

    const response = await agent.run(
      "Use the sum_numbers tool to sum 2 and 3 and return only the result."
    );

    expect(response).toBeDefined();
    expect(typeof response).toBe("string");

    expect(response).toMatch(/5/);

  }, 20000);

});