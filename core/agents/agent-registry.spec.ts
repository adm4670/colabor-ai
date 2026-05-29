/**
     * Testes para AgentRegistry
     */
    
    import { AgentRegistry } from "./agent-registry";
    import type { Agent } from "../agent/agent";
    
    describe("AgentRegistry", () => {
      let registry: AgentRegistry;
    
      // Mock agent
      function mockAgent(name: string): Agent {
        return {
          name,
          role: "test",
          goal: "test",
          backstory: "test",
          model: "test",
          generalInstructions: "",
        } as Agent;
      }
    
      beforeEach(() => {
        registry = new AgentRegistry();
      });
    
      it("should register and retrieve an agent", () => {
        const agent = mockAgent("TestAgent");
        registry.register({
          name: "TestAgent",
          description: "A test agent",
          agent,
          role: "tester",
        });
    
        expect(registry.size).toBe(1);
        expect(registry.has("TestAgent")).toBe(true);
        expect(registry.get("TestAgent")?.description).toBe("A test agent");
      });
    
      it("should find agent case-insensitively", () => {
        const agent = mockAgent("PythonAgent");
        registry.register({
          name: "PythonAgent",
          description: "Python executor",
          agent,
          role: "python",
        });
    
        expect(registry.find("pythonagent")?.name).toBe("PythonAgent");
        expect(registry.find("PYTHONAGENT")?.name).toBe("PythonAgent");
      });
    
      it("should return undefined for unknown agent", () => {
        expect(registry.get("NonExistent")).toBeUndefined();
        expect(registry.find("NonExistent")).toBeUndefined();
      });
    
      it("should register and retrieve planner", () => {
        const planner = mockAgent("PlannerBot");
        registry.registerPlanner(planner);
    
        expect(registry.getPlanner()?.name).toBe("PlannerBot");
      });
    
      it("should return subagents in correct format", () => {
        registry.register({
          name: "Agent1",
          description: "First agent",
          agent: mockAgent("Agent1"),
          role: "worker",
        });
        registry.register({
          name: "Agent2",
          description: "Second agent",
          agent: mockAgent("Agent2"),
          role: "worker",
        });
    
        const subs = registry.getSubAgents();
        expect(subs.length).toBe(2);
        expect(subs[0].name).toBe("Agent1");
        expect(subs[0].description).toBe("First agent");
      });
    
      it("should generate agent list for prompt", () => {
        registry.register({
          name: "WriterAgent",
          description: "Writes final responses",
          agent: mockAgent("WriterAgent"),
          role: "writer",
          useWhen: ["formatting", "final output"],
        });
    
        const prompt = registry.getAgentListForPrompt();
        expect(prompt).toContain("WriterAgent");
        expect(prompt).toContain("Writes final responses");
        expect(prompt).toContain("formatting");
      });
    
      it("should list agent names", () => {
        registry.register({
          name: "Alpha",
          description: "Alpha agent",
          agent: mockAgent("Alpha"),
          role: "alpha",
        });
        registry.register({
          name: "Beta",
          description: "Beta agent",
          agent: mockAgent("Beta"),
          role: "beta",
        });
    
        const names = registry.listNames();
        expect(names).toContain("Alpha");
        expect(names).toContain("Beta");
        expect(names.length).toBe(2);
      });
    
      it("should unregister agents", () => {
        registry.register({
          name: "ToRemove",
          description: "Will be removed",
          agent: mockAgent("ToRemove"),
          role: "temp",
        });
    
        expect(registry.size).toBe(1);
        registry.unregister("ToRemove");
        expect(registry.size).toBe(0);
        expect(registry.has("ToRemove")).toBe(false);
      });
    });
    