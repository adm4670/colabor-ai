import { Agent } from "../agent/agent";
import { CORE_INSTRUCTIONS, DEFAULT_MODEL } from "../constants/instructions";
    import { pythonExecTool } from "../tools/pythonExecTool";
    import { memorySearchTool } from "../memory/memory_search";
    import { vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool } from "../memory/vector-memory-tools";
    import { dateTimeTool } from "../tools/dateTimeTool";
    
    export const pythonAgent = new Agent({
      name: "PythonAgent",
      role: "Python execution specialist",
      goal: "Solve tasks using Python and return the result clearly",
      backstory: "An assistant specialized in writing and executing Python code to solve problems.",
      model: "deepseek-v4-flash",
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      tools: [pythonExecTool, memorySearchTool, vectorMemoryStoreTool, vectorMemorySearchTool, vectorMemoryStatsTool, fileSystemTool, webSearchTool, apiIntegrationTool, taskSchedulerTool, dateTimeTool],
    
      functions: {
        execute_python: pythonExecTool.handler,
        memory_search: memorySearchTool.handler,
        vector_memory_store: vectorMemoryStoreTool.handler,
        vector_memory_search: vectorMemorySearchTool.handler,
        vector_memory_stats: vectorMemoryStatsTool.handler,
              file_system: fileSystemTool.handler,
              web_search: webSearchTool.handler,
              api_request: apiIntegrationTool.handler,
              task_scheduler: taskSchedulerTool.handler,
              get_current_datetime: dateTimeTool.handler,
      },
    
      generalInstructions: `
        ${CORE_INSTRUCTIONS}
    
      You can write and execute Python code using the execute_python tool.
      You can search long-term memory using the memory_search tool.
      You can get the current date and time using the get_current_datetime tool.
    
      Use Python when:
      - calculations are complex
      - data analysis is needed
      - generating structured outputs
      - working with files
      - modifying files or project code
    
      Use memory_search when:
      - you need to recall past facts or preferences
      - the user asks "remember when..." or "what did we decide about..."
      - you want context from previous sessions
    
      Always prefer executing code instead of guessing results.
    
      Workflow:
      1. Write Python code.
      2. Execute it using the execute_python tool.
      3. Use the tool result to produce the final answer.
    
      Output Rules:
      - ALWAYS return the final result of the task.
      - If files were modified, explain what changed.
      - If code was executed, summarize the result clearly.
      - Avoid unnecessary explanations.
    
      Return responses using this format:
    
      RESULT:
      <clear description of what was done or produced>
    
      DETAILS:
      (optional explanation if needed)
    
      Examples:
    
      Example 1
    
      RESULT:
      The calculation result is **42**.
    
      Example 2
    
      RESULT:
      The FastAPI application was updated with two new routes:
      - GET /greet/{name}
      - GET /items/{item_id}
    
      DETAILS:
      You can restart the server with:
      uvicorn app_dev.main:app --reload
      
        `
      });
    
    // Registrar no AgentRegistry
    import { agentRegistry } from "./agent-registry";
    import { fileSystemTool } from "../tools/fileSystemTool";
    import { webSearchTool } from "../tools/webSearchTool";
    import { apiIntegrationTool } from "../tools/apiIntegrationTool";
    import { taskSchedulerTool } from "../tools/taskSchedulerTool";
    agentRegistry.register({
      name: pythonAgent.name,
      description: "Python execution specialist. Can write and run Python scripts for calculations, data analysis, and file manipulation. Also has datetime tool for getting current date/time.",
      agent: pythonAgent,
      role: "PythonAgent",
      useWhen: ["calculations", "data analysis", "code", "scripting"],
    });
