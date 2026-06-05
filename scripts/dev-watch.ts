import { watch } from 'fs';
    import { execSync, spawn } from 'child_process';
    import { resolve } from 'path';
    import * as readline from 'readline';
    
    const ENTRY_POINT = './core/orchestrator/telegram.ts';
    const SRC_DIR = resolve(process.cwd(), 'core');
    
    let currentProcess: ReturnType<typeof spawn> | null = null;
    let lastValidationOk = false;
    
    // Configura readline para capturar entrada do teclado
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    function log(msg: string) {
      const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
      console.log(`[${time}] ${msg}`);
    }
    
    function startServer() {
      if (currentProcess) {
        currentProcess.kill('SIGTERM');
        currentProcess = null;
      }
    
      log('🚀 Iniciando servidor...');
      currentProcess = spawn('npx', ['tsx', ENTRY_POINT], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
      });
    
      currentProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          log(`⚠️ Servidor encerrou com código ${code}`);
        }
      });
    }
    
    function validateCode() {
      log('🔍 Validando TypeScript...');
      try {
        execSync('npx tsc --noEmit', { stdio: 'pipe', cwd: process.cwd() });
        lastValidationOk = true;
        log("✅ Código válido. Pressione 'r' para reiniciar o servidor.");
      } catch (err: any) {
        lastValidationOk = false;
        const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
        log('❌ Erro de TypeScript detectado — corrija o código para validar novamente');
        console.error(output);
      }
    }
    
    // Escuta tecla 'r' no terminal
    process.stdin.on('keypress', (_str, key) => {
      if (key.name === 'r') {
        if (lastValidationOk) {
          log('🔄 Reiniciando servidor (solicitado pelo usuário)...');
          startServer();
          lastValidationOk = false; // Reseta até próxima validação
        } else {
          log('⚠️ Nenhuma validação recente bem-sucedida. Faça uma alteração no código primeiro.');
        }
      }
    
      // Ctrl+C para sair
      if (key.ctrl && key.name === 'c') {
        if (currentProcess) {
          currentProcess.kill('SIGTERM');
        }
        process.exit(0);
      }
    });
    
    log('📁 Observando alterações em core/...');
    
    // Debounce para evitar múltiplas validações
    let timeout: NodeJS.Timeout | null = null;
    
    function watchDir(dir: string) {
      watch(dir, { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.ts')) return;
    
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          log(`📁 ${filename} alterado`);
          validateCode();
        }, 500);
      });
    }
    
    watchDir(SRC_DIR);
    
    // Inicia o servidor pela primeira vez
    startServer();
    