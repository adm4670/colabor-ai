import { Agent } from "../agent/agent";
import { DEFAULT_MODEL, FALLBACK_MODEL } from "../constants/instructions";
    import { pythonExecTool } from "../tools/pythonExecTool";
        import { agentToolOpenAI } from "../tools/agentTool";
        import { taskCreateOpenAI, taskListOpenAI, cancelBgTaskOpenAI } from "../tools/taskCreateTool";
    import { todoWriteOpenAI } from "../tools/TodoWriteTool";
    import { webSearchOpenAI } from "../tools/WebSearchTool";
    import { scheduleTaskOpenAI, listScheduledOpenAI, deleteScheduledTaskOpenAI } from "../tools/ScheduleTaskTool";
    import { memorySearchTool } from "../memory/memory_search";
        import { agentToolHandler } from "../tools/agentTool";
        import { taskCreateHandler, taskListHandler, cancelBgTaskHandler } from "../tools/taskCreateTool";
    import { todoWriteHandler } from "../tools/TodoWriteTool";
    import { webSearchHandler } from "../tools/WebSearchTool";
    import { scheduleTaskHandler, listScheduledHandler, deleteScheduledHandler } from "../tools/ScheduleTaskTool";
    
    export const pythonAgent = new Agent({
      name: "PythonAgent",
      role: "Python execution specialist",
      goal: "Solve tasks using Python and return the result clearly",
      backstory: "An assistant specialized in writing and executing Python code to solve problems.",
      model: "deepseek-v4-flash",
      fallbackModel: FALLBACK_MODEL,
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseURL: "https://api.deepseek.com",
    
      tools: [pythonExecTool, memorySearchTool, agentToolOpenAI, taskCreateOpenAI, taskListOpenAI, todoWriteOpenAI, webSearchOpenAI, scheduleTaskOpenAI, listScheduledOpenAI, cancelBgTaskOpenAI, deleteScheduledTaskOpenAI],
    
      functions: {
            execute_python: pythonExecTool.handler,
            memory_search: memorySearchTool.handler,
            spawn_agent: agentToolHandler,
            create_background_task: taskCreateHandler,
            list_background_tasks: taskListHandler,
        todo_write: todoWriteHandler,
        web_search: webSearchHandler,
        schedule_task: scheduleTaskHandler,
        list_scheduled_tasks: listScheduledHandler,
        cancel_background_task: cancelBgTaskHandler,
        delete_scheduled_task: deleteScheduledHandler,
          },
    
      generalInstructions: `
            
      You can write and execute Python code using the execute_python tool.
      You can search long-term memory using the memory_search tool.
    
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
    agentRegistry.register({
      name: pythonAgent.name,
      description: "Python execution specialist. Can write and run Python scripts for calculations, data analysis, and file manipulation.",
      agent: pythonAgent,
      role: "PythonAgent",
      useWhen: ["calculations", "data analysis", "code", "scripting"],
    });
    