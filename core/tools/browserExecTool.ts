import puppeteer, { Browser, Page, ConsoleMessage } from "puppeteer";
    import path from "path";
    import fs from "fs";
    import { logger } from "../utils/logger";
    
    // ============================================================
    // Browser Tool - Navegacao Web (estilo clawbot)
    // ============================================================
    
    let browserInstance: Browser | null = null;
    let pageInstance: Page | null = null;
    
    const SCREENSHOTS_DIR = path.join(process.cwd(), "src", "browser_data");
    const HEADLESS = process.env.PUPPETEER_HEADLESS !== "false"; // default: true
    
    async function getPage(): Promise<Page> {
      if (!browserInstance || !browserInstance.connected) {
        logger.info("[BrowserTool] Iniciando navegador Puppeteer...", { headless: HEADLESS });
    
        browserInstance = await puppeteer.launch({
          executablePath: process.env.CHROME_PATH || undefined,
          headless: HEADLESS ? "new" as any : false,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--window-size=1280,800",
          ],
          defaultViewport: { width: 1280, height: 800 },
        });
    
        pageInstance = await browserInstance.newPage();
    
        // Configurar timeout generoso
        pageInstance.setDefaultNavigationTimeout(30000);
    
        // Interceptar console do browser
        pageInstance.on("console", (msg: ConsoleMessage) => {
          logger.debug(`[BrowserTool:console] ${msg.type()}: ${msg.text()}`);
        });
    
        logger.info("[BrowserTool] Navegador iniciado com sucesso");
      }
    
      if (!pageInstance) {
        const pages = await browserInstance.pages();
        pageInstance = pages[0] || (await browserInstance.newPage());
      }
    
      return pageInstance;
    }
    
    function ensureScreenshotsDir(): void {
      if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        logger.info(`[BrowserTool] Diretorio de screenshots criado: ${SCREENSHOTS_DIR}`);
      }
    }
    
    
    // ============================================================
    // Browser Health Check
    // ============================================================
    
    export function isBrowserAlive(): boolean {
      try {
        return !!(browserInstance && browserInstance.connected);
      } catch {
        return false;
      }
    }
    
    export async function restartBrowser(): Promise<boolean> {
      try {
        if (browserInstance) {
          try { await browserInstance.close(); } catch {}
        }
        browserInstance = null;
        pageInstance = null;
        await getPage(); // Reinicia
        logger.info("[BrowserTool] Browser reiniciado com sucesso");
        return true;
      } catch (e: any) {
        logger.error(`[BrowserTool] Falha ao reiniciar browser: ${e.message}`);
        return false;
      }
    }
    
    export async function ensureBrowserAlive(): Promise<boolean> {
      if (isBrowserAlive()) return true;
      logger.warn("[BrowserTool] Browser nao esta vivo. Tentando reiniciar...");
      return await restartBrowser();
    }
    
    
