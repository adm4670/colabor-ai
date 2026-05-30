/**
     * Tests for ContextEngine
     */
    import {
      ContextEngine,
      estimateTokens,
      estimateMessagesTokens,
    } from "../src/context/context-engine";
    import type { CloudMessage } from "../src/types";
    
    describe("ContextEngine", () => {
      describe("estimateTokens", () => {
        it("should estimate ~1 token per 4 chars", () => {
          expect(estimateTokens("Hello world")).toBe(3); // 11/4 = 2.75 -> 3
          expect(estimateTokens("a")).toBe(1);
          expect(estimateTokens("")).toBe(0);
        });
    
        it("should handle long text", () => {
          const text = "x".repeat(400);
          expect(estimateTokens(text)).toBe(100);
        });
    
        it("should handle unicode text", () => {
          const text = "Olá, mundo! Como vai você?";
          expect(estimateTokens(text)).toBeGreaterThan(0);
        });
      });
    
      describe("estimateMessagesTokens", () => {
        it("should sum tokens from all messages", () => {
          const msgs: CloudMessage[] = [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ];
          const tokens = estimateMessagesTokens(msgs);
          expect(tokens).toBeGreaterThan(0);
          expect(tokens).toBeLessThan(20);
        });
    
        it("should return 0 for empty array", () => {
          expect(estimateMessagesTokens([])).toBe(0);
        });
    
        it("should include role overhead", () => {
          const msg: CloudMessage = { role: "system", content: "test" };
          const tokens = estimateMessagesTokens([msg]);
          // content: 4/4=1 + role overhead: 2 = 3
          expect(tokens).toBe(3);
        });
      });
    
      describe("buildContext", () => {
        it("should return all messages when under budget", async () => {
          const engine = new ContextEngine({ maxTokens: 10000 });
          const messages: CloudMessage[] = [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ];
          engine.setHistory(messages);
          const result = await engine.buildContext();
          expect(result.summarizedCount).toBe(0);
          expect(result.messages.length).toBe(2);
        });
    
        it("should not compress when below minMessages", async () => {
          const engine = new ContextEngine({ maxTokens: 1, minMessages: 10 });
          const messages: CloudMessage[] = [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
          ];
          engine.setHistory(messages);
          const result = await engine.buildContext();
          expect(result.summarizedCount).toBe(0);
        });
    
        it("should keep recent messages intact (zone 1)", async () => {
          const engine = new ContextEngine({
            maxTokens: 20,
            minMessages: 3,
            keepRecentIntact: 3,
            summarizeZoneSize: 3,
            mode: "summarize",
          });
    
          const messages: CloudMessage[] = [];
          for (let i = 1; i <= 10; i++) {
            messages.push({
              role: i % 2 === 0 ? "assistant" : "user",
              content: `Message number ${i} with some additional text to increase size`,
            });
          }
    
          engine.setHistory(messages);
          const result = await engine.buildContext();
    
          // Should have summarized some messages
          expect(result.summarizedCount).toBeGreaterThan(0);
          // Should still have messages (summary + zone 1)
          expect(result.messages.length).toBeGreaterThan(0);
    
          // Last 3 messages should be intact
          const lastMsgs = result.messages.slice(-3);
          for (const msg of lastMsgs) {
            expect(msg.content).toContain("Message number");
          }
        });
    
        it("should handle empty history", async () => {
          const engine = new ContextEngine();
          engine.setHistory([]);
          const result = await engine.buildContext();
          expect(result.messages).toHaveLength(0);
          expect(result.summarizedCount).toBe(0);
        });
    
        it("should work in trim mode", async () => {
          const engine = new ContextEngine({
            maxTokens: 15,
            minMessages: 2,
            mode: "trim",
          });
    
          const messages: CloudMessage[] = [];
          for (let i = 0; i < 10; i++) {
            messages.push({
              role: "user",
              content: `Long message number ${i} with padding text`,
            });
          }
    
          engine.setHistory(messages);
          const result = await engine.buildContext();
    
          expect(result.messages.length).toBeLessThan(messages.length);
          expect(result.summarizedCount).toBeGreaterThan(0);
        });
    
        it("should preserve system messages", async () => {
          const engine = new ContextEngine({
            maxTokens: 20,
            minMessages: 3,
            keepRecentIntact: 2,
            mode: "summarize",
          });
    
          const messages: CloudMessage[] = [
            { role: "system", content: "IMPORTANT SYSTEM PROMPT" },
            { role: "user", content: "Message 1 with extra padding text here" },
            { role: "assistant", content: "Response 1 with extra padding text" },
            { role: "user", content: "Message 2 with extra padding text here" },
            { role: "assistant", content: "Response 2 with extra padding text" },
            { role: "user", content: "Message 3 with extra padding text here" },
            { role: "assistant", content: "Response 3 with extra padding text" },
            { role: "user", content: "Message 4 with extra padding text here" },
            { role: "assistant", content: "Final response with padding" },
          ];
    
          engine.setHistory(messages);
          const result = await engine.buildContext();
    
          // System message should be preserved
          const systemMsgs = result.messages.filter((m) => m.role === "system");
          expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
          expect(systemMsgs.some((m) => m.content.includes("IMPORTANT"))).toBe(true);
        });
      });
    
      describe("addMessage and setHistory", () => {
        it("should add messages incrementally", async () => {
          const engine = new ContextEngine({ maxTokens: 10000 });
    
          engine.addMessage({ role: "user", content: "First" });
          engine.addMessage({ role: "assistant", content: "Second" });
    
          const result = await engine.buildContext();
          expect(result.messages.length).toBe(2);
        });
    
        it("should invalidate cache on setHistory", async () => {
          const engine = new ContextEngine({ maxTokens: 10000 });
    
          engine.setHistory([{ role: "user", content: "Old" }]);
          const result1 = await engine.buildContext();
          expect(result1.messages.length).toBe(1);
    
          engine.setHistory([
            { role: "user", content: "New1" },
            { role: "user", content: "New2" },
          ]);
          const result2 = await engine.buildContext();
          expect(result2.messages.length).toBe(2);
        });
      });
    
      describe("Configuration", () => {
        it("should use default config when none provided", () => {
          const engine = new ContextEngine();
          const history = engine.getRawHistory();
          expect(history).toEqual([]);
        });
    
        it("should accept partial config override", () => {
          const engine = new ContextEngine({
            maxTokens: 500,
            minMessages: 3,
          });
          const history = engine.getRawHistory();
          expect(history).toEqual([]);
        });
      });
    });
    