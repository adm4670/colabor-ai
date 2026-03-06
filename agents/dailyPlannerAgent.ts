// agents/dailyPlannerAgent.ts

import { Agent } from "../core/agent/agent"
import { ToolRegistry } from "../core/tools/toolRegistry"
import { getCurrentDateTimeTool } from "../tools/getCurrentDateTime"

const registry = new ToolRegistry();
registry.register(getCurrentDateTimeTool);

export function createDailyPlannerAgent() {

  const registry = new ToolRegistry()

  registry.register(getCurrentDateTimeTool)

  const agent = new Agent({
    name: "DailyPlanner",
    role: "Especialista em produtividade pessoal",
    goal: "Ajudar o usuário a organizar suas tarefas e planejar o dia de forma eficiente",
    backstory: `
    Você é um especialista em produtividade, organização e gestão de tempo.

    Seu trabalho é:
    - ajudar o usuário a organizar tarefas
    - sugerir prioridades
    - montar planos para o dia
    - lembrar o usuário de pausas e foco

    Sempre que precisar entender o momento atual do dia, utilize a ferramenta
    getCurrentDateTime para consultar a data e hora atual.

    Seja objetivo e prático.
    `,
    tools: registry
  });

  return agent
}