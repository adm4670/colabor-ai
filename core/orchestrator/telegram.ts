import TelegramBot from "node-telegram-bot-api";
    import { AgentOrchestrator, Message } from "./orchestrator";
    import OpenAI from "openai";
    import fs from "fs";
    import path from "path";
    import axios from "axios";
    import { agentRegistry } from "../agents/agent-registry";
    import { logger } from "../utils/logger";
    
    // Importa o planner para garantir que ele seja registrado no agentRegistry
    // Ajuste o caminho de acordo com a localização real do arquivo do planner
    import "../agents/planner.agent";
    import "../agents/assistant.agent";
    import "../agents/python.agent";
    import "../agents/reflector.agent";
    // import "../agents/browser.agent";
    import "../agents/answer.agent";
    // import "../agents/shell.agent";
    import "../agents/task-manager.agent";
    
    // Retry com backoff exponencial para envio de mensagens Telegram
    async function sendWithRetry(
      bot: TelegramBot,
      chatId: number,
      text: string,
      options?: any,
      maxRetries = 3
    ): Promise<void> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await bot.sendMessage(chatId, text, options);
          return;
        } catch (err: any) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger?.warn(
            `[Telegram] Tentativa ${attempt}/${maxRetries} falhou. Retry em ${delay}ms: ${err.message}`
          );
          if (attempt === maxRetries) {
            logger?.error(
              `[Telegram] Todas as ${maxRetries} tentativas falharam: ${err.message}`
            );
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    
    // Envia mensagens longas quebrando em partes < 4096 chars (limite Telegram)
    async function sendLongMessage(
      bot: TelegramBot,
      chatId: number,
      text: string,
      options?: any
    ): Promise<void> {
      const MAX_LEN = 4000; // margem de seguranca (limite real: 4096)
    
      if (text.length <= MAX_LEN) {
        await sendWithRetry(bot, chatId, text, options);
        return;
      }
    
      logger?.warn(
        `[Telegram] Mensagem longa (${text.length} chars) - dividindo em partes`
      );
    
      // Quebrar em paragrafos (linhas duplas) para nao cortar no meio
      const paragraphs = text.split("\n\n");
      let chunk = "";
    
      for (const para of paragraphs) {
        const candidate = chunk ? chunk + "\n\n" + para : para;
        if (candidate.length > MAX_LEN && chunk.length > 0) {
          await sendWithRetry(bot, chatId, chunk, options);
          chunk = para;
        } else {
          chunk = candidate;
        }
    
        // Se um paragrafo sozinho for maior que MAX_LEN, quebra por linhas
        if (chunk.length > MAX_LEN) {
          const lines = chunk.split("\n");
          chunk = "";
          for (const line of lines) {
            const lineCandidate = chunk ? chunk + "\n" + line : line;
            if (lineCandidate.length > MAX_LEN && chunk.length > 0) {
              await sendWithRetry(bot, chatId, chunk, options);
              chunk = line;
            } else {
              chunk = lineCandidate;
            }
          }
        }
      }
    
      if (chunk.length > 0) {
        await sendWithRetry(bot, chatId, chunk, options);
      }
    }
    
    const conversations: Map<number, Message[]> = new Map();
    
    function getHistory(chatId: number): Message[] {
      if (!conversations.has(chatId)) {
        conversations.set(chatId, []);
      }
      return conversations.get(chatId)!;
    }
    
    function addMessage(chatId: number, message: Message) {
      const history = getHistory(chatId);
      history.push(message);
      // limitar historico
      if (history.length > 20) {
        history.shift();
      }
    }
    
    function escapeMarkdown(text: string) {
      return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
    }
    
    async function downloadTelegramFile(bot: TelegramBot, fileId: string) {
      const file = await bot.getFile(fileId);
      const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
    
      // garantir que a pasta tmp existe
      const tmpDir = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    
      const filePath = path.join(tmpDir, `${fileId}.ogg`);
    
      const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
      });
    
      await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        response.data.pipe(stream);
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
    
      return filePath;
    }
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    async function transcribeAudio(filePath: string) {
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "gpt-4o-transcribe",
      });
      return transcription.text;
    }
    
    async function startTelegramAgent() {
      const planner = agentRegistry.getPlanner();
      if (!planner) {
        logger.error("Planner agent nao registrado!", "TELEGRAM");
        process.exit(1);
      }
      const orchestrator = new AgentOrchestrator(
        planner,
        agentRegistry.getSubAgents()
      );
    
      const bot = new TelegramBot(process.env.TELEGRAM_TOKEN as string, {
        polling: true,
      });
    
      logger?.info("[Telegram] Multi-Agent iniciado.");
      logger.info("Telegram Multi-Agent iniciado.", "TELEGRAM");
    
      bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        let text = msg.text;
    
        try {
          await bot.sendChatAction(chatId, "typing");
    
          // CASO 1: AUDIO / VOICE
          if (msg.voice || msg.audio) {
            const fileId = msg.voice?.file_id || msg.audio?.file_id;
            if (!fileId) return;
    
            const audioPath = await downloadTelegramFile(bot, fileId);
            const transcript = await transcribeAudio(audioPath);
            text = transcript;
            fs.unlinkSync(audioPath);
          }
    
          if (!text) return;
    
          // HISTORICO
          addMessage(chatId, {
            role: "user",
            content: text,
          });
          const history = getHistory(chatId);
    
          // EXECUTA AGENTS com feedback de progresso
          let progressMsg: any = null;
          let progressShown = false;
    
          const sendProgress = async (message: string) => {
            try {
              if (!progressShown) {
                progressMsg = await bot.sendMessage(chatId, message);
                progressShown = true;
              } else if (progressMsg) {
                await bot.editMessageText(message, {
                  chat_id: chatId,
                  message_id: progressMsg.message_id,
                });
              }
            } catch (error: any) {
              // Ignorar erro "message is not modified" (conteudo identico)
              if (error?.description && error.description.includes("message is not modified")) return;
              try {
                progressMsg = await bot.sendMessage(chatId, message);
                progressShown = true;
              } catch { /* silencioso */ }
            }
          };
    
          let progressActive = false;
          const PROGRESS_DELAY_MS = parseInt(process.env.PROGRESS_DELAY_MS || "2000", 10);
          const progressTimer = setTimeout(() => { progressActive = true; }, PROGRESS_DELAY_MS);
    
          const onProgress = async (message: string) => {
            if (progressActive) await sendProgress(message);
          };
    
          const response = await orchestrator.run({
            input: text,
            history,
            onProgress,
          });
    
          clearTimeout(progressTimer);
          if (progressShown && progressMsg) {
            try { await bot.deleteMessage(chatId, progressMsg.message_id); } catch { /* ok */ }
          }
    
          addMessage(chatId, {
            role: "assistant",
            content: response,
          });
    
          // Enviar resposta com escape de MarkdownV2
          // Se falhar por parse entities, tenta sem formatacao
          // Usa sendLongMessage para dividir respostas > 4096 chars
          try {
            await sendLongMessage(bot, chatId, escapeMarkdown(response), {
              parse_mode: "MarkdownV2",
            });
          } catch (parseErr: any) {
            if (parseErr.message && parseErr.message.includes("parse")) {
              // Fallback: envia sem formatacao
              await sendLongMessage(bot, chatId, response, {});
            } else {
              throw parseErr;
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger?.error("[Telegram] Erro ao processar mensagem: " + errMsg);
          logger.error("Erro ao processar: " + (err?.message || err), "TELEGRAM");
    
          // Determinar mensagem amigavel baseada no tipo de erro
          let userMessage = "❌ Erro ao processar mensagem.";
    
          if (errMsg.includes("429") || errMsg.includes("rate")) {
            userMessage = "⏳ Muitas requisicoes. Aguarde um momento e tente novamente.";
          } else if (errMsg.includes("503") || errMsg.includes("overloaded")) {
            userMessage = "🔧 Servico temporariamente indisponivel. Tente novamente em instantes.";
          } else if (errMsg.includes("token") || errMsg.includes("context")) {
            userMessage = "📝 A conversa ficou muito longa. Use /reset para comecar uma nova sessao.";
          } else if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")) {
            userMessage = "⏱️ A operacao excedeu o tempo limite. Tente uma pergunta mais curta.";
          } else if (errMsg.includes("parse") || errMsg.includes("too long")) {
            userMessage = "⚠️ Erro ao enviar resposta (mensagem muito longa ou formato invalido).";
          } else {
            const shortErr = errMsg.slice(0, 80);
            userMessage = `❌ Erro: ${shortErr}`;
          }
    
          try {
            await bot.sendMessage(chatId, userMessage);
          } catch {
            logger.error("Falha ate ao enviar mensagem de erro", "TELEGRAM");
          }
        }
      });
    }
    
    // Iniciar o agente com tratamento de erro para promessa rejeitada
    startTelegramAgent().catch((err) => {
      logger.error("Falha ao iniciar o bot Telegram: " + (err?.message || err), "TELEGRAM");
      process.exit(1);
    });
    