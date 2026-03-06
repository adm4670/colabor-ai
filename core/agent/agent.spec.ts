import { Agent, AgentOptions } from './agent'

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Mocked response'
              }
            }
          ]
        })
      }
    }
  }))
})

describe('Agent', () => {

  const validOptions = (): AgentOptions => ({
    name: 'CollaboratorBot',
    role: 'assistant',
    goal: 'Automate testing workflows',
    backstory:
      'CollaboratorBot was designed to help developers automate repetitive tasks and improve team productivity.',
    generalInstructions: 'Always follow best practices when automating tasks.',
    model: 'gpt-4o-mini',
  })

  it('should throw an error if name is not provided', () => {

    const options = { ...validOptions(), name: '' }

    expect(() => new Agent(options))
      .toThrow("Agent name is required")

  })

  it('should initialize the name property correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.name).toBe(options.name)

  })

  it('should throw an error if role is not provided', () => {

    const options = { ...validOptions(), role: '' }

    expect(() => new Agent(options))
      .toThrow("Agent role is required")

  })

  it('should initialize the role property correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.role).toBe(options.role)

  })

  it('should throw an error if goal is not provided', () => {

    const options = { ...validOptions(), goal: '' }

    expect(() => new Agent(options))
      .toThrow("Agent goal is required")

  })

  it('should initialize the goal property correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.goal).toBe(options.goal)

  })

  it('should throw an error if backstory is not provided', () => {

    const options = { ...validOptions(), backstory: '' }

    expect(() => new Agent(options))
      .toThrow("Agent backstory is required")

  })

  it('should initialize the backstory property correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.backstory).toBe(options.backstory)

  })

  it('should initialize generalInstructions correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.generalInstructions)
      .toBe(options.generalInstructions)

  })

  it('should initialize model correctly when provided', () => {

    const options = validOptions()
    const agent = new Agent(options)

    expect(agent.model)
      .toBe(options.model)

  })

  it('should build the system prompt correctly', () => {

    const options = validOptions()
    const agent = new Agent(options)

    const prompt = agent.buildSystemPrompt()

    expect(prompt).toContain(agent.name)
    expect(prompt).toContain(agent.role)
    expect(prompt).toContain(agent.goal)
    expect(prompt).toContain(agent.backstory)
    expect(prompt).toContain(agent.generalInstructions)

  })

  it('should run and return assistant message when no tools are called', async () => {

    const options = validOptions()

    const agent = new Agent({
      ...options,
      apiKey: 'test-key'
    })

    const result = await agent.run("Hello")

    expect(result).toBe("Mocked response")

  });

  it('should reset history correctly', () => {

    const agent = new Agent({
      ...validOptions(),
      apiKey: 'test-key'
    })

    agent.resetHistory()

    const history = (agent as any).history

    expect(history.length).toBe(0)

  });

  it("should reset history", () => {

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key"
    })

    ;(agent as any).history.push({ role: "user", content: "hello" })

    agent.resetHistory()

    const history = (agent as any).history

    expect(history.length).toBe(0)

  });

  it("should insert system message if history is empty", () => {

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key"
    })

    ;(agent as any).ensureSystemMessage()

    const history = (agent as any).history

    expect(history[0].role).toBe("system")

  });

  it("should handle tool execution error", async () => {

    const failingTool = {
      name: "fail_tool",
      description: "",
      parameters: {},
      execute: jest.fn().mockRejectedValue(new Error("tool failed"))
    }

    const registry: any = {
      getOpenAITools: jest.fn().mockReturnValue([
        {
          type: "function",
          function: {
            name: "fail_tool",
            description: "",
            parameters: {}
          }
        }
      ]),
      get: jest.fn().mockReturnValue(failingTool)
    }

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key",
      tools: registry
    })

    const client = (agent as any).client

    client.chat.completions.create
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "1",
              function: {
                name: "fail_tool",
                arguments: "{}"
              }
            }]
          }
        }]
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: "done" }
        }]
      })

    const result = await agent.run("test")

    expect(result).toBe("done")

  });

  it("should return error message when openai fails", async () => {

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key"
    })

    const client = (agent as any).client

    client.chat.completions.create.mockRejectedValue(
      new Error("openai error")
    )

    const result = await agent.run("hello")

    expect(result).toContain("Erro no processamento")

  });

  it("should not duplicate system message", () => {

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key"
    })

    const history = (agent as any).history

    history.push({
      role: "system",
      content: "existing"
    })

    ;(agent as any).ensureSystemMessage()

    expect(history.length).toBe(1)

  });

  it("should handle invalid tool arguments", async () => {

    const tool = {
      name: "test_tool",
      description: "",
      parameters: {},
      execute: jest.fn()
    }

    const registry: any = {
      getOpenAITools: jest.fn().mockReturnValue([
        {
          type: "function",
          function: {
            name: "test_tool",
            description: "",
            parameters: {}
          }
        }
      ]),
      get: jest.fn().mockReturnValue(tool)
    }

    const agent = new Agent({
      ...validOptions(),
      apiKey: "test-key",
      tools: registry
    })

    const client = (agent as any).client

    client.chat.completions.create
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "1",
              function: {
                name: "test_tool",
                arguments: "invalid json"
              }
            }]
          }
        }]
      })
      .mockResolvedValueOnce({
        choices: [{
          message: { content: "done" }
        }]
      })

    await agent.run("test")

    expect(tool.execute).not.toHaveBeenCalled()

  });
});