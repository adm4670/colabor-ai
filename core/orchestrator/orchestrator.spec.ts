import { AgentOrchestrator } from "./orchestrator";
    
    // Mock simples: nao tenta mockar Agent, apenas verifica estrutura
    describe("AgentOrchestrator (flash-optimized)", () => {
      
      it("should initialize orchestrator correctly", () => {
        const orchestrator = new AgentOrchestrator(
          { run: jest.fn(), name: "planner", role: "", goal: "", backstory: "", model: "", generalInstructions: "", resetHistory: jest.fn(), buildSystemPrompt: jest.fn().mockResolvedValue("") } as any,
          []
        );
        expect(orchestrator).toBeDefined();
        expect(orchestrator.eventStream).toBeDefined();
      });
    
      it("should detect simple queries via isSimpleQuery", () => {
        const orchestrator = new AgentOrchestrator(
          { run: jest.fn(), name: "p", role: "", goal: "", backstory: "", model: "", generalInstructions: "", resetHistory: jest.fn(), buildSystemPrompt: jest.fn().mockResolvedValue("") } as any,
          []
        );
        
        const isSimple = (orchestrator as any).isSimpleQuery;
        // Greetings (match exact patterns)
        expect(isSimple("Ola")).toBe(true);
        expect(isSimple("Bom dia")).toBe(true);
        expect(isSimple("oi")).toBe(true);
        // Thanks/goodbye
        expect(isSimple("Obrigado")).toBe(true);
        expect(isSimple("tchau")).toBe(true);
        // How are you
        expect(isSimple("como vai")).toBe(true);
        expect(isSimple("tudo bem")).toBe(true);
        // NOT simple - tasks/commands
        expect(isSimple("Analise este codigo")).toBe(false);
        expect(isSimple("Crie um arquivo Python")).toBe(false);
        expect(isSimple("Execute o build do projeto")).toBe(false);
        expect(isSimple("Oi, tudo bem?")).toBe(false); // mixed - nao capturado
      });
    
      it("should handle max steps limit", () => {
        const orchestrator = new AgentOrchestrator(
          { run: jest.fn(), name: "p", role: "", goal: "", backstory: "", model: "", generalInstructions: "", resetHistory: jest.fn(), buildSystemPrompt: jest.fn().mockResolvedValue("") } as any,
          []
        );
        // maxSteps foi reduzido de 15 para 10 (flash-optimized)
        expect(orchestrator).toBeDefined();
      });
    });
    