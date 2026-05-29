import { Agent } from "../agent/agent";
    import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    
    /**
     * ReflectorAgent - Avalia resultados de execucao dos agentes.
     *
     * Separado do PlannerAgent para:
     * - Usar modelo mais leve/barato (REFLECTOR_MODEL)
     * - Separar concerns: planejar != avaliar
     * - Permitir substituicao independente
     *
     * Retorna JSON: { success, complete, missingInfo, retryDifferent, learning }
     */
    
    export const reflectorAgent = new Agent({
      name: "ReflectorAgent",
      role: "Result evaluator",
      goal: "Evaluate agent execution results honestly and decide if retry is needed",
      backstory:
        "An AI specialized in evaluating whether other agents completed their tasks successfully. " +
        "It identifies missing information and suggests whether a different approach is needed.",
    
      model: process.env.REFLECTOR_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      generalInstructions: `
            ${CORE_INSTRUCTIONS}
    
      You are an execution evaluator. Your job is to evaluate the result of an agent's work.
    
      You will receive:
      - The original user task
      - Which agent was used
      - What instruction was given
      - The result produced
    
      Evaluate honestly:
      1. Did the agent succeed? (yes / partial / no)
      2. Is the result complete for the user's request? (yes / no)
      3. Is there missing information? If so, what?
      4. Should we try a different approach? (yes / no)
      5. What did we learn from this execution? (one sentence in portuguese)
    
      Respond ONLY with JSON:
      {
        "success": "yes | partial | no",
        "complete": true/false,
        "missingInfo": ["item1", "item2"],
        "retryDifferent": true/false,
        "learning": "one sentence in portuguese"
      }
            `,
    });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    agentRegistry.register({
      name: reflectorAgent.name,
      description:
        "Result evaluator. Evaluates whether an agent succeeded, identifies missing info, and suggests retry.",
      agent: reflectorAgent,
      role: "reflector",
      useWhen: ["evaluation", "result analysis", "quality check"],
    });
    