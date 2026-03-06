import TelegramBot from "node-telegram-bot-api"
import { createDailyPlannerAgent } from "./agents/dailyPlannerAgent"

const token = process.env.TELEGRAM_TOKEN!

async function main() {

  const agent = createDailyPlannerAgent()

  const bot = new TelegramBot(token, { polling: true })

  console.log("🤖 Bot iniciado...")

  bot.on("message", async (msg) => {

    const chatId = msg.chat.id
    const text = msg.text

    if (!text) return

    try {

      const response = await agent.run(text)

      await bot.sendMessage(chatId, response)

    } catch (error: any) {

      await bot.sendMessage(chatId, "Erro: " + error.message)

    }

  })

}

main()