import fs from "fs";
    import path from "path";
import { logger } from "../utils/logger";
    
    const TASKS_FILE = path.join(process.cwd(), "tasks.json");
    
    interface Task {
      id: string;
      title: string;
      description: string;
      date: string;
      createdAt: string;
      completed: boolean;
    }
    
    function loadTasks(): Task[] {
      try {
        if (fs.existsSync(TASKS_FILE)) {
          const data = fs.readFileSync(TASKS_FILE, "utf-8");
          return JSON.parse(data);
        }
      } catch (e: any) {
        logger.error("Erro ao carregar tarefas: " + (e?.message || e), "TASKTOOLS");
      }
      return [];
    }
    
    function saveTasks(tasks: Task[]): void {
      try {
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf-8");
      } catch (e: any) {
        logger.error("Erro ao salvar tarefas: " + (e?.message || e), "TASKTOOLS");
      }
    }
    
    export const taskTools = [
      {
        type: "function",
        function: {
          name: "create_activity",
          description: "Salva uma nova atividade no sistema",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titulo da atividade" },
              description: { type: "string", description: "Descricao da atividade" },
              date: { type: "string", description: "Data da atividade (YYYY-MM-DD)" }
            },
            required: ["title", "date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_activities_by_day",
          description: "Lista atividades de um dia especifico",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Data (YYYY-MM-DD)" }
            },
            required: ["date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_activity",
          description: "Remove uma atividade",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "ID da atividade" }
            },
            required: ["id"]
          }
        }
      }
    ];
    
    export const taskFunctions: Record<string, Function> = {
      create_activity: async ({ title, description, date }: { title: string; description?: string; date: string }) => {
        const tasks = loadTasks();
        const newTask: Task = {
          id: `task_${Date.now()}`,
          title,
          description: description || "",
          date,
          createdAt: new Date().toISOString(),
          completed: false
        };
        tasks.push(newTask);
        saveTasks(tasks);
        return { success: true, task: newTask };
      },
    
      get_activities_by_day: async ({ date }: { date: string }) => {
        const tasks = loadTasks();
        const filtered = tasks.filter(t => t.date === date);
        return { success: true, tasks: filtered, count: filtered.length };
      },
    
      delete_activity: async ({ id }: { id: string }) => {
        const tasks = loadTasks();
        const index = tasks.findIndex(t => t.id === id);
        if (index === -1) {
          return { success: false, error: "Atividade nao encontrada" };
        }
        const removed = tasks.splice(index, 1)[0];
        saveTasks(tasks);
        return { success: true, deleted: removed };
      }
    };
    