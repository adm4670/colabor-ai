export interface AgentOptions {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  generalInstructions: string;
  model: string;
}

export class Agent {
  public name: string;
  public role: string;
  public goal: string;
  public backstory: string;
  public generalInstructions: string;
  public model: string;

  constructor(options: AgentOptions) {
    this.name = Agent.validateField(options.name, 'name');
    this.role = Agent.validateField(options.role, 'role');
    this.goal = Agent.validateField(options.goal, 'goal');
    this.backstory = Agent.validateField(options.backstory, 'backstory');
    this.generalInstructions = Agent.validateField(options.generalInstructions, 'generalInstructions');
    this.model = Agent.validateField(options.model, 'model');
  }

  // Método para construir o system prompt
  public buildSystemPrompt(): string {
  return [
      '=== AGENT PROFILE ===',
      `Name: ${this.name}`,
      `Role: ${this.role}`,
      `Goal: ${this.goal}`,
      'Backstory:',
      `${this.backstory}`,
      '',
      '=== INSTRUCTIONS ===',
      this.formatInstructions(this.generalInstructions),
      '===================='
    ].join('\n');
  }

  // Método auxiliar para formatar instruções como bullet points
  private formatInstructions(instructions: string): string {
    // Quebra por linhas e adiciona "-"
    return instructions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `- ${line}`)
      .join('\n');
  }

  // Validação de campos obrigatórios
  private static validateField(value: string | undefined, fieldName: string): string {
    if (!value || !value.trim()) {
      throw new Error(`The ${fieldName} field should be filled!`);
    }
    return value.trim();
  }
}