/**
     * FileSystem Agent
     * Operacoes de arquivos e pastas no Windows.
     */
    import * as fs from "fs";
    import * as path from "path";
    import type { ToolResult } from "./types";
    
    export const fileSystemAgent = {
      name: "file_system",
      description: "Ler, criar, listar e organizar arquivos e pastas no sistema local",
      tools: ["read_file", "write_file", "list_dir", "create_dir", "delete_file", "file_info"],
    
      async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
        try {
          switch (tool) {
            case "read_file": {
              const filePath = args.path as string;
              if (!filePath) return { result: "", error: "path required" };
              const content = fs.readFileSync(filePath, "utf-8");
              return { result: content };
            }
            case "write_file": {
              const filePath = args.path as string;
              const content = args.content as string;
              if (!filePath) return { result: "", error: "path required" };
              fs.writeFileSync(filePath, content || "", "utf-8");
              return { result: `File written: ${filePath}` };
            }
            case "list_dir": {
              const dirPath = (args.path as string) || process.cwd();
              const entries = fs.readdirSync(dirPath, { withFileTypes: true });
              const listing = entries.map((e) => ({
                name: e.name,
                type: e.isDirectory() ? "dir" : "file",
                size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : undefined,
              }));
              return { result: JSON.stringify(listing, null, 2) };
            }
            case "create_dir": {
              const dirPath = args.path as string;
              if (!dirPath) return { result: "", error: "path required" };
              fs.mkdirSync(dirPath, { recursive: true });
              return { result: `Directory created: ${dirPath}` };
            }
            case "delete_file": {
              const filePath = args.path as string;
              if (!filePath) return { result: "", error: "path required" };
              fs.unlinkSync(filePath);
              return { result: `File deleted: ${filePath}` };
            }
            case "file_info": {
              const filePath = args.path as string;
              if (!filePath) return { result: "", error: "path required" };
              const stat = fs.statSync(filePath);
              return {
                result: JSON.stringify({
                  path: filePath,
                  size: stat.size,
                  created: stat.birthtime,
                  modified: stat.mtime,
                  isDirectory: stat.isDirectory(),
                  isFile: stat.isFile(),
                }),
              };
            }
            default:
              return { result: "", error: `Unknown tool: ${tool}` };
          }
        } catch (err: any) {
          return { result: "", error: err.message };
        }
      },
    };
    