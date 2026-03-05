import { Agent, AgentOptions } from './agent';

describe('Agent', () => {
  // Função auxiliar para criar opções válidas
  const validOptions = (): AgentOptions => ({
    name: 'CollaboratorBot',
    role: 'assistant',
    goal: 'Automate testing workflows',
    backstory: 'CollaboratorBot was designed to help developers automate repetitive tasks and improve team productivity.',
    generalInstructions: 'Always follow best practices when automating tasks.',
    model: 'gpt-4o-mini',
  });

  it('should throw an error if name is not provided', () => {
    const options = { ...validOptions(), name: '' };
    expect(() => new Agent(options)).toThrow("The name field should be filled!");
  });

  it('should initialize the name property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.name).toBe(options.name);
  });

  it('should throw an error if role is not provided', () => {
    const options = { ...validOptions(), role: '' };
    expect(() => new Agent(options)).toThrow("The role field should be filled!");
  });

  it('should initialize the role property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.role).toBe(options.role);
  });

  it('should throw an error if goal is not provided', () => {
    const options = { ...validOptions(), goal: '' };
    expect(() => new Agent(options)).toThrow("The goal field should be filled!");
  });

  it('should initialize the goal property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.goal).toBe(options.goal);
  });

  it('should throw an error if backstory is not provided', () => {
    const options = { ...validOptions(), backstory: '' };
    expect(() => new Agent(options)).toThrow("The backstory field should be filled!");
  });

  it('should initialize the backstory property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.backstory).toBe(options.backstory);
  });

  it('should throw an error if generalInstructions is not provided', () => {
    const options = { ...validOptions(), generalInstructions: '' };
    expect(() => new Agent(options)).toThrow("The generalInstructions field should be filled!");
  });

  it('should initialize the generalInstructions property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.generalInstructions).toBe(options.generalInstructions);
  });

  it('should throw an error if model is not provided', () => {
    const options = { ...validOptions(), model: '' };
    expect(() => new Agent(options)).toThrow("The model field should be filled!");
  });

  it('should initialize the model property correctly when provided', () => {
    const options = validOptions();
    const agent = new Agent(options);
    expect(agent.model).toBe(options.model);
  });

  it('should build the system prompt correctly', () => {
    const options = validOptions();
    const agent = new Agent(options);

    const prompt = agent.buildSystemPrompt();

    expect(prompt).toContain(agent.name);
    expect(prompt).toContain(agent.role);
    expect(prompt).toContain(agent.goal);
    expect(prompt).toContain(agent.backstory);
    expect(prompt).toContain(agent.generalInstructions);
  });
});