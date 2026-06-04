import OpenAI from "openai";
import type { LLMProviderType, LLMProviderConfig } from "../types";

// ============================================================
// Cache semântico para chamadas LLM
// ============================================================

interface CacheEntry {
  response: any;
  timestamp: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Gera uma chave de cache normalizada para o par (prompt, model).
 * Remove espaços extras e converte para lowercase para aumentar hits.
 */
export function getCacheKey(prompt: string, model: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ").toLowerCase();
  return `${model}::${normalized}`;
}

// ============================================================
// Funções originais (mantidas intactas)
// ============================================================

export function createLLMClient(provider: LLMProviderType, config?: Partial<LLMProviderConfig>): OpenAI {
  const defaults: Record<LLMProviderType, LLMProviderConfig> = {
    deepseek: { type: "deepseek", apiKey: config?.apiKey || process.env.DEEPSEEK_API_KEY || "", baseURL: config?.baseURL || "https://api.deepseek.com" },
    openai: { type: "openai", apiKey: config?.apiKey || process.env.OPENAI_API_KEY || "", baseURL: config?.baseURL || "https://api.openai.com/v1" },
  };
  const resolved = { ...defaults[provider], ...config };
  return new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseURL, timeout: 120000, maxRetries: 2 });
}

export function getDefaultProvider(): LLMProviderType {
  return (process.env.LLM_PROVIDER as LLMProviderType) || "deepseek";
}

export function createDefaultClient(config?: Partial<LLMProviderConfig>): OpenAI {
  return createLLMClient(getDefaultProvider(), config);
}

// ============================================================
// Cliente com cache semântico (via Proxy)
// ============================================================

/**
 * Cria um cliente LLM que faz cache das respostas de chat.completions.create.
 * Usa um Proxy para interceptar a chamada sem modificar a classe original.
 *
 * @param provider - Provedor LLM (deepseek | openai)
 * @param config - Configuração opcional
 * @returns OpenAI client com cache habilitado
 */
export function createCachedLLMClient(provider: LLMProviderType, config?: Partial<LLMProviderConfig>): OpenAI {
  const client = createLLMClient(provider, config);

  return new Proxy(client, {
    get(target, prop, receiver) {
      // Se não for "chat", retorna propriedade original
      if (prop !== "chat") {
        return Reflect.get(target, prop, receiver);
      }

      // Intercepta chat.completions.create
      const chat = Reflect.get(target, prop, receiver);
      return new Proxy(chat, {
        get(chatTarget, chatProp, chatReceiver) {
          if (chatProp !== "completions") {
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          }

          const completions = Reflect.get(chatTarget, chatProp, chatReceiver);
          return new Proxy(completions, {
            get(compTarget, compProp, compReceiver) {
              if (compProp !== "create") {
                return Reflect.get(compTarget, compProp, compReceiver);
              }

              const originalCreate = Reflect.get(compTarget, compProp, compReceiver);

              // Retorna função wrapper com cache
              return async (...args: any[]) => {
                const [params] = args;
                const model = params?.model || "default";
                const messages = params?.messages || [];

                // Constrói chave de cache a partir das mensagens
                const prompt = messages.map((m: any) => `${m.role}: ${m.content}`).join("\n");
                const key = getCacheKey(prompt, model);

                // Verifica cache
                const cached = responseCache.get(key);
                if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
                  return cached.response;
                }

                // Chama API real
                const options = args[1];
                const response = await originalCreate.call(compTarget, params, options);

                // Armazena no cache
                responseCache.set(key, { response, timestamp: Date.now() });

                return response;
              };
            },
          });
        },
      });
    },
  });
}