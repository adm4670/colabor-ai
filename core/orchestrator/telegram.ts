import TelegramBot from "node-telegram-bot-api";
import { AgentOrchestrator, Message } from "./orchestrator";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import axios from "axios";

import { plannerAgent } from '../agents/planner.agent';
import { pythonAgent } from '../agents/python.agent';
import { answerAgent } from '../agents/answer.agent';
import { assistantAgent } from "../agents/assistant.agent";
import { taskManagerAgent } from "../agents/task-manager.agent";
import { shellAgent } from '../agents/shell.agent';
import { browserAgent } from '../agents/browser.agent';
import { logger } from "../utils/logger";

    // Retry com backoff exponencial para envio de mensagens Telegram
    async function sendWithRetry(bot: TelegramBot, chatId: number, text: string, options?: any, maxRetries = 3): Promise<void> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await bot.sendMessage(chatId, text, options);
          return;
        } catch (err: any) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger ? logger.warn(`[Telegram] Tentativa ${attempt}/${maxRetries} falhou. Retry em ${delay}ms: ${err.message}`) : null;
          if (attempt === maxRetries) {
            logger ? logger.error(`[Telegram] Todas as ${maxRetries} tentativas falharam: ${err.message}`) : null;
            throw err;
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        }
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

  // limitar histórico
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
    responseType: "stream"
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
  apiKey: process.env.OPENAI_API_KEY
});

async function transcribeAudio(filePath: string) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "gpt-4o-transcribe"
  });

  return transcription.text;

}

async function startTelegramAgent() {  

  const orchestrator = new AgentOrchestrator(plannerAgent, [
    {
      name: assistantAgent.name,
      description: assistantAgent.buildSystemPrompt(),
      agent: assistantAgent
    },
    {
      name: taskManagerAgent.name,
      description: taskManagerAgent.buildSystemPrompt(),
      agent: taskManagerAgent
    },
    {
      name: pythonAgent.name,
      description: pythonAgent.buildSystemPrompt(),
      agent: pythonAgent
    },
    {
      name: answerAgent.name,
      description: answerAgent.buildSystemPrompt(),
      agent: answerAgent
    },
    {
      name: browserAgent.name,
      description: browserAgent.buildSystemPrompt(),
      agent: browserAgent
    },
    // {
    //   name: shellAgent.name,
    //   description: shellAgent.buildSystemPrompt(),
    //   agent: shellAgent
    // }
  ], true);

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN as string, {
    polling: true
  });

  logger ? logger.info("[Telegram] Multi-Agent iniciado.") : null;
  console.log("Telegram Multi-Agent iniciado.");

  bot.on("message", async (msg) => {

    const chatId = msg.chat.id;

    let text = msg.text;

    try {

      await bot.sendChatAction(chatId, "typing");

      // --------------------------------------------------
      // CASO 1: ÁUDIO / VOICE
      // --------------------------------------------------

      if (msg.voice || msg.audio) {
        const fileId = msg.voice?.file_id || msg.audio?.file_id;

        if (!fileId) return;

        // await bot.sendMessage(chatId, "🎤 Processando áudio...");

        const audioPath = await downloadTelegramFile(bot, fileId);

        const transcript = await transcribeAudio(audioPath);

        text = transcript;

        fs.unlinkSync(audioPath);

        // await bot.sendMessage(chatId, `📝 *Transcrição:*\n${transcript}`, {
        //   parse_mode: "Markdown"
        // });

      }

      if (!text) return;

      // --------------------------------------------------
      // HISTÓRICO
      // --------------------------------------------------

      addMessage(chatId, {
        role: "user",
        content: text
      });

      const history = getHistory(chatId);

      // --------------------------------------------------
      // EXECUTA AGENTS
      // --------------------------------------------------

      const response = await orchestrator.run({
        input: text,
        history
      });

      addMessage(chatId, {
        role: "assistant",
        content: response
      });

      // await bot.sendMessage(
      //   chatId,
      //   escapeMarkdown(response),
      //   { parse_mode: "MarkdownV2" }
      // );
      // Enviar resposta com escape de MarkdownV2
      // Se falhar por parse entities, tenta sem formatacao
      try {
        await sendWithRetry(bot, chatId, escapeMarkdown(response), {
          parse_mode: "MarkdownV2"
        });
      } catch (parseErr: any) {
        if (parseErr.message && parseErr.message.includes("parse")) {
          // Fallback: envia sem formatacao
          await sendWithRetry(bot, chatId, response, {});
        } else {
          throw parseErr;
        }
      }

    } catch (err) {

      logger ? logger.error("[Telegram] Erro ao processar mensagem: " + (err instanceof Error ? err.message : JSON.stringify(err))) : null;
      console.error(err);

      bot.sendMessage(chatId, "❌ Erro ao processar mensagem.");

    }

  });

}

startTelegramAgent();