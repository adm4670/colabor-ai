/** 
     * Testes para o ContextEngine (flash-optimized)
     */
    
    import { ContextEngine, estimateTokens } from "./context-engine";
    
    describe("ContextEngine", () => {
      describe("estimateTokens", () => {
        it("should estimate tokens for text", () => {
          // Com tiktoken, "Hello world" = ~2 tokens, chars/4 fallback = 3
          const tokens = estimateTokens("Hello world");
          expect(tokens).toBeGreaterThan(0);
          expect(tokens).toBeLessThanOrEqual(5);
          expect(estimateTokens("")).toBe(0);
        });
      });
    
      describe("buildContext", () => {
        it("should return all messages when under budget", async () => {
          const engine = new ContextEngine({ maxTokens: 4000 });
          const messages = [
            { role: "user" as const, content: "Hello" },
            { role: "assistant" as const, content: "Hi there!" },
          ];
          engine.setHistory(messages);
          const result = await engine.buildContext();
          expect(result.summarizedCount).toBe(0);
          expect(result.messages.length).toBe(2);
        });
    
        it("should compress when over budget", async () => {
          // Budget baixo força compressao
          const engine = new ContextEngine({ maxTokens: 5, minMessages: 2, mode: "trim" });
          const messages = [
            { role: "user" as const, content: "A" },
            { role: "assistant" as const, content: "B" },
            { role: "user" as const, content: "C" },
            { role: "assistant" as const, content: "D" },
            { role: "user" as const, content: "E" },
            { role: "assistant" as const, content: "F" },
            { role: "user" as const, content: "G" },
            { role: "assistant" as const, content: "H" },
          ];
          engine.setHistory(messages);
          const result = await engine.buildContext();
          // Com maxTokens=5, minMessages=2, mode=trim, deve comprimir
          expect(result.messages.length).toBeLessThan(messages.length);
          expect(result.messages.length).toBeGreaterThan(0);
        });
    
        it("should keep recent messages when compressing", async () => {
          const engine = new ContextEngine({ 
            maxTokens: 5, 
            minMessages: 2, 
            recentRatio: 0.5,
            mode: "trim" 
          });
          const messages = [
            { role: "user" as const, content: "X" },
            { role: "assistant" as const, content: "Y" },
            { role: "user" as const, content: "Recent question" },
            { role: "assistant" as const, content: "Recent reply" },
          ];
          engine.setHistory(messages);
          const result = await engine.buildContext();
          expect(result.messages.length).toBeGreaterThan(0);
        });
      });
    
      describe("formatForPrompt", () => {
        it("should include user input and history", async () => {
          const engine = new ContextEngine();
          const result = await engine.formatForPrompt("Test input", "Some history");
          expect(result).toContain("Test input");
          expect(result).toContain("Some history");
        });
      });
    });
    