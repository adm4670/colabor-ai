import OpenAI from "openai"
import { ToolRegistry } from "../tools/toolRegistry"
import { ToolContext } from "../tools/toolDefinition"

type Role = "system" | "user" | "assistant" | "tool"

interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

interface Message {
  role: Role
  content?: string
  name?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface AgentOptions {
  name: string
  role: string
  goal: string
  backstory: string

  model?: string
  baseURL?: string
  apiKey?: string

  tools?: ToolRegistry

  generalInstructions?: string
  currentUserId?: number
}

export class Agent {

  public readonly name: string
  public readonly role: string
  public readonly goal: string
  public readonly backstory: string

  public readonly model: string
  public readonly generalInstructions: string

  private currentUserId: number
  private history: Message[] = []

  private client: OpenAI
  private toolRegistry: ToolRegistry

  constructor(options: AgentOptions) {

    if (!options.name) throw new Error("Agent name is required")
    if (!options.role) throw new Error("Agent role is required")
    if (!options.goal) throw new Error("Agent goal is required")
    if (!options.backstory) throw new Error("Agent backstory is required")

    if (options.generalInstructions === "") {
      throw new Error("Agent generalInstructions cannot be empty")
    }

    if (options.model === "") {
      throw new Error("Agent model cannot be empty")
    }

    this.name = options.name
    this.role = options.role
    this.goal = options.goal
    this.backstory = options.backstory

    this.model = options.model ?? "gpt-4o-mini"

    this.generalInstructions =
      options.generalInstructions ?? "- Responda em PT-BR.\n"

    this.currentUserId = options.currentUserId ?? 1

    this.toolRegistry = options.tools ?? new ToolRegistry()

    this.client = new OpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: options.baseURL
    })
  }

  public resetHistory(): void {
    this.history = []
  }

  public buildSystemPrompt(): string {

    return `
Você é o agente '${this.name}'.

Papel:
${this.role}

Objetivo:
${this.goal}

Contexto:
${this.backstory}

ID do Usuário Atual: ${this.currentUserId}

Instruções:
${this.generalInstructions}
`.trim()

  }

  private ensureSystemMessage(): void {

    if (!this.history.length || this.history[0].role !== "system") {

      this.history.unshift({
        role: "system",
        content: this.buildSystemPrompt()
      })

    }

  }

  public async run(userMessage: string): Promise<string> {

    this.ensureSystemMessage()

    this.history.push({
      role: "user",
      content: userMessage
    })

    try {

      while (true) {

        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: this.history as any,
          tools: this.toolRegistry.getOpenAITools(),
          tool_choice: "auto"
        })

        const msg = response.choices[0].message

        const assistantEntry: Message = {
          role: "assistant",
          content: msg.content ?? ""
        }

        if (msg.tool_calls) {
          assistantEntry.tool_calls = msg.tool_calls as ToolCall[]
        }

        this.history.push(assistantEntry)

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          return msg.content ?? ""
        }

        for (const toolCall of msg.tool_calls as ToolCall[]) {

          const tool = this.toolRegistry.get(toolCall.function.name)

          let toolResult = ""

          try {

            if (!tool) {
              throw new Error("Tool não encontrada")
            }

            const args = JSON.parse(toolCall.function.arguments)

            const context: ToolContext = {
              agentName: this.name,
              userId: this.currentUserId
            }

            const result = await tool.execute(args, context)

            toolResult = JSON.stringify(result)

          } catch (err: any) {

            toolResult = `Erro na execução: ${err.message}`

          }

          this.history.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResult
          })

        }

      }

    } catch (error: any) {

      return `⚠️ Erro no processamento: ${error.message}`

    }

  }

}