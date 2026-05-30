import OpenAI from "openai";
import type { LLMProviderType, LLMProviderConfig } from "../types";
export declare function createLLMClient(provider: LLMProviderType, config?: Partial<LLMProviderConfig>): OpenAI;
export declare function getDefaultProvider(): LLMProviderType;
export declare function createDefaultClient(config?: Partial<LLMProviderConfig>): OpenAI;
//# sourceMappingURL=provider.d.ts.map