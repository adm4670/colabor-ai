// @ts-nocheck - puppeteer types not installed
    /**
     * BrowserNavigateTool - Automacao avancada de navegador.
     *
     * Diferente do browserExecTool (acao unica por chamada),
     * esta ferramenta aceita uma sequencia de passos (steps array),
     * permitindo automatizar fluxos completos como login,
     * preenchimento de formularios e extracao de dados.
     *
     * Inspirado no clawbot/OpenClaw BrowserNavigateTool.
     */
    
    import path from "path";
    import fs from "fs";
    import { logger } from "../utils/logger";
    import { ToolDefinition, ToolContext } from "./toolDefinition";
    import { getPage, ensureScreenshotsDir, closeBrowser } from "./browserExecTool";
    
    // ============================================================
    // Tipos
    // ============================================================
    
    export type BrowserAction =
      | { type: "navigate"; url: string }
      | { type: "click"; selector: string }
      | { type: "fill"; selector: string; value: string }
      | { type: "select"; selector: string; option: string }
      | { type: "wait"; selector?: string; milliseconds?: number }
      | { type: "press"; key: string }
      | { type: "scroll"; direction: "up" | "down"; amount?: number }
      | { type: "hover"; selector: string }
      | { type: "screenshot"; name?: string }
      | { type: "extract"; selector?: string }
      | { type: "evaluate"; javascript: string }
      | { type: "close" };
    
    interface BrowserNavigateArgs {
      /** URL inicial para navegar */
      url: string;
      /** Sequencia de acoes a executar no browser */
      steps: BrowserAction[];
      /** Se false, abre janela visivel do Chromium (default: true = headless/invisivel) */
      headless?: boolean;
    }
    
    interface BrowserStepResult {
      step: number;
      type: string;
      success: boolean;
      result?: any;
      error?: string;
    }
    
    interface BrowserNavigateResult {
      success: boolean;
      results: BrowserStepResult[];
      finalUrl?: string;
      finalTitle?: string;
    }
    
    // ============================================================
    // Tool Definition (padrao ToolDefinition)
    // ============================================================
    
    export const browserNavigateTool: ToolDefinition<
      BrowserNavigateArgs,
      BrowserNavigateResult
    > = {
      name: "browser_navigate",
      description:
        "Executa uma sequencia de acoes de navegacao no browser. Use para automatizar tarefas web complexas como login, preenchimento de formularios, extracao de dados e interacao com paginas. Suporta: navigate, click, fill, select, wait, press, scroll, hover, screenshot, extract, evaluate, close. Use headless=false para abrir janela visivel e acompanhar a execucao (debug).",
    
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL inicial para navegar",
          },
          headless: {
            type: "boolean",
            description: "Se false, abre o Chromium com janela visivel. Default: true (modo invisivel/headless). Use false para debugging ou demonstracoes.",
          },
          steps: {
            type: "array",
            description:
              "Sequencia de acoes a executar no browser. Cada acao tem um 'type' e parametros especificos.",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "navigate",
                    "click",
                    "fill",
                    "select",
                    "wait",
                    "press",
                    "scroll",
                    "hover",
                    "screenshot",
                    "extract",
                    "evaluate",
                    "close",
                  ],
                  description: "Tipo de acao a executar",
                },
                url: {
                  type: "string",
                  description: "URL para navegar (usado com type='navigate')",
                },
                selector: {
                  type: "string",
                  description:
                    "Seletor CSS para clicar, preencher, selecionar, hover ou extrair texto",
                },
                value: {
                  type: "string",
                  description: "Valor para preencher no campo (usado com type='fill')",
                },
                option: {
                  type: "string",
                  description: "Opcao para selecionar em dropdown (usado com type='select')",
                },
                key: {
                  type: "string",
                  description:
                    "Tecla para pressionar: Enter, Tab, Escape, Backspace, ArrowDown, etc. (usado com type='press')",
                },
                direction: {
                  type: "string",
                  enum: ["up", "down"],
                  description: "Direcao para rolar a pagina (usado com type='scroll')",
                },
                amount: {
                  type: "number",
                  description:
                    "Quantidade em pixels para rolar (usado com type='scroll', default: 500)",
                },
                milliseconds: {
                  type: "number",
                  description:
                    "Tempo em ms para aguardar (usado com type='wait', default: 1000)",
                },
                javascript: {
                  type: "string",
                  description:
                    "Codigo JavaScript para executar na pagina (usado com type='evaluate')",
                },
                name: {
                  type: "string",
                  description:
                    "Nome do arquivo de screenshot (usado com type='screenshot', default: screenshot_TIMESTAMP.png)",
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["url", "steps"],
      },
    
      execute: async (
        args: BrowserNavigateArgs,
        _ctx: ToolContext
      ): Promise<BrowserNavigateResult> => {
        const results: BrowserStepResult[] = [];
    
        try {
          logger.info(
            `[BrowserNavigate] Iniciando navegacao: ${args.url} (${args.steps.length} steps)`
          );
    
          for (let i = 0; i < args.steps.length; i++) {
            const step = args.steps[i];
            const stepNum = i + 1;
    
            logger.info(
              `[BrowserNavigate] Step ${stepNum}/${args.steps.length}: ${step.type}`
            );
    
            try {
              const page = await getPage(args.headless);
              let result: any;
    
              switch (step.type) {
                // --------------------------------------------------
                // NAVEGAR
                // --------------------------------------------------
                case "navigate": {
                  if (!step.url)
                    throw new Error("URL obrigatoria para action='navigate'");
    
                  await page.goto(step.url, {
                    waitUntil: ["networkidle2", "domcontentloaded"],
                    timeout: 30000,
                  });
    
                  result = {
                    url: page.url(),
                    title: await page.title(),
                  };
                  break;
                }
    
                // --------------------------------------------------
                // CLICAR
                // --------------------------------------------------
                case "click": {
                  if (!step.selector)
                    throw new Error("Selector obrigatorio para action='click'");
    
                  await page.waitForSelector(step.selector, { timeout: 10000 });
                  await page.click(step.selector);
                  await new Promise((r) => setTimeout(r, 500));
    
                  result = { clicked: step.selector };
                  break;
                }
    
                // --------------------------------------------------
                // PREENCHER CAMPO
                // --------------------------------------------------
                case "fill": {
                  if (!step.selector || step.value === undefined)
                    throw new Error(
                      "Selector e value obrigatorios para action='fill'"
                    );
    
                  await page.waitForSelector(step.selector, { timeout: 10000 });
    
                  // Limpa o campo antes de preencher
                  await page.click(step.selector, { clickCount: 3 });
                  await page.keyboard.press("Backspace");
                  await page.type(step.selector, step.value, { delay: 30 });
    
                  result = { filled: step.selector, value: step.value };
                  break;
                }
    
                // --------------------------------------------------
                // SELECIONAR DROPDOWN
                // --------------------------------------------------
                case "select": {
                  if (!step.selector || !step.option)
                    throw new Error(
                      "Selector e option obrigatorios para action='select'"
                    );
    
                  await page.waitForSelector(step.selector, { timeout: 10000 });
                  await page.select(step.selector, step.option);
    
                  result = { selected: step.selector, option: step.option };
                  break;
                }
    
                // --------------------------------------------------
                // AGUARDAR
                // --------------------------------------------------
                case "wait": {
                  if (step.selector) {
                    await page.waitForSelector(step.selector, { timeout: 15000 });
                    result = { waitedFor: step.selector };
                  } else if (step.milliseconds) {
                    await new Promise((r) => setTimeout(r, step.milliseconds));
                    result = { waitedMs: step.milliseconds };
                  } else {
                    await new Promise((r) => setTimeout(r, 1000));
                    result = { waitedMs: 1000 };
                  }
                  break;
                }
    
                // --------------------------------------------------
                // PRESSIONAR TECLA
                // --------------------------------------------------
                case "press": {
                  if (!step.key)
                    throw new Error("Key obrigatoria para action='press'");
    
                  await page.keyboard.press(step.key);
                  result = { pressed: step.key };
                  break;
                }
    
                // --------------------------------------------------
                // ROLAR PAGINA
                // --------------------------------------------------
                case "scroll": {
                  const amount = step.amount || 500;
                  const delta = step.direction === "up" ? -amount : amount;
    
                  // @ts-ignore - window is valid inside page.evaluate()
                  await page.evaluate((dy: number) => window.scrollBy(0, dy), delta);
                  await new Promise((r) => setTimeout(r, 300));
    
                  result = {
                    scrolled: step.direction || "down",
                    amount,
                  };
                  break;
                }
    
                // --------------------------------------------------
                // HOVER
                // --------------------------------------------------
                case "hover": {
                  if (!step.selector)
                    throw new Error("Selector obrigatorio para action='hover'");
    
                  await page.waitForSelector(step.selector, { timeout: 10000 });
                  await page.hover(step.selector);
    
                  result = { hovered: step.selector };
                  break;
                }
    
                // --------------------------------------------------
                // SCREENSHOT
                // --------------------------------------------------
                case "screenshot": {
                  ensureScreenshotsDir();
    
                  const timestamp = Date.now();
                  const filename = step.name || `screenshot_${timestamp}.png`;
                  const screenshotsDir = path.join(
                    process.cwd(),
                    "src",
                    "browser_data"
                  );
                  const filepath = path.join(screenshotsDir, filename);
    
                  await page.screenshot({
                    path: filepath,
                    fullPage: true,
                    type: "png",
                  });
    
                  const buffer = fs.readFileSync(filepath);
    
                  result = {
                    filename,
                    path: filepath,
                    size: buffer.length,
                    base64: buffer.toString("base64"),
                  };
                  break;
                }
    
                // --------------------------------------------------
                // EXTRAIR TEXTO
                // --------------------------------------------------
                case "extract": {
                  if (step.selector) {
                    const el = await page.$(step.selector);
                    if (!el)
                      throw new Error(`Elemento '${step.selector}' nao encontrado`);
    
                    const text = await page.$eval(
                      step.selector,
                      (el: any) => el.innerText || el.textContent || ""
                    );
    
                    result = {
                      text,
                      selector: step.selector,
                      fullLength: text.length,
                    };
                  } else {
                    // Extrair texto do body inteiro
                    const text = await page.$eval(
                      "body",
                      (el: any) => el.innerText || el.textContent || ""
                    );
    
                    // Limitar tamanho para nao estourar contexto do LLM
                    const maxLength = 8000;
                    const truncated =
                      text.length > maxLength
                        ? text.slice(0, maxLength) +
                          `\n... [truncado: ${text.length - maxLength} caracteres]`
                        : text;
    
                    result = {
                      text: truncated,
                      fullLength: text.length,
                    };
                  }
                  break;
                }
    
                // --------------------------------------------------
                // EXECUTAR JAVASCRIPT
                // --------------------------------------------------
                case "evaluate": {
                  if (!step.javascript)
                    throw new Error(
                      "JavaScript obrigatorio para action='evaluate'"
                    );
    
                  const jsResult = await page.evaluate(step.javascript);
                  result = { jsResult };
                  break;
                }
    
                // --------------------------------------------------
                // FECHAR NAVEGADOR
                // --------------------------------------------------
                case "close": {
                  await closeBrowser();
                  result = { closed: true };
                  break;
                }
    
                default:
                  throw new Error(
                    `Acao desconhecida: '${(step as any).type}'. Acoes validas: navigate, click, fill, select, wait, press, scroll, hover, screenshot, extract, evaluate, close`
                  );
              }
    
              results.push({
                step: stepNum,
                type: step.type,
                success: true,
                result,
              });
            } catch (err: any) {
              logger.error(
                `[BrowserNavigate] Step ${stepNum} (${step.type}) falhou: ${err.message}`
              );
    
              results.push({
                step: stepNum,
                type: step.type,
                success: false,
                error: err.message,
              });
    
              // Para execucao no primeiro erro
              break;
            }
          }
    
          // Obter estado final da pagina
          let finalUrl = "";
          let finalTitle = "";
          try {
            const page = await getPage(args.headless);
            finalUrl = page.url();
            finalTitle = await page.title();
          } catch {
            // Browser pode estar fechado
          }
    
          return {
            success: results.every((r) => r.success),
            results,
            finalUrl,
            finalTitle,
          };
        } catch (err: any) {
          logger.error(`[BrowserNavigate] Erro fatal: ${err.message}`);
          return {
            success: false,
            results,
          };
        }
      },
    };
    
    // ============================================================
    // OpenAI Function Calling format
    // ============================================================
    
    export const browserNavigateOpenAI = {
      type: "function" as const,
      function: {
        name: browserNavigateTool.name,
        description: browserNavigateTool.description,
        parameters: browserNavigateTool.parameters,
      },
    };
    
    // ============================================================
    // Handler para function calling
    // ============================================================
    
    export const browserNavigateHandler: Function = async (
      args: BrowserNavigateArgs
    ) => {
      const result = await browserNavigateTool.execute(args, {
        agentName: "browser_navigate",
        userId: 0,
      });
    
      // Formatar resultado para o modelo
      if (!result.success) {
        const errors = result.results
          .filter((r) => !r.success)
          .map((r) => `Step ${r.step} (${r.type}): ${r.error}`)
          .join("\n");
        return `Falha na navegacao:\n${errors}`;
      }
    
      const summary = result.results
        .map((r) => {
          if (r.type === "extract" && r.result?.text) {
            const preview =
              r.result.text.length > 500
                ? r.result.text.slice(0, 500) + "..."
                : r.result.text;
            return `Step ${r.step} (${r.type}): Texto extraido:\n${preview}`;
          }
          if (r.type === "screenshot" && r.result?.filename) {
            return `Step ${r.step} (screenshot): ${r.result.filename} (${r.result.size} bytes)`;
          }
          if (r.type === "navigate" && r.result?.title) {
            return `Step ${r.step} (navigate): ${r.result.title} - ${r.result.url}`;
          }
          return `Step ${r.step} (${r.type}): OK`;
        })
        .join("\n");
    
      return `Navegacao concluida. URL final: ${result.finalUrl}\n\n${summary}`;
    };
    