# colabor-ai-core

Motor principal e runtime de orquestração do **colabor.ai** — uma plataforma para criar e executar **agentes de IA que colaboram para resolver tarefas**.

---

# Visão Geral

`colabor-ai-core` é o núcleo responsável por **orquestrar agentes, ferramentas (tools) e modelos de linguagem (LLMs)**.

Ele fornece a infraestrutura mínima necessária para construir sistemas de IA capazes de:

* interpretar solicitações
* raciocinar sobre tarefas
* executar ações
* integrar diferentes ferramentas

O objetivo do projeto é oferecer uma **base simples, extensível e modular** para a construção de sistemas de agentes colaborativos.

---

# Arquitetura

A arquitetura segue um modelo mínimo de orquestração de agentes:

```
Usuário
 │
 ▼
Canal (API / Telegram / CLI)
 │
 ▼
Controller
 │
 ▼
Agent
 │
 ▼
LLM
 │
 ├── Resposta
 │
 └── Tool
       │
       ▼
   Resultado da Tool
```

---

# Componentes

## Controller

Ponto de entrada das mensagens no sistema.

Exemplos de canais de entrada:

* API HTTP
* Bot do Telegram
* CLI
* Interface web

---

## Agent

Responsável por **orquestrar o raciocínio e as ações**.

O agente decide:

* se responde diretamente
* se precisa executar uma ferramenta
* qual contexto enviar ao LLM

---

## LLM Service

Responsável pela comunicação com modelos de linguagem.

Funções:

* enviar prompts
* receber respostas
* interpretar chamadas de ferramentas

---

## Tools

Ferramentas que o agente pode executar.

Exemplos:

* consultas em banco de dados
* chamadas de API
* automações
* manipulação de arquivos

---

# Estrutura do Projeto

```
src
 ├── controller
 │    chat.controller.ts
 │
 ├── channels
 │    telegram.channel.ts
 │
 ├── agent
 │    agent.ts
 │
 ├── llm
 │    llm.service.ts
 │
 ├── tools
 │    index.ts
 │
 └── server.ts
```

---

# Instalação

```bash
git clone https://github.com/colabor-ai/colabor-ai-core.git
cd colabor-ai-core
npm install
```

---

# Executando o projeto

```
npm run dev
```

---

# Integração com Telegram

A plataforma permite integrar agentes ao **Telegram**, permitindo que usuários conversem com o agente diretamente pelo chat.

Esse modelo é semelhante a sistemas de agentes baseados em bots, onde o Telegram atua como **canal de comunicação entre o usuário e o runtime do agente**.

---

# Passo 1 — Criar um Bot no Telegram

1. Abra o Telegram
2. Procure por **@BotFather**
3. Execute:

```
/start
/newbot
```

4. Escolha:

* nome do bot
* username do bot

Ao final, o BotFather retornará um **token do bot**.

Exemplo:

```
123456789:AAEXAMPLE_TOKEN
```

---

# Passo 2 — Instalar a biblioteca do Telegram

```
npm install node-telegram-bot-api
```

---

# Passo 3 — Criar o canal do Telegram

Crie o arquivo:

```
src/channels/telegram.channel.ts
```

Exemplo de implementação:

```ts
import TelegramBot from "node-telegram-bot-api"
import { agent } from "../agent/agent"

const token = process.env.TELEGRAM_TOKEN!

const bot = new TelegramBot(token, { polling: true })

export function iniciarCanalTelegram(){

  bot.on("message", async (msg) => {

    const chatId = msg.chat.id
    const texto = msg.text || ""

    const resposta = await agent.run(texto)

    bot.sendMessage(chatId, resposta)

  })

}
```

---

# Passo 4 — Inicializar o canal

No arquivo `server.ts`:

```ts
import { iniciarCanalTelegram } from "./channels/telegram.channel"

iniciarCanalTelegram()
```

---

# Fluxo de interação via Telegram

```
Usuário (Telegram)
        │
        ▼
Bot do Telegram
        │
        ▼
Canal Telegram
        │
        ▼
Agent Runtime
        │
        ▼
LLM
        │
        ├─ resposta direta
        │
        └─ execução de tool
```

---

# Exemplo de interação

Usuário:

```
Qual é o clima hoje?
```

Agente:

```
Hoje a previsão é de 27°C com céu parcialmente nublado.
```

---

# Objetivos do Projeto

* fornecer um runtime mínimo para agentes de IA
* permitir ferramentas e integrações modulares
* suportar workflows com agentes colaborativos
* servir como base para o **ecossistema colabor.ai**

---

# Roadmap

* memória de agentes
* registro de ferramentas (tool registry)
* orquestração multi-agente
* engine de workflows
* observabilidade e logs
* construtor visual de agentes (no-code)
* suporte a múltiplos canais

Canais planejados:

* Telegram
* WhatsApp
* Slack
* Discord
* REST API
* Web Chat

---

# Contribuição

Contribuições são bem-vindas.

1. Faça um fork do repositório
2. Crie uma branch para sua feature
3. Faça commit das alterações
4. Abra um Pull Request

---

# Licença

MIT License
