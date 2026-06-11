# colabor-ai 🤖
    
    Multi-agent AI orchestration system built with TypeScript and Node.js. Uses a team of specialized agents to solve tasks through web automation, search, and intelligent reasoning.
    
    ## Architecture
    
    The system uses an **orchestrator** that delegates tasks to specialized agents:
    
    ```
    User -> Orchestrator -> PlannerAgent -> [PythonAgent | WriterAgent | Assistant | ...] -> Response
    ```
    
    ## Agents
    
    | Agent | Role |
    |-------|------|
    | **PlannerAgent** | Breaks down complex tasks into execution steps |
    | **PythonAgent** | Executes Python code, web automation with Playwright, web search |
    | **WriterAgent** | Produces well-formatted written responses |
    | **Assistant** | General-purpose conversational agent |
    | **ReflectorAgent** | Reviews outputs and suggests improvements |
    | **task_manager** | Manages task queues and execution flow |
    
    ## Features
    
    - **Weather queries** — Real-time temperature, humidity, wind, and rain forecast for any location
    - **News summaries** — Top headlines from Pernambuco, Brazil, and specific sites (SENAC PE)
    - **Web search** — Internet search using Bing News and direct site scraping
    - **Intranet ramal lookup** — Search employee extensions (ramais) on SENAC PE intranet
    - **Web automation** — Playwright-powered browser navigation, form filling, data extraction, screenshots
    - **Task management** — Plan, execute, and review multi-step tasks
    
    ## Tech Stack
    
    - **Runtime:** Node.js + TypeScript
    - **LLM:** Gemini API
    - **Web Automation:** Playwright
    - **Agents:** Custom multi-agent orchestration framework
    
    ## Getting Started
    
    ### Prerequisites
    
    - Node.js (v18+)
    - npm or yarn
    - Playwright browsers (install with `npx playwright install chromium`)
    
    ### Installation
    
    ```bash
    git clone https://github.com/adm4670/colabor-ai.git
    cd colabor-ai
    npm install
    npx playwright install chromium
    ```
    
    ### Environment
    
    Copy `.env.example` to `.env` and configure:
    
    ```env
    GEMINI_API_KEY=your_gemini_api_key
    TELEGRAM_BOT_TOKEN=your_telegram_bot_token (optional)
    ```
    
    ### Running
    
    ```bash
    # Development mode (Telegram orchestrator)
    npm run start:dev:orchestrator:telegram
    
    # Or just build
    npm run build
    ```
    
    ## Examples
    
    The **PythonAgent** can handle tasks like:
    
    - "Qual a temperatura no Recife?" -> Fetches weather via wttr.in
    - "Resumo das noticias de PE hoje" -> Searches and summarizes news
    - "Ache o ramal de Marcio Higo" -> Navigates intranet and finds extension
    - "Noticias do SENAC PE" -> Scrapes institutional news site
    
    ## Project Structure
    
    ```
    colabor-ai/
      core/
        agents/       # Agent implementations
        orchestrator/ # Orchestration logic
        tools/        # Tools (browser, web search, etc.)
        stream/       # Event streaming
        constants/    # Instructions and prompts
      memory/         # Long-term memory storage
    ```
    
    ## License
    
    Internal project.
    