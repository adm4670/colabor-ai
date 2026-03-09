import OpenAI from "openai";
import { Agent, AgentOptions } from "./agent";

jest.mock("openai");

describe("Agent", () => {

  const validOptions = (): AgentOptions => ({
    name: "CollaboratorBot",
    role: "assistant",
    goal: "Automate testing workflows",
    backstory:
      "CollaboratorBot was designed to help developers automate repetitive tasks.",
    model: "gpt-4o-mini",
    generalInstructions: "Always follow best practices.",
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should initialize properties correctly", () => {
    const options = validOptions();
    const agent = new Agent(options);

    expect(agent.name).toBe(options.name);
    expect(agent.role).toBe(options.role);
    expect(agent.goal).toBe(options.goal);
    expect(agent.backstory).toBe(options.backstory);
    expect(agent.model).toBe(options.model);
    expect(agent.generalInstructions).toBe(options.generalInstructions);
  });

  it("should use default values when optional fields are not provided", () => {
    const options = validOptions();
    delete (options as any).generalInstructions;
    delete (options as any).model;

    const agent = new Agent(options);

    expect(agent.model).toBe("gpt-4o-mini");
    expect(agent.generalInstructions).toContain("Responda em PT-BR");
  });

  it("should reset history", () => {
    const agent = new Agent(validOptions());

    (agent as any).history.push({ role: "user", content: "hello" });

    agent.resetHistory();

    expect((agent as any).history.length).toBe(0);
  });

  it("should call OpenAI and return response", async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "Hello developer!",
            tool_calls: null
          }
        }
      ]
    });

    (OpenAI as any).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }));

    const agent = new Agent(validOptions());

    const response = await agent.run("Hello");

    expect(mockCreate).toHaveBeenCalled();
    expect(response).toBe("Hello developer!");
  });

  it("should execute a tool when tool_call is returned", async () => {

    const toolFn = jest.fn().mockResolvedValue({ result: "done" });

    const mockCreate = jest
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "tool1",
                  type: "function",
                  function: {
                    name: "testTool",
                    arguments: JSON.stringify({ value: 1 })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Tool executed successfully",
              tool_calls: null
            }
          }
        ]
      });

    (OpenAI as any).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }));

    const agent = new Agent({
      ...validOptions(),
      functions: {
        testTool: toolFn
      }
    });

    const response = await agent.run("run tool");

    expect(toolFn).toHaveBeenCalled();
    expect(response).toBe("Tool executed successfully");
  });

  it("should return error message if tool throws exception", async () => {

    const toolFn = jest.fn().mockRejectedValue(new Error("tool failed"));

    const mockCreate = jest
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "tool1",
                  type: "function",
                  function: {
                    name: "testTool",
                    arguments: "{}"
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Recovered",
              tool_calls: null
            }
          }
        ]
      });

    (OpenAI as any).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    }));

    const agent = new Agent({
      ...validOptions(),
      functions: {
        testTool: toolFn
      }
    });

    const response = await agent.run("run tool");

    expect(response).toBe("Recovered");
  });

});