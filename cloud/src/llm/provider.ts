import OpenAI from "openai";
import type { LLMProviderType, LLMProviderConfig } from "../types";

export function createLLMClient(
  provider: LLMProviderType,
  config?: Partial<LLMProviderConfig>,
): OpenAI {
  const defaults: Record<LLMProviderType, LLMProviderConfig> = {
    deepseek: {
      type: "deepseek",
      apiKey: config?.apiKey || process.env.DEEPSEEK_API_KEY || "",
      baseURL: config?.baseURL || "https://api.deepseek.com",
    },
    openai: {
      type: "openai",
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY || "",
      baseURL: config?.baseURL || "https://api.openai.com/v1",
    },
  };
  const resolved = { ...defaults[provider], ...config };
  return new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseURL, timeout: 60000 });
}

export function getDefaultProvider(): LLMProviderType {
  return (process.env.LLM_PROVIDER as LLMProviderType) || "deepseek";
}

export function createDefaultClient(config?: Partial<LLMProviderConfig>): OpenAI {
  return createLLMClient(getDefaultProvider(), config);
}
