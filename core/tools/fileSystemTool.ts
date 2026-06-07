// ============================================================
    // FileSystem Tool - Ler, escrever e gerenciar arquivos/pastas
    // Seguranca: impede acesso a diretorios sensiveis
    // ============================================================
    
    import * as fs from "fs";
    import * as path from "path";
    
    // Diretorios e arquivos bloqueados por seguranca
    const BLOCKED_PATHS = [
      "node_modules",
      ".git",
      ".env",
      "dist",
      "coverage",
    ];
    
    function isPathBlocked(target: string): boolean {
      const normalized = path.resolve(target).toLowerCase();
      for (const blocked of BLOCKED_PATHS) {
        if (normalized.includes(blocked.toLowerCase())) {
          return true;
        }
      }
      return false;
    }
    
    function sanitizePath(target: string): string {
      // Resolve o caminho absoluto e normaliza
      return path.resolve(target);
    }
    
    export const fileSystemTool = {
      type: "function" as const,
    
      function: {
        name: "file_system",
        description: "Gerencia arquivos e diretorios no sistema. Acoes: read (ler arquivo), write (escrever arquivo), list (listar diretorio), delete (deletar arquivo/pasta), mkdir (criar diretorio), exists (verificar se existe), copy (copiar), move (mover/renomear).",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["read", "write", "list", "delete", "mkdir", "exists", "copy", "move"],
              description: "Acão a ser executada"
            },
            target: {
              type: "string",
              description: "Caminho do arquivo ou diretorio alvo"
            },
            content: {
              type: "string",
              description: "Conteudo para escrever no arquivo (obrigatorio em 'write')"
            },
            destination: {
              type: "string",
              description: "Caminho de destino (obrigatorio em 'copy' e 'move')"
            }
          },
          required: ["action", "target"]
        }
      },
    
      async handler({
        action,
        target,
        content,
        destination
      }: {
        action: string;
        target: string;
        content?: string;
        destination?: string;
      }) {
        try {
          const safePath = sanitizePath(target);
    
          // Verificacao de seguranca
          if (isPathBlocked(safePath)) {
            return {
              success: false,
              message: `Acesso bloqueado: ${target} esta em um diretorio protegido.`
            };
          }
    
          switch (action) {
    
            case "read": {
              if (!fs.existsSync(safePath)) {
                return { success: false, message: `Arquivo nao encontrado: ${target}` };
              }
              const stats = fs.statSync(safePath);
              if (stats.isDirectory()) {
                return { success: false, message: `'${target}' e um diretorio, nao um arquivo.` };
              }
              const data = fs.readFileSync(safePath, "utf-8");
              return {
                success: true,
                content: data,
                size: data.length,
                message: `Arquivo lido: ${target} (${data.length} caracteres)`
              };
            }
    
            case "write": {
              if (content === undefined) {
                return { success: false, message: "Conteudo obrigatorio para escrita." };
              }
              // Garante que o diretorio pai existe
              const dir = path.dirname(safePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(safePath, content, "utf-8");
              return {
                success: true,
                message: `Arquivo salvo: ${target} (${content.length} caracteres)`,
                size: content.length
              };
            }
    
            case "list": {
              if (!fs.existsSync(safePath)) {
                return { success: false, message: `Diretorio nao encontrado: ${target}` };
              }
              const stats = fs.statSync(safePath);
              if (!stats.isDirectory()) {
                return { success: false, message: `'${target}' nao e um diretorio.` };
              }
              const items = fs.readdirSync(safePath);
              const details = items.map(item => {
                const full = path.join(safePath, item);
                try {
                  const st = fs.statSync(full);
                  return {
                    name: item,
                    type: st.isDirectory() ? "dir" : "file",
                    size: st.size,
                    modified: st.mtime.toISOString()
                  };
                } catch {
                  return { name: item, type: "unknown", size: 0, modified: "" };
                }
              });
              return {
                success: true,
                items: details,
                count: details.length,
                message: `${details.length} item(ns) encontrado(s) em ${target}`
              };
            }
    
            case "delete": {
              if (!fs.existsSync(safePath)) {
                return { success: false, message: `Nao encontrado: ${target}` };
              }
              const stats = fs.statSync(safePath);
              if (stats.isDirectory()) {
                fs.rmSync(safePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(safePath);
              }
              return {
                success: true,
                message: `Removido: ${target}`
              };
            }
    
            case "mkdir": {
              if (fs.existsSync(safePath)) {
                return { success: false, message: `Ja existe: ${target}` };
              }
              fs.mkdirSync(safePath, { recursive: true });
              return {
                success: true,
                message: `Diretorio criado: ${target}`
              };
            }
    
            case "exists": {
              const exists = fs.existsSync(safePath);
              return {
                success: true,
                exists,
                type: exists ? (fs.statSync(safePath).isDirectory() ? "dir" : "file") : null,
                message: exists ? `Encontrado: ${target}` : `Nao encontrado: ${target}`
              };
            }
    
            case "copy": {
              if (!destination) {
                return { success: false, message: "Destino obrigatorio para copia." };
              }
              if (!fs.existsSync(safePath)) {
                return { success: false, message: `Origem nao encontrada: ${target}` };
              }
              const safeDest = sanitizePath(destination);
              if (isPathBlocked(safeDest)) {
                return { success: false, message: `Acesso bloqueado ao destino: ${destination}` };
              }
              const destDir = path.dirname(safeDest);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }
              fs.copyFileSync(safePath, safeDest);
              return {
                success: true,
                message: `Copiado: ${target} -> ${destination}`
              };
            }
    
            case "move": {
              if (!destination) {
                return { success: false, message: "Destino obrigatorio para mover." };
              }
              if (!fs.existsSync(safePath)) {
                return { success: false, message: `Origem nao encontrada: ${target}` };
              }
              const safeDest = sanitizePath(destination);
              if (isPathBlocked(safeDest)) {
                return { success: false, message: `Acesso bloqueado ao destino: ${destination}` };
              }
              const destDir = path.dirname(safeDest);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }
              fs.renameSync(safePath, safeDest);
              return {
                success: true,
                message: `Movido: ${target} -> ${destination}`
              };
            }
    
            default:
              return {
                success: false,
                message: `Acao desconhecida: '${action}'. Use: read, write, list, delete, mkdir, exists, copy, move`
              };
          }
        } catch (err: any) {
          return {
            success: false,
            message: `Erro ao ${action} '${target}': ${err.message || err}`
          };
        }
      }
    };
    