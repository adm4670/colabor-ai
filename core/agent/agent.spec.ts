import { Agent, AgentOptions } from './agent'
    
    jest.mock('openai', () => {
      return {
        default: jest.fn().mockImplementation(() => ({
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
        })),
        __esModule: true
      }
    })
    
    describe('Agent (flash-optimized)', () => {
    
      const validOptions = (): AgentOptions => ({
        name: 'TestAgent',
        role: 'tester',
        goal: 'Run tests',
        backstory: 'A test agent',
        generalInstructions: 'Be helpful',
        model: 'deepseek-v4-flash',
      })
    
      it('should initialize with all properties', () => {
        const options = validOptions()
        const agent = new Agent(options)
    
        expect(agent.name).toBe(options.name)
        expect(agent.role).toBe(options.role)
        expect(agent.goal).toBe(options.goal)
        expect(agent.backstory).toBe(options.backstory)
        expect(agent.model).toBe(options.model)
      })
    
      it('should use MODEL_TIERS.default when no model specified', () => {
        const options = { ...validOptions(), model: undefined }
        const agent = new Agent(options)
        expect(agent.model).toBeDefined()
      })
    
      it('should build system prompt with agent info', async () => {
        const options = validOptions()
        const agent = new Agent(options)
    
        const prompt = await agent.buildSystemPrompt()
    
        expect(prompt).toContain(agent.name)
        expect(prompt).toContain(agent.role)
        expect(prompt).toContain(agent.goal)
        expect(prompt).toContain(agent.backstory)
      })
    
      it('should build system prompt with tools when provided', async () => {
        const options = {
          ...validOptions(),
          tools: [
            { function: { name: 'test_tool', description: 'A test tool' } }
          ],
          functions: { test_tool: jest.fn() }
        }
        const agent = new Agent(options)
        const prompt = await agent.buildSystemPrompt()
        expect(prompt).toContain('test_tool')
      })
    
      it('should run and return assistant message', async () => {
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key'
        })
    
        const result = await agent.run("Hello")
        expect(result).toBe("Mocked response")
      })
    
      it('should reset history correctly', () => {
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key'
        })
        agent.resetHistory()
        const history = (agent as any).history
        expect(history.length).toBe(0)
      })
    
      it('should handle tool calls', async () => {
        const mockFn = jest.fn().mockResolvedValue('tool result')
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key',
          tools: [
            { function: { name: 'my_tool', description: 'test' } }
          ],
          functions: { my_tool: mockFn }
        })
    
        const client = (agent as any).client
        client.chat.completions.create
          .mockResolvedValueOnce({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: '1',
                  function: { name: 'my_tool', arguments: '{"key":"val"}' }
                }]
              }
            }]
          })
          .mockResolvedValueOnce({
            choices: [{ message: { content: 'final result' } }]
          })
    
        const result = await agent.run('test')
        expect(mockFn).toHaveBeenCalledWith({ key: 'val' })
        expect(result).toBe('final result')
      })
    
      it('should handle tool execution errors gracefully', async () => {
        const failingFn = jest.fn().mockRejectedValue(new Error('tool error'))
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key',
          tools: [
            { function: { name: 'bad_tool', description: 'fails' } }
          ],
          functions: { bad_tool: failingFn }
        })
    
        const client = (agent as any).client
        client.chat.completions.create
          .mockResolvedValueOnce({
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: '1',
                  function: { name: 'bad_tool', arguments: '{}' }
                }]
              }
            }]
          })
          .mockResolvedValueOnce({
            choices: [{ message: { content: 'recovered' } }]
          })
    
        const result = await agent.run('test')
        expect(result).toBe('recovered')
      })
    
      it('should throw when API fails', async () => {
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key'
        })
    
        const client = (agent as any).client
        client.chat.completions.create.mockRejectedValue(
          new Error('openai error')
        )
    
        await expect(agent.run('hello')).rejects.toThrow('openai error')
      })
    
      it('should accept onProgress callback', async () => {
        const agent = new Agent({
          ...validOptions(),
          apiKey: 'test-key'
        })
    
        const onProgress = jest.fn().mockResolvedValue(undefined)
        const result = await agent.run('Hello', onProgress)
    
        expect(result).toBe('Mocked response')
      })
    })
    