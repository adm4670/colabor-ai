/**
     * Teste de integracao - Fase 2: Session Transcript v2 + Memory Search + EventStream
     *
     * Verifica:
     * - Session transcript com header versionado
     * - Backward compatibility com arquivos antigos (sem header)
     * - Migracao de arquivos antigos
     */
    
    import {
      loadSessionTranscript,
      saveSessionTranscript,
      generateSessionId,
      appendToTranscript,
      getSessionHeader,
      migrateSessionToV1,
      createSessionHeader,
      SESSION_VERSION,
    } from "../session/transcript";
    import { memorySearch } from "../memory/memory_search";
    import { EventStream, createEvent } from "../stream/event-stream";
    import * as fs from "fs";
    import * as path from "path";
    
    describe("Fase 2 - Transcript v2 (versionado)", () => {
    
      describe("Session Transcript v2", () => {
        const sessionId = generateSessionId("test_v2");
        const testMessages = [
          { role: "user" as const, content: "Ola", timestamp: Date.now() },
          { role: "assistant" as const, content: "Oi!", timestamp: Date.now() + 1 },
        ];
    
        it("deve salvar com header versionado", () => {
          saveSessionTranscript(sessionId, testMessages);
    
          // Verificar que o arquivo existe e comeca com header
          const filePath = path.join(process.cwd(), ".colabor-ai", "sessions", `${sessionId}.jsonl`);
          expect(fs.existsSync(filePath)).toBe(true);
    
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n").filter(Boolean);
    
          // Primeira linha deve ser o header
          const header = JSON.parse(lines[0]);
          expect(header.type).toBe("session");
          expect(header.version).toBe(SESSION_VERSION);
          expect(header.id).toBe(sessionId);
          expect(header.timestamp).toBeTruthy();
        });
    
        it("deve carregar transcript ignorando o header", () => {
          const loaded = loadSessionTranscript(sessionId);
          expect(loaded.length).toBe(2);
          expect(loaded[0].content).toBe("Ola");
          expect(loaded[1].content).toBe("Oi!");
        });
    
        it("deve adicionar mensagens com append (mantendo header)", () => {
          appendToTranscript(sessionId, {
            role: "user",
            content: "Tudo bem?",
            timestamp: Date.now(),
          });
    
          const loaded = loadSessionTranscript(sessionId);
          expect(loaded.length).toBe(3);
          expect(loaded[2].content).toBe("Tudo bem?");
        });
    
        it("getSessionHeader deve retornar o header", () => {
          const header = getSessionHeader(sessionId);
          expect(header).not.toBeNull();
          expect(header!.type).toBe("session");
          expect(header!.version).toBe(SESSION_VERSION);
        });
    
        it("deve criar header com parentSession", () => {
          const header = createSessionHeader("parent_123", "child_456");
          expect(header.parentSession).toBe("child_456");
        });
      });
    
      describe("Backward Compatibility", () => {
        const oldSessionId = generateSessionId("test_old");
    
        it("deve ler arquivo antigo sem header (formato legado)", () => {
          // Simular um arquivo antigo: escrever manualmente sem header
          const filePath = path.join(
            process.cwd(),
            ".colabor-ai",
            "sessions",
            `${oldSessionId}.jsonl`
          );
          const oldContent =
            JSON.stringify({ role: "user", content: "msg antiga 1", timestamp: Date.now() }) + "\n" +
            JSON.stringify({ role: "assistant", content: "resposta antiga", timestamp: Date.now() }) + "\n";
    
          fs.writeFileSync(filePath, oldContent, "utf-8");
    
          // Deve conseguir ler mesmo sem header
          const loaded = loadSessionTranscript(oldSessionId);
          expect(loaded.length).toBe(2);
          expect(loaded[0].content).toBe("msg antiga 1");
          expect(loaded[1].content).toBe("resposta antiga");
        });
    
        it("migrateSessionToV1 deve adicionar header em arquivo antigo", () => {
          const migrated = migrateSessionToV1(oldSessionId);
          expect(migrated).toBe(true);
    
          // Agora deve ter header
          const header = getSessionHeader(oldSessionId);
          expect(header).not.toBeNull();
          expect(header!.version).toBe(SESSION_VERSION);
    
          // Mensagens devem continuar acessiveis
          const loaded = loadSessionTranscript(oldSessionId);
          expect(loaded.length).toBe(2);
          expect(loaded[0].content).toBe("msg antiga 1");
        });
    
        it("migrateSessionToV1 nao deve alterar arquivo ja migrado", () => {
          const migrated = migrateSessionToV1(oldSessionId);
          expect(migrated).toBe(false); // Ja migrado
        });
      });
    
      describe("Memory Search", () => {
        it("deve encontrar termos no MEMORY.md", () => {
          const results = memorySearch("PlannerAgent");
          expect(results.length).toBeGreaterThan(0);
          expect(results.some((r) => r.content.includes("PlannerAgent"))).toBe(true);
        });
    
        it("deve retornar resultados vazios para termos inexistentes", () => {
          const results = memorySearch("xyz123_nonexistent_term_abc");
          expect(results.length).toBe(0);
        });
      });
    
      describe("EventStream", () => {
        it("deve emitir e consumir eventos", async () => {
          const stream = new EventStream();
    
          stream.push(createEvent("agent_start" as any as any));
          stream.push(createEvent("turn_start", { content: "Step 1" } as any as any));
          stream.push(createEvent("text_delta", { content: "Processando..." } as any as any));
    
          const events: any[] = [];
          setTimeout(() => {
            stream.push(createEvent("agent_end" as any as any));
            stream.end("done" as any as any);
          }, 10);
    
          for await (const event of stream) {
            events.push(event);
          }
    
          expect(events.length).toBe(4);
          expect(events[0].type).toBe("agent_start");
          expect(events[1].type).toBe("turn_start");
        });
    
        it("deve retornar o resultado final", async () => {
          const stream = new EventStream<any>();
    
          setTimeout(() => {
            stream.push(createEvent("agent_end" as any as any));
            stream.end("resultado_final" as any as any);
          }, 10);
    
          const result = await stream.result();
          expect(result).toBe("resultado_final");
        });
      });
    });
    