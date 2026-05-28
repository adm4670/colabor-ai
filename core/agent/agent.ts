import OpenAI from "openai";
import { logger } from "../utils/logger";

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
  reasoning_content?: string;
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

    this.model = options.model ?? "deepseek-chat";
    this.generalInstructions =
      options.generalInstructions ?? "- Responda em PT-BR.\n";

    this.tools = options.tools ?? [];
    this.functions = options.functions ?? {};

    this.client = new OpenAI({
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
      baseURL: options.baseURL ?? "https://api.deepseek.com",
    });

    console.log(`🤖 Agent '${this.name}' inicializado`);
    console.log(`🧠 Model: ${this.model}`);
    console.log(`🛠 Tools disponíveis: ${this.tools.length}`);
  }

  resetHistory(): void {
    this.history = [];
    console.log(`[Agent] Histórico de ${this.name} resetado.`);
  }

  private async ensureSystemMessage(): Promise<void> {
    const systemPrompt = await this.buildSystemPrompt();
    if (this.history.length > 0 && this.history[0].role === "system") {
      this.history[0].content = systemPrompt;
    } else {
      this.history.unshift({ role: "system", content: systemPrompt });
    }
  }

  public async buildSystemPrompt(): Promise<string> {
    const toolsDescription = this.tools.length
      ? "\n      Ferramentas disponiveis:\n      " +
        this.tools.map(t => "- " + t.function.name + ": " + t.function.description).join("\n") +
        "\n\n      Use essas ferramentas quando precisar de dados externos ou executar acoes.\n      Se uma ferramenta for necessaria, utilize-a antes de responder ao usuario.\n      "
      : "";

    // Carregar skills relevantes (import dinâmico evita crash se o módulo não existir)
    let skillsInstructions = "";
    try {
      const { getSkillsManager } = await import("../skills/skills-manager");
      const contextHint = this.generalInstructions.substring(0, 200);
      const relevantSkills = getSkillsManager().loadRelevantSkills(contextHint);
      if (relevantSkills.length > 0) {
        skillsInstructions = "\n\n=== SKILLS DISPONIVEIS ===\n" +
          "Voce tem acesso as seguintes habilidades especializadas:\n\n" +
          relevantSkills.join("\n\n---\n\n") +
          "\n\nCarregue estas skills quando o contexto da conversa for relevante para elas.\n";
      }
    } catch (e) {
      // Skills manager não disponível
    }

    // Carregar notas diárias recentes (import dinâmico)
    let dailyContext = "";
    try {
      const { loadRecentNotes } = await import("../notes/notes-manager");
      const notes = loadRecentNotes();
      if (notes.trim()) {
        dailyContext = "\n\n=== NOTAS RECENTES ===\n" +
          "Aqui estao anotacoes de sessoes anteriores que podem ser uteis:\n" +
          notes.substring(0, 800) +
          "\n";
      }
    } catch (e) {
      // Notes não disponível
    }

    return (
      "Voce e o agente '" + this.name + "'.\n" +
      "Seu papel: " + this.role + "\n" +
      "Seu objetivo: " + this.goal + "\n" +
      "Contexto: " + this.backstory + "\n\n" +
      toolsDescription +
      skillsInstructions +
      dailyContext +
      "Instrucoes:\n" + this.generalInstructions
    );
  }

  /**
   * Carrega skills relevantes para um determinado contexto
   */
  public async getRelevantSkills(context: string): Promise<string[]> {
    try {
      const { getSkillsManager } = await import("../skills/skills-manager");
      return getSkillsManager().loadRelevantSkills(context);
    } catch {
      return [];
    }
  }

  async run(userMessage: string): Promise<string> {
    console.log("\n==============================");
    console.log(`📩 [${this.name}] User input:`);
    console.log(userMessage);

    await this.ensureSystemMessage();

    this.history.push({
      role: "user",
      content: userMessage,
    });

    try {
      while (true) {
        console.log("\n🧠 Enviando requisição para o modelo...");
        console.log(`📚 Histórico atual: ${this.history.length} mensagens`);

        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: this.history as any,
          tools: this.tools.length ? this.tools : undefined,
          tool_choice: this.tools.length ? "auto" : undefined,
          extra_body: {
            reasoning_effort: "high",
          },
        });

        const msg = response.choices[0].message;

        console.log("\n🤖 Resposta do modelo recebida");

        if (msg.content) {
          console.log("💬 Conteúdo:");
          console.log(msg.content);
        }
        if ((msg as any).reasoning_content) {
          console.log("🧠 Conteúdo do raciocínio recebido (será preservado).");
        }

        const assistantEntry: Message = {
          role: "assistant",
          content: msg.content,
        };

        if ((msg as any).reasoning_content) {
          assistantEntry.reasoning_content = (msg as any).reasoning_content;
        }

        if (msg.tool_calls) {
          console.log(`🔧 Tool calls detectadas: ${msg.tool_calls.length}`);
          assistantEntry.tool_calls = msg.tool_calls;
        }

        this.history.push(assistantEntry);

        if (!msg.tool_calls) {
          console.log("\n✅ Resposta final retornada ao usuário");
          return msg.content ?? "";
        }

        for (const toolCall of msg.tool_calls) {
          if (toolCall.type !== "function") continue;

          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || "{}");

          console.log("\n🔧 Executando tool:");
          console.log(`📌 Nome: ${toolName}`);
          console.log(`📥 Args:`, args);

          const fn = this.functions[toolName];

          let toolResult = "";

          try {
            if (fn) {
              const result = await fn(args);
              toolResult = JSON.stringify(result, null, 2);
              console.log("📤 Resultado da tool:");
              console.log(toolResult);
            } else {
              toolResult = "Erro: Função não encontrada.";
              console.log("❌ Tool não encontrada");
            }
          } catch (e: any) {
            toolResult = `Erro na execução: ${e.message}`;
            console.log("❌ Erro na execução da tool:");
            console.log(e.message);
          }

          this.history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult,
          });

          console.log("📚 Resultado adicionado ao histórico");
        }
      }
    } catch (e: any) {
      console.log("🚨 Erro no Agent:");
      console.log(e);

      return `⚠️ Erro no processamento: ${e.message}`;
    }
  }
}