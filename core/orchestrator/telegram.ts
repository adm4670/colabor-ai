import TelegramBot from "node-telegram-bot-api";
import { AgentOrchestrator, Message } from "./orchestrator";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import axios from "axios";

import { plannerAgent } from '../agents/planner.agent';
import { pythonAgent } from '../agents/python.agent';
import { answerAgent } from '../agents/awnser.agent';
import { assistantAgent } from "../agents/assistant.agent";
import { taskManagerAgent } from "../agents/task-manager.agent";

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
    }
  ], true);

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN as string, {
    polling: true
  });

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
      await bot.sendMessage(chatId, response, {
        parse_mode: "Markdown"
      });

    } catch (err) {

      console.error(err);

      bot.sendMessage(chatId, "❌ Erro ao processar mensagem.");

    }

  });

}

startTelegramAgent();