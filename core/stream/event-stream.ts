/**
     * EventStream - Streaming de eventos baseado em AsyncIterable
     *
     * Inspirado no OpenClaw EventStream (packages/agent-core/src/llm.ts)
     * Permite que eventos sejam emitidos em tempo real durante a execucao
     * do agente, e consumidos via async iteration.
     */
    
    export type StreamEventType =
      | "agent_start"
      | "agent_end"
      | "turn_start"
      | "turn_end"
      | "message_start"
      | "message_update"
      | "message_end"
      | "text_start"
      | "text_delta"
      | "text_end"
      | "tool_call_start"
      | "tool_call_delta"
      | "tool_call_end"
      | "tool_execution_start"
      | "tool_execution_update"
      | "tool_execution_end";
    
    export interface StreamEvent {
      type: StreamEventType;
      content?: string;
      toolName?: string;
      toolCallId?: string;
      args?: Record<string, unknown>;
      result?: unknown;
      isError?: boolean;
      timestamp: number;
    }
    
    /**
     * EventStream: produtor-consumidor async iterable
     * Permite produzir eventos (push) e consumir via for-await-of
     */
    export class EventStream<T extends StreamEvent = StreamEvent, R = void> {
      private queue: T[] = [];
      private waiting: Array<(value: IteratorResult<T>) => void> = [];
      private done = false;
      private finalResult?: R;
      private resolveFinal!: (result: R) => void;
      private finalPromise: Promise<R>;
    
      constructor() {
        this.finalPromise = new Promise((resolve) => {
          this.resolveFinal = resolve;
        });
      }
    
      /** Emite um evento para todos os consumidores */
      push(event: T): void {
        if (this.done) return;
        const waiter = this.waiting.shift();
        if (waiter) {
          waiter({ value: event, done: false });
        } else {
          this.queue.push(event);
        }
      }
    
      /** Finaliza o stream com um resultado opcional */
      end(result?: R): void {
        this.done = true;
        if (result !== undefined) {
          this.finalResult = result;
          this.resolveFinal(result);
        }
        while (this.waiting.length > 0) {
          this.waiting.shift()?.({ value: undefined as unknown as T, done: true });
        }
      }
    
      /** Retorna o resultado final quando o stream terminar */
      result(): Promise<R> {
        return this.finalPromise;
      }
    
      /** Implementacao do AsyncIterable */
      async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
          if (this.queue.length > 0) {
            yield this.queue.shift()!;
          } else if (this.done) {
            return;
          } else {
            const result = await new Promise<IteratorResult<T>>((resolve) =>
              this.waiting.push(resolve)
            );
            if (result.done) return;
            yield result.value;
          }
        }
      }
    }
    
    /** Cria um evento com timestamp automatico */
    export function createEvent(
      type: StreamEventType,
      extra?: Partial<StreamEvent>
    ): StreamEvent {
      return {
        type,
        timestamp: Date.now(),
        ...extra,
      };
    }
    