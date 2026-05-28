/**
     * Teste de integracao - Fase 1: Session Transcript + Memory Search + EventStream
     *
     * Verifica se os novos modulos funcionam corretamente
     */
    
    import { loadSessionTranscript, saveSessionTranscript, generateSessionId, appendToTranscript } from "../session/transcript";
    import { memorySearch, appendToMemory, writeDailyNote, readMemoryFile } from "../memory/memory_search";
    import { EventStream, createEvent } from "../stream/event-stream";
    
    describe("Fase 1 - Melhorias", () => {
      
      describe("Session Transcript", () => {
        const sessionId = generateSessionId("test");
        const testMessages = [
          { role: "user" as const, content: "Ola", timestamp: Date.now() },
          { role: "assistant" as const, content: "Oi!", timestamp: Date.now() + 1 },
        ];
    
        it("deve salvar e carregar transcript", () => {
          saveSessionTranscript(sessionId, testMessages);
          const loaded = loadSessionTranscript(sessionId);
          expect(loaded.length).toBe(2);
          expect(loaded[0].content).toBe("Ola");
          expect(loaded[1].content).toBe("Oi!");
        });
    
        it("deve adicionar mensagens ao transcript", () => {
          appendToTranscript(sessionId, { role: "user", content: "Tudo bem?", timestamp: Date.now() });
          const loaded = loadSessionTranscript(sessionId);
          expect(loaded.length).toBe(3);
          expect(loaded[2].content).toBe("Tudo bem?");
        });
      });
    
      describe("Memory Search", () => {
        it("deve encontrar termos no MEMORY.md", () => {
          const results = memorySearch("PlannerAgent");
          expect(results.length).toBeGreaterThan(0);
          expect(results.some(r => r.content.includes("PlannerAgent"))).toBe(true);
        });
    
        it("deve retornar resultados vazios para termos inexistentes", () => {
          const results = memorySearch("xyz123_nonexistent_term_abc");
          expect(results.length).toBe(0);
        });
      });
    
      describe("EventStream", () => {
        it("deve emitir e consumir eventos", async () => {
          const stream = new EventStream();
          
          stream.push(createEvent("agent_start"));
          stream.push(createEvent("turn_start", { content: "Step 1" }));
          stream.push(createEvent("text_delta", { content: "Processando..." }));
          
          const events: any[] = [];
          setTimeout(() => {
            stream.push(createEvent("agent_end"));
            stream.end("done");
          }, 10);
    
          for await (const event of stream) {
            events.push(event);
          }
          
          expect(events.length).toBe(4);
          expect(events[0].type).toBe("agent_start");
          expect(events[1].type).toBe("turn_start");
        });
    
        it("deve retornar o resultado final", async () => {
          const stream = new EventStream<string>();
          
          setTimeout(() => {
            stream.push(createEvent("agent_end"));
            stream.end("resultado_final");
          }, 10);
    
          const result = await stream.result();
          expect(result).toBe("resultado_final");
        });
      });
    });
    