export interface AppConfig {
  model: string;
  llmProvider: "openai" | "deepseek";
  maxMessagesPerSession: number;
  pythonTimeout: number;
  browserHeadless: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  telegramToken?: string;
}

const DEFAULTS: AppConfig = {
  model: "deepseek-v4-pro",
  llmProvider: "deepseek",
  maxMessagesPerSession: 100,
  pythonTimeout: 30000,
  browserHeadless: true,
  logLevel: "info",
};

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const env: Partial<AppConfig> = {
    model: process.env.MODEL,
    llmProvider: process.env.LLM_PROVIDER as AppConfig["llmProvider"] | undefined,
    maxMessagesPerSession: process.env.MAX_MESSAGES_PER_SESSION ? parseInt(process.env.MAX_MESSAGES_PER_SESSION, 10) : undefined,
    pythonTimeout: process.env.PYTHON_TIMEOUT ? parseInt(process.env.PYTHON_TIMEOUT, 10) : undefined,
    browserHeadless: process.env.PUPPETEER_HEADLESS !== "false",
    logLevel: (process.env.LOG_LEVEL as AppConfig["logLevel"]) || undefined,
    telegramToken: process.env.TELEGRAM_TOKEN,
  };
  const merged = { ...DEFAULTS };
  for (const key of Object.keys(merged) as (keyof AppConfig)[]) {
    const envVal = (env as any)[key];
    const overrideVal = overrides ? overrides[key] : undefined;
    if (overrideVal !== undefined) (merged as any)[key] = overrideVal;
    else if (envVal !== undefined) (merged as any)[key] = envVal;
  }
  if (!["openai","deepseek"].includes(merged.llmProvider)) merged.llmProvider = "deepseek";
  if (merged.maxMessagesPerSession < 1) merged.maxMessagesPerSession = 100;
  if (merged.pythonTimeout < 1000) merged.pythonTimeout = 30000;
  return merged;
}

let _config: AppConfig | null = null;
export function getConfig(): AppConfig { if (!_config) _config = loadConfig(); return _config; }
export function resetConfig(): void { _config = null; }
