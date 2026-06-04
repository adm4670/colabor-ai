/**
     * TodoWriteTool - Gerenciamento de TODOs durante execucao.
     *
     * Inspirado no TodoWriteTool do claude-code.
     * Permite ao agente manter uma lista de tarefas interna visivel ao usuario.
     */
    
    import * as fs from "fs";
    import * as path from "path";
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    interface TodoItem {
      id: string;
      title: string;
      status: "pending" | "in_progress" | "done";
      createdAt: string;
      updatedAt: string;
    }
    
    // ============================================================
    // Persistencia
    // ============================================================
    
    const TODOS_DIR = path.join(process.cwd(), ".colabor-ai");
    const TODOS_FILE = path.join(TODOS_DIR, "todos.json");
    
    function ensureDir(): void {
      if (!fs.existsSync(TODOS_DIR)) {
        fs.mkdirSync(TODOS_DIR, { recursive: true });
      }
    }
    
    function loadTodos(): TodoItem[] {
      try {
        ensureDir();
        if (fs.existsSync(TODOS_FILE)) {
          return JSON.parse(fs.readFileSync(TODOS_FILE, "utf-8"));
        }
      } catch (err) {
        logger.warn(`[TodoWrite] Erro ao carregar todos: ${err}`);
      }
      return [];
    }
    
    function saveTodos(todos: TodoItem[]): void {
      ensureDir();
      fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2), "utf-8");
    }
    
    // ============================================================
    // Tool: todo_write
    // ============================================================
    
    interface TodoWriteArgs {
      action: "create" | "update" | "delete" | "list";
      title?: string;
      id?: string;
      status?: "pending" | "in_progress" | "done";
    }
    
    export const todoWriteTool: ToolDefinition<TodoWriteArgs, any> = {
      name: "todo_write",
      description:
        "Manage an internal task list (TODOs) during execution. Use to track progress on complex multi-step tasks. Actions: create (add new todo), update (change status/title), delete (remove), list (show all).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "update", "delete", "list"],
            description: "Action to perform on the todo list",
          },
          title: {
            type: "string",
            description: "Title of the todo (required for create)",
          },
          id: {
            type: "string",
            description: "ID of the todo (required for update/delete)",
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done"],
            description: "New status (for update)",
          },
        },
        required: ["action"],
      },
    
      execute: async (args: TodoWriteArgs, _ctx: ToolContext): Promise<any> => {
        const todos = loadTodos();
    
        switch (args.action) {
          case "create": {
            if (!args.title) return { success: false, error: "title is required for create" };
            const todo: TodoItem = {
              id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              title: args.title,
              status: "pending",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            todos.push(todo);
            saveTodos(todos);
            return { success: true, todo, message: `Created: "${args.title}"` };
          }
    
          case "update": {
            if (!args.id) return { success: false, error: "id is required for update" };
            const todo = todos.find((t) => t.id === args.id);
            if (!todo) return { success: false, error: `Todo ${args.id} not found` };
            if (args.title) todo.title = args.title;
            if (args.status) todo.status = args.status;
            todo.updatedAt = new Date().toISOString();
            saveTodos(todos);
            return { success: true, todo, message: `Updated todo ${args.id}` };
          }
    
          case "delete": {
            if (!args.id) return { success: false, error: "id is required for delete" };
            const idx = todos.findIndex((t) => t.id === args.id);
            if (idx === -1) return { success: false, error: `Todo ${args.id} not found` };
            const removed = todos.splice(idx, 1)[0];
            saveTodos(todos);
            return { success: true, deleted: removed, message: `Deleted: "${removed.title}"` };
          }
    
          case "list": {
            const pending = todos.filter((t) => t.status !== "done");
            const done = todos.filter((t) => t.status === "done");
            return {
              success: true,
              total: todos.length,
              pending: pending.length,
              done: done.length,
              todos: todos.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
              })),
            };
          }
    
          default:
            return { success: false, error: `Unknown action: ${args.action}` };
        }
      },
    };
    
    /** OpenAI function calling format */
    export const todoWriteOpenAI = {
      type: "function" as const,
      function: {
        name: todoWriteTool.name,
        description: todoWriteTool.description,
        parameters: todoWriteTool.parameters,
      },
    };
    
    export const todoWriteHandler: Function = todoWriteTool.execute;
    