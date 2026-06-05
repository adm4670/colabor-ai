/**
     * console-dashboard.ts - Painel de telemetria em tempo real para o console
     *
     * Usa códigos ANSI para renderizar um dashboard ao vivo
     * mostrando tokens, agentes, status e outras métricas.
     * Zero dependências externas.
     */
    
    import { EventStream, StreamEvent } from "../stream/event-stream";
    import { getTelemetry } from "./telemetry";
    
    // ============================================================
    // ANSI Escape Utilities
    // ============================================================
    
    const ESC = String.fromCharCode(27);
    const CSI = ESC + "[";
    
    const ansi = {
      save: CSI + "s",
      restore: CSI + "u",
      clearScreen: CSI + "2J",
      clearLine: CSI + "K",
      cursorHome: CSI + "H",
      cursorUp: (n: number) => CSI + n + "A",
      cursorDown: (n: number) => CSI + n + "B",
      cursorRight: (n: number) => CSI + n + "C",
      cursorLeft: (n: number) => CSI + n + "D",
      cursorTo: (row: number, col: number) => CSI + row + ";" + col + "H",
      bold: CSI + "1m",
      dim: CSI + "2m",
      reset: CSI + "0m",
      fg: {
        black: CSI + "30m",
        red: CSI + "31m",
        green: CSI + "32m",
        yellow: CSI + "33m",
        blue: CSI + "34m",
        magenta: CSI + "35m",
        cyan: CSI + "36m",
        white: CSI + "37m",
        gray: CSI + "90m",
        brightRed: CSI + "91m",
        brightGreen: CSI + "92m",
        brightYellow: CSI + "93m",
        brightBlue: CSI + "94m",
        brightCyan: CSI + "96m",
        brightWhite: CSI + "97m",
      },
      bg: {
        darkBlue: CSI + "44m",
        darkGray: CSI + "100m",
        green: CSI + "42m",
        red: CSI + "41m",
        yellow: CSI + "43m",
        blue: CSI + "44m",
        purple: CSI + "45m",
        cyan: CSI + "46m",
      },
    };
    
    const SYM = {
      barFull: String.fromCharCode(9608),
      barEmpty: String.fromCharCode(9617),
      hLine: String.fromCharCode(9472),
      vLine: String.fromCharCode(9474),
      tl: String.fromCharCode(9484),
      tr: String.fromCharCode(9488),
      bl: String.fromCharCode(9492),
      br: String.fromCharCode(9496),
      tm: String.fromCharCode(9516),
      bm: String.fromCharCode(9524),
      lm: String.fromCharCode(9500),
      rm: String.fromCharCode(9508),
      arrow: String.fromCharCode(9656),
      check: String.fromCharCode(10003),
      cross: String.fromCharCode(10007),
      bullet: String.fromCharCode(9679),
    };
    
    // ============================================================
    // Dashboard State
    // ============================================================
    
    interface DashboardState {
      lastQuery: string;
      maxInputTokens: number;
      maxOutputTokens: number;
      maxContextTokens: number;
      agentsUsed: Set<string>;
      currentAgent: string;
      status: string;
      llmCalls: number;
      toolCalls: number;
      plannerSteps: number;
      startTime: number;
      isRunning: boolean;
      lastResponse: string;
    }
    
    const state: DashboardState = {
      lastQuery: "(nenhuma consulta ainda)",
      maxInputTokens: 0,
      maxOutputTokens: 0,
      maxContextTokens: 128000,
      agentsUsed: new Set(),
      currentAgent: "-",
      status: "Aguardando...",
      llmCalls: 0,
      toolCalls: 0,
      plannerSteps: 0,
      startTime: Date.now(),
      isRunning: false,
      lastResponse: "",
    };
    
    // ============================================================
    // Rendering
    // ============================================================
    
    const dashboardEnabled = true;
    let lastRender = "";
    
    function formatTime(ms: number): string {
      const sec = Math.floor(ms / 1000);
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      return min > 0 ? min + "m " + s + "s" : s + "s";
    }
    
    function truncate(str: string, max: number): string {
      if (str.length <= max) return str;
      return str.substring(0, max - 3) + "...";
    }
    
    function renderBar(value: number, max: number, width: number = 18): string {
      const safeMax = Math.max(max, 1);
      const ratio = Math.min(value / safeMax, 1);
      const filled = Math.round(ratio * width);
      const empty = width - filled;
    
      let color: string;
      if (ratio < 0.5) color = ansi.fg.green;
      else if (ratio < 0.8) color = ansi.fg.yellow;
      else color = ansi.fg.red;
    
      const bar = color + SYM.barFull.repeat(filled) + ansi.fg.gray + SYM.barEmpty.repeat(empty) + ansi.reset;
      return bar + " " + color + Math.round(ratio * 100) + "%" + ansi.reset;
    }
    
    function renderDashboard(): string {
      const now = Date.now();
      const elapsed = now - state.startTime;
      const totalTokens = state.maxInputTokens + state.maxOutputTokens;
      const agentCount = state.agentsUsed.size;
    
      // Token bars
      const totalTokenBar = renderBar(totalTokens, state.maxContextTokens, 18);
      const inputBar = renderBar(state.maxInputTokens, Math.max(state.maxInputTokens, 1), 18);
      const outputBar = renderBar(state.maxOutputTokens, Math.max(state.maxOutputTokens, 1), 18);
    
      let statusColor: string;
      if (state.isRunning) {
        statusColor = ansi.fg.brightGreen;
      } else if (state.status.includes("erro") || state.status.includes("Erro")) {
        statusColor = ansi.fg.brightRed;
      } else if (state.status.includes("Conclu")) {
        statusColor = ansi.fg.brightGreen;
      } else {
        statusColor = ansi.fg.cyan;
      }
    
      const lines: string[] = [];
    
      // === Header ===
      lines.push(
        ansi.bg.darkBlue + ansi.fg.brightWhite + ansi.bold +
        "  " + SYM.bullet + "  COLABOR-AI  |  REAL-TIME DASHBOARD" +
        ansi.reset
      );
      lines.push("");
    
      // === Status line ===
      lines.push(
        "  " + ansi.bold + "Status:" + ansi.reset + " " +
        statusColor + state.status + ansi.reset +
        "  " + ansi.dim + "|" + ansi.reset +
        " Sessao: " + formatTime(elapsed) +
        "  " + ansi.dim + "|" + ansi.reset +
        " LLM: " + state.llmCalls + " chamadas"
      );
    
      // === Separator ===
      lines.push("  " + ansi.dim + SYM.lm + SYM.hLine.repeat(66) + SYM.rm + ansi.reset);
    
      // === Query ===
      lines.push(
        "  " + ansi.bold + "Consulta:" + ansi.reset + " " + truncate(state.lastQuery, 65)
      );
    
      // === Agents ===
      const agentsStr = agentCount > 0
        ? Array.from(state.agentsUsed).join(", ")
        : "(nenhum)";
      lines.push(
        "  " + ansi.bold + "Agentes usados:" + ansi.reset + " " +
        agentCount + " [" + truncate(agentsStr, 50) + "]"
      );
      lines.push(
        "  " + ansi.bold + "Agente atual:" + ansi.reset + " " + state.currentAgent
      );
    
      // === Separator ===
      lines.push("  " + ansi.dim + SYM.lm + SYM.hLine.repeat(66) + SYM.rm + ansi.reset);
    
      // === Tokens ===
      lines.push(
        "  " + ansi.bold + "Tokens (janela maxima: " +
        state.maxContextTokens.toLocaleString() + ")" + ansi.reset
      );
      lines.push(
        "     " + SYM.arrow + " Janela:" +
        totalTokens.toLocaleString().padStart(8) + "  " + totalTokenBar
      );
      lines.push(
        "     " + SYM.arrow + " Prompt:" +
        state.maxInputTokens.toLocaleString().padStart(8) + "  " + inputBar
      );
      lines.push(
        "     " + SYM.arrow + " Output:" +
        state.maxOutputTokens.toLocaleString().padStart(8) + "  " + outputBar
      );
    
      // === Separator ===
      lines.push("  " + ansi.dim + SYM.lm + SYM.hLine.repeat(66) + SYM.rm + ansi.reset);
    
      // === Actions ===
      lines.push(
        "  " + ansi.bold + "Planner steps:" + ansi.reset + " " + state.plannerSteps +
        "  " + ansi.dim + "|" + ansi.reset +
        "  Tool calls: " + state.toolCalls +
        "  " + ansi.dim + "|" + ansi.reset +
        "  Agentes distintos: " + agentCount
      );
    
      // === Last response ===
      if (state.lastResponse) {
        lines.push(
          "  " + ansi.dim + "Ultima resposta: " + truncate(state.lastResponse, 60) + ansi.reset
        );
      }
    
      // === Footer ===
      lines.push("  " + ansi.dim + SYM.bl + SYM.hLine.repeat(66) + SYM.br + ansi.reset);
    
      return lines.join("\n");
    }
    
    // ============================================================
    // Event Handlers
    // ============================================================
    
    function handleEvent(event: StreamEvent): void {
      switch (event.type) {
        case "agent_start":
          if (event.content) {
            state.currentAgent = event.content;
            state.agentsUsed.add(event.content);
          }
          state.isRunning = true;
          state.status = event.content
            ? "Processando com " + event.content + "..."
            : "Processando...";
          break;
    
        case "agent_end":
          state.isRunning = false;
          state.status = "Aguardando...";
          break;
    
        case "turn_start":
          state.isRunning = true;
          state.status = event.content
            ? event.content.substring(0, 60)
            : "Processando...";
          break;
    
        case "tool_call_start":
          state.toolCalls++;
          state.status = event.toolName
            ? "Executando ferramenta: " + event.toolName + "..."
            : "Executando ferramenta...";
          break;
    
        case "text_start":
        case "text_delta":
          if (event.content && event.content.length > 5) {
            state.status = event.content.substring(0, 60);
          }
          break;
    
        case "progress":
          if (event.content) {
            state.status = event.content;
          }
          break;
    
        case "message_end":
          if (event.content) {
            state.lastResponse = event.content;
          }
          break;
      }
    }
    
    // ============================================================
    // Telemetry Polling
    // ============================================================
    
    let pollCount = 0;
    
    function pollTelemetry(): void {
      pollCount++;
      try {
        const tel = getTelemetry();
        const report = tel.getReport();
    
        const promptTokens = report.llmCalls.length > 0
          ? Math.max(...report.llmCalls.map((c: { promptTokens: number }) => c.promptTokens))
          : 0;
        const completionTokens = report.llmCalls.length > 0
          ? Math.max(...report.llmCalls.map((c: { completionTokens: number }) => c.completionTokens))
          : 0;

        state.maxInputTokens = promptTokens;
        state.maxOutputTokens = completionTokens;
        state.llmCalls = report.llmCalls.length;
        state.toolCalls = report.toolCalls.length;
        state.plannerSteps = report.plannerDecisions.length;
      } catch {
        // Telemetry not available yet
      }
    }
    
    // ============================================================
    // Render Loop
    // ============================================================
    
    let renderInterval: ReturnType<typeof setInterval> | null = null;
    let prevStateHash = "";
    
    function getStateHash(s: DashboardState): string {
      return [
        s.maxInputTokens,
        s.maxOutputTokens,
        s.llmCalls,
        s.toolCalls,
        s.agentsUsed.size,
        s.currentAgent,
        s.status,
        s.plannerSteps,
        s.isRunning ? "1" : "0",
      ].join("|");
    }
    
    function renderFrame(): void {
      pollTelemetry();
      const hash = getStateHash(state);
      if (hash === prevStateHash) return;
      prevStateHash = hash;
    
      const dashboard = renderDashboard();
      if (dashboard === lastRender) return;
      lastRender = dashboard;
    
      process.stdout.write(ansi.cursorHome + ansi.clearScreen + dashboard + "\n");
    }
    
    // ============================================================
    // Public API
    // ============================================================
    
    /**
     * Inicializa o console dashboard.
     * Hooka no EventStream do orchestrator para atualizacoes em tempo real.
     */
    export function startConsoleDashboard(eventStream?: EventStream): void {
      if (!dashboardEnabled) return;
    
      state.startTime = Date.now();
    
      // Listen to event stream if provided
      if (eventStream) {
        (async () => {
          try {
            for await (const event of eventStream) {
              handleEvent(event);
            }
          } catch {
            // Stream ended or errored
          }
        })();
      }
    
      // Render loop: 200ms refresh (mais leve)
      renderInterval = setInterval(renderFrame, 200);
    
      // Initial render
      renderFrame();
    }
    
    /**
     * Atualiza a consulta do usuario no dashboard
     */
    export function setDashboardQuery(query: string): void {
      state.lastQuery = query.substring(0, 100);
      state.startTime = Date.now();
      state.agentsUsed = new Set();
      state.maxInputTokens = 0;
      state.maxOutputTokens = 0;
      state.llmCalls = 0;
      state.toolCalls = 0;
      state.plannerSteps = 0;
      state.lastResponse = "";
      state.isRunning = true;
      state.status = "Iniciando...";
    }
    
    /**
     * Finaliza o console dashboard
     */
    export function stopConsoleDashboard(): void {
      if (renderInterval) {
        clearInterval(renderInterval);
        renderInterval = null;
      }
    }
    
    /**
     * Atualiza o status manualmente
     */
    export function setDashboardStatus(status: string): void {
      state.status = status;
    }
    
    /**
     * Atualiza a resposta final
     */
    export function setDashboardResponse(response: string): void {
      state.lastResponse = response.substring(0, 200);
      state.isRunning = false;
      state.status = SYM.check + " Concluido";
      renderFrame();
    }
    