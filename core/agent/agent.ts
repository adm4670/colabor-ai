import OpenAI from "openai";

export interface AgentOptions {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  model?: string;
  generalInstructions?: string;
  baseURL?: string;
  apiKey?: string;
  tools?: any[];
  functions?: Record<string, Function>;
}

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any;
};

export class Agent {
  public name: string;
  public role: string;
  public goal: string;
  public backstory: string;
  public model: string;
  public generalInstructions: string;

  private client: OpenAI;
  private history: Message[] = [];
  private tools: any[];
  private functions: Record<string, Function>;

  constructor(options: AgentOptions) {
    this.name = options.name;
    this.role = options.role;
    this.goal = options.goal;
    this.backstory = options.backstory;

    this.model = options.model ?? "gpt-4o-mini";
    this.generalInstructions =
      options.generalInstructions ?? "- Responda em PT-BR.\n";

    this.tools = options.tools ?? [];
    this.functions = options.functions ?? {};

    this.client = new OpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: options.baseURL
    });
  }

  resetHistory(): void {
    this.history = [];
    console.log(`[Agent] Histórico de ${this.name} resetado.`);
  }

  private buildSystemPrompt(): string {
    return (
      `Você é o agente '${this.name}'.\n` +
      `Seu papel: ${this.role}\n` +
      `Seu objetivo: ${this.goal}\n` +
      `Contexto: ${this.backstory}\n\n` +
      `Instruções:\n${this.generalInstructions}`
    );
  }

  private ensureSystemMessage(): void {
    if (!this.history.length || this.history[0].role !== "system") {
      this.history.unshift({
        role: "system",
        content: this.buildSystemPrompt()
      });
    }
  }

  async run(userMessage: string): Promise<string> {
    this.ensureSystemMessage();

    this.history.push({
      role: "user",
      content: userMessage
    });

    try {
      while (true) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: this.history as any,
          tools: this.tools.length ? this.tools : undefined,
          tool_choice: this.tools.length ? "auto" : undefined
        });

        const msg = response.choices[0].message;

        const assistantEntry: Message = {
          role: "assistant",
          content: msg.content
        };

        if (msg.tool_calls) {
          assistantEntry.tool_calls = msg.tool_calls;
        }

        this.history.push(assistantEntry);

        if (!msg.tool_calls) {
          return msg.content ?? "";
        }

        for (const toolCall of msg.tool_calls) {

          if (toolCall.type !== "function") {
            continue;
          }

          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || "{}");

          const fn = this.functions[toolName];

          let toolResult = "";

          try {
            if (fn) {
              const result = await fn(args);
              toolResult = JSON.stringify(result);
            } else {
              toolResult = "Erro: Função não encontrada.";
            }
          } catch (e: any) {
            toolResult = `Erro na execução: ${e.message}`;
          }

          this.history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult
          });
        }
      }
    } catch (e: any) {
      return `⚠️ Erro no processamento: ${e.message}`;
    }
  }
}