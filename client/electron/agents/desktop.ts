/**
     * Desktop Agent
     * Interage com a area de trabalho Windows: captura de tela, clipboard, janelas.
     */
    import { execSync } from "child_process";
    import type { ToolResult } from "./types";
    
    export const desktopAgent = {
      name: "desktop",
      description: "Capturar tela, acessar clipboard, listar processos e janelas no Windows",
      tools: ["screenshot", "clipboard_get", "clipboard_set", "list_processes", "list_windows"],
    
      async execute(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
        try {
          switch (tool) {
            case "screenshot": {
              // Uses PowerShell to take a screenshot
              const savePath = (args.path as string) || `${process.env.TEMP}\\colabor-ai-screenshot.png`;
              const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bitmap = New-Object System.Drawing.Bitmap $screen.Bounds.Width, $screen.Bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)
    $bitmap.Save('${savePath.replace(/\\/g, "\\\\")}')
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Output '${savePath.replace(/\\/g, "\\\\")}'
    `;
              const output = execSync(`powershell -Command "${psScript}"`, {
                timeout: 15000,
                encoding: "utf-8",
              });
              return { result: `Screenshot saved: ${output.trim()}` };
            }
            case "clipboard_get": {
              const output = execSync("powershell -Command \"Get-Clipboard\"", {
                timeout: 5000,
                encoding: "utf-8",
              });
              return { result: output.trim() };
            }
            case "clipboard_set": {
              const text = args.text as string;
              if (!text) return { result: "", error: "text required" };
              execSync(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`, {
                timeout: 5000,
              });
              return { result: "Clipboard set" };
            }
            case "list_processes": {
              const output = execSync(
                'powershell -Command "Get-Process | Select-Object -First 30 Name, Id, CPU, WorkingSet | ConvertTo-Json"',
                { timeout: 10000, encoding: "utf-8" }
              );
              return { result: output.trim() };
            }
            case "list_windows": {
              const output = execSync(
                'powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne \\"\\" } | Select-Object Name, Id, MainWindowTitle | ConvertTo-Json"',
                { timeout: 10000, encoding: "utf-8" }
              );
              return { result: output.trim() || "[]" };
            }
            default:
              return { result: "", error: `Unknown tool: ${tool}` };
          }
        } catch (err: any) {
          return { result: "", error: err.stderr || err.message };
        }
      },
    };
    