export const browserExecTool = {
      type: "function",
    
      function: {
        name: "browser_action",
        description: "Executa acoes de navegacao web: navegar, clicar, preencher, capturar tela, extrair texto, rolar",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["navigate", "click", "fill", "screenshot", "extractText", "scroll", "close"],
              description: "Acao a ser executada no navegador"
            },
            url: {
              type: "string",
              description: "URL para navegar (usado com action='navigate')"
            },
            selector: {
              type: "string",
              description: "Seletor CSS para clicar, preencher ou extrair texto"
            },
            value: {
              type: "string",
              description: "Valor para preencher no campo (usado com action='fill')"
            },
            direction: {
              type: "string",
              enum: ["up", "down"],
              description: "Direcao para rolar (usado com action='scroll')"
            },
            amount: {
              type: "number",
              description: "Quantidade em pixels para rolar (usado com action='scroll')"
            }
          },
          required: ["action"]
        }
      },
    
      handler: async ({
        action,
        url,
        selector,
        value,
        direction,
        amount
      }: {
        action: string;
        url?: string;
        selector?: string;
        value?: string;
        direction?: "up" | "down";
        amount?: number;
      }) => {
        try {
          logger.info(`[BrowserTool] Acao: ${action}`, { url, selector, value });
    
          switch (action) {
            // --------------------------------------------------
            // NAVEGAR
            // --------------------------------------------------
            case "navigate": {
              if (!url) {
                return { success: false, error: "URL e obrigatoria para action='navigate'" };

              // Validacao de seguranca: apenas http/https
              if (!url!.startsWith('http://') && !url!.startsWith('https://')) {
                return { success: false, error: "URL invalida. Apenas URLs http/https sao permitidas." };
              }
              }
    
              const page = await getPage();
    
              logger.info(`[BrowserTool] Navegando para: ${url}`);
              await page.goto(url, {
                waitUntil: ["networkidle2", "domcontentloaded"],
                timeout: 30000,
              });
    
              const pageTitle = await page.title();
              const currentUrl = page.url();
    
              logger.info(`[BrowserTool] Pagina carregada`, { title: pageTitle, url: currentUrl });
    
              return {
                success: true,
                title: pageTitle,
                url: currentUrl,
                message: `Navegou para ${currentUrl} - Titulo: ${pageTitle}`
              };
            }
    
            // --------------------------------------------------
            // CLICAR
            // --------------------------------------------------
            case "click": {
              if (!selector) {
                return { success: false, error: "Selector e obrigatorio para action='click'" };
              }
    
              const page = await getPage();
    
              // Esperar o elemento estar visivel
              await page.waitForSelector(selector, { timeout: 10000 });
              await page.click(selector);
    
              // Aguardar um pouco para a pagina reagir
              await new Promise(r => setTimeout(r, 500));
    
              logger.info(`[BrowserTool] Clique realizado no seletor: ${selector}`);
    
              return {
                success: true,
                message: `Clique realizado no elemento '${selector}'`
              };
            }
    
            // --------------------------------------------------
            // PREENCHER CAMPO
            // --------------------------------------------------
            case "fill": {
              if (!selector || value === undefined) {
                return { success: false, error: "Selector e value sao obrigatorios para action='fill'" };
              }
    
              const page = await getPage();
    
              await page.waitForSelector(selector, { timeout: 10000 });
    
              // Limpar campo antes de preencher
              await page.click(selector, { count: 3 }); // seleciona todo texto
              await page.keyboard.press("Backspace");
              await page.type(selector, value, { delay: 30 }); // digitar com delay realista
    
              logger.info(`[BrowserTool] Campo preenchido: ${selector} = ${value}`);
    
              return {
                success: true,
                message: `Campo '${selector}' preenchido com '${value}'`
              };
            }
    
            // --------------------------------------------------
            // SCREENSHOT
            // --------------------------------------------------
            case "screenshot": {
              const page = await getPage();
              ensureScreenshotsDir();
    
              const timestamp = Date.now();
              const filename = `screenshot_${timestamp}.png`;
              const filepath = path.join(SCREENSHOTS_DIR, filename);
    
              await page.screenshot({
                path: filepath,
                fullPage: true,
                type: "png",
              });
    
              // Retornar base64 para uso do LLM
              const imageBuffer = fs.readFileSync(filepath);
              const base64 = imageBuffer.toString("base64");
    
              logger.info(`[BrowserTool] Screenshot salvo: ${filename} (${imageBuffer.length} bytes)`);
    
              return {
                success: true,
                filename,
                path: filepath,
                base64,
                size: imageBuffer.length,
                message: `Screenshot capturado: ${filename}`
              };
            }
    
            // --------------------------------------------------
            // EXTRAIR TEXTO
            // --------------------------------------------------
            case "extractText": {
              const page = await getPage();
    
              let text: string;
    
              if (selector) {
                const element = await page.$(selector);
                if (!element) {
                  return { success: false, error: `Elemento '${selector}' nao encontrado` };
                }
                text = await page.$eval(selector, (el: any) => el.innerText || el.textContent || "");
              } else {
                // Extrair texto do body inteiro
                text = await page.$eval("body", (el: any) => el.innerText || el.textContent || "");
              }
    
              // Limitar tamanho para nao estourar contexto do LLM
              const maxLength = 8000;
              const truncated = text.length > maxLength ? text.slice(0, maxLength) + `
... [truncado: ${text.length - maxLength} caracteres]` : text;
    
              logger.info(`[BrowserTool] Texto extraido (${text.length} chars, mostrando ${Math.min(text.length, maxLength)})`);
    
              return {
                success: true,
                text: truncated,
                fullLength: text.length,
                message: `Texto extraido com sucesso (${text.length} caracteres)`
              };
            }
    
            // --------------------------------------------------
            // ROLAR PAGINA
            // --------------------------------------------------
            case "scroll": {
              const page = await getPage();
              const scrollAmount = amount || 500;
              const delta = direction === "up" ? -scrollAmount : scrollAmount;
    
              await page.evaluate((deltaY: number) => {
                // @ts-ignore - window is valid inside page.evaluate()
                window.scrollBy(0, deltaY);
              }, delta);
    
              await new Promise(r => setTimeout(r, 300));
    
              logger.info(`[BrowserTool] Rolagem ${direction}: ${scrollAmount}px`);
    
              return {
                success: true,
                direction,
                amount: scrollAmount,
                message: `Pagina rolada ${direction} em ${scrollAmount}px`
              };
            }
    
            // --------------------------------------------------
            // FECHAR NAVEGADOR
            // --------------------------------------------------
            case "close": {
              if (browserInstance) {
                await browserInstance.close();
                browserInstance = null;
                pageInstance = null;
                logger.info("[BrowserTool] Navegador fechado");
              }
              return { success: true, message: "Navegador fechado" };
            }
    
            default:
              return {
                success: false,
                error: `Acao desconhecida: '${action}'. Acoes validas: navigate, click, fill, screenshot, extractText, scroll, close`
              };
          }
        } catch (error: any) {
          logger.error(`[BrowserTool] Erro na acao '${action}'`, {
            error: error.message,
            stack: error.stack?.slice(0, 500)
          });
    
          return {
            success: false,
            error: error.message,
            action
          };
        }
      }
    };
    