/**
     * Tests for Tool Protocol Message Types
     * Validates message format and field constraints.
     */
    import type {
      ToolCallMessage,
      ToolResultMessage,
      StreamChunkMessage,
      WSServerMessage,
      WSClientMessage,
      PendingToolCall,
    } from "../src/protocol/tool-protocol";
    
    describe("Tool Protocol - Message Types", () => {
      describe("ToolCallMessage", () => {
        it("should have all required fields", () => {
          const msg: ToolCallMessage = {
            type: "tool_call",
            id: "call-123",
            agent: "file_system",
            tool: "read_file",
            params: { path: "/tmp/test.txt" },
            requireConfirmation: false,
            sessionId: "session-abc",
            description: "Read file /tmp/test.txt",
          };
    
          expect(msg.type).toBe("tool_call");
          expect(msg.id).toBe("call-123");
          expect(msg.agent).toBe("file_system");
          expect(msg.tool).toBe("read_file");
          expect(msg.params.path).toBe("/tmp/test.txt");
          expect(msg.requireConfirmation).toBe(false);
          expect(msg.sessionId).toBe("session-abc");
        });
    
        it("should support dangerous tools with confirmation", () => {
          const msg: ToolCallMessage = {
            type: "tool_call",
            id: "call-456",
            agent: "shell",
            tool: "run_cmd",
            params: { command: "dir" },
            requireConfirmation: true,
            sessionId: "s1",
            description: "Run command: dir",
          };
    
          expect(msg.requireConfirmation).toBe(true);
          expect(msg.agent).toBe("shell");
        });
      });
    
      describe("ToolResultMessage", () => {
        it("should have ok status with result", () => {
          const msg: ToolResultMessage = {
            type: "tool_result",
            id: "call-123",
            status: "ok",
            result: "File contents here",
            sessionId: "session-abc",
          };
    
          expect(msg.status).toBe("ok");
          expect(msg.result).toBe("File contents here");
          expect(msg.error).toBeUndefined();
        });
    
        it("should have error status with error message", () => {
          const msg: ToolResultMessage = {
            type: "tool_result",
            id: "call-456",
            status: "error",
            error: "File not found",
            sessionId: "s1",
          };
    
          expect(msg.status).toBe("error");
          expect(msg.error).toBe("File not found");
        });
    
        it("should have cancelled status", () => {
          const msg: ToolResultMessage = {
            type: "tool_result",
            id: "call-789",
            status: "cancelled",
            sessionId: "s2",
          };
    
          expect(msg.status).toBe("cancelled");
        });
      });
    
      describe("StreamChunkMessage", () => {
        it("should support text chunks", () => {
          const chunk: StreamChunkMessage = {
            chunkType: "text",
            content: "Hello, user!",
            sessionId: "s1",
          };
    
          expect(chunk.chunkType).toBe("text");
          expect(chunk.content).toBe("Hello, user!");
        });
    
        it("should support tool_call chunks with agent", () => {
          const chunk: StreamChunkMessage = {
            chunkType: "tool_call",
            content: "Executing file_system",
            agent: "file_system",
            sessionId: "s1",
          };
    
          expect(chunk.chunkType).toBe("tool_call");
          expect(chunk.agent).toBe("file_system");
        });
    
        it("should support error chunks", () => {
          const chunk: StreamChunkMessage = {
            chunkType: "error",
            content: "Something went wrong",
            sessionId: "s1",
          };
    
          expect(chunk.chunkType).toBe("error");
        });
    
        it("should support end chunks", () => {
          const chunk: StreamChunkMessage = {
            chunkType: "end",
            content: "Task complete",
            sessionId: "s1",
          };
    
          expect(chunk.chunkType).toBe("end");
        });
      });
    
      describe("WSServerMessage union type", () => {
        it("should accept tool_call message", () => {
          const msg: WSServerMessage = {
            type: "tool_call",
            payload: {
              type: "tool_call",
              id: "1",
              agent: "shell",
              tool: "run_cmd",
              params: {},
              requireConfirmation: true,
              sessionId: "s1",
              description: "test",
            },
          };
          expect(msg.type).toBe("tool_call");
        });
    
        it("should accept stream message", () => {
          const msg: WSServerMessage = {
            type: "stream",
            payload: {
              chunkType: "text",
              content: "Hello",
              sessionId: "s1",
            },
          };
          expect(msg.type).toBe("stream");
        });
    
        it("should accept connected message", () => {
          const msg: WSServerMessage = {
            type: "connected",
            payload: {
              sessionId: "s1",
              message: "Welcome",
            },
          };
          expect(msg.type).toBe("connected");
        });
    
        it("should accept error message", () => {
          const msg: WSServerMessage = {
            type: "error",
            payload: {
              message: "Something failed",
              sessionId: "s1",
            },
          };
          expect(msg.type).toBe("error");
        });
      });
    
      describe("WSClientMessage union type", () => {
        it("should accept tool_result message", () => {
          const msg: WSClientMessage = {
            type: "tool_result",
            payload: {
              type: "tool_result",
              id: "1",
              status: "ok",
              result: "done",
              sessionId: "s1",
            },
          };
          expect(msg.type).toBe("tool_result");
        });
    
        it("should accept chat message", () => {
          const msg: WSClientMessage = {
            type: "chat",
            payload: {
              message: "Hello, AI!",
            },
          };
          expect(msg.type).toBe("chat");
          expect((msg.payload as any).message).toBe("Hello, AI!");
        });
    
        it("should accept ping message", () => {
          const msg: WSClientMessage = {
            type: "ping",
          };
          expect(msg.type).toBe("ping");
        });
      });
    
      describe("PendingToolCall", () => {
        it("should have resolve and reject functions", () => {
          const pending: PendingToolCall = {
            id: "call-1",
            resolve: () => {},
            reject: () => {},
            timeout: setTimeout(() => {}, 1000),
            message: {
              type: "tool_call",
              id: "call-1",
              agent: "file_system",
              tool: "read_file",
              params: {},
              requireConfirmation: false,
              sessionId: "s1",
              description: "test",
            },
          };
    
          expect(pending.id).toBe("call-1");
          expect(typeof pending.resolve).toBe("function");
          expect(typeof pending.reject).toBe("function");
          expect(pending.message.agent).toBe("file_system");
    
          clearTimeout(pending.timeout);
        });
      });
    });
    