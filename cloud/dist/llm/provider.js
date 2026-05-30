"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultClient = exports.getDefaultProvider = exports.createLLMClient = void 0;
const openai_1 = __importDefault(require("openai"));
function createLLMClient(provider, config) {
    const defaults = {
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
    return new openai_1.default({ apiKey: resolved.apiKey, baseURL: resolved.baseURL });
}
exports.createLLMClient = createLLMClient;
function getDefaultProvider() {
    return process.env.LLM_PROVIDER || "deepseek";
}
exports.getDefaultProvider = getDefaultProvider;
function createDefaultClient(config) {
    return createLLMClient(getDefaultProvider(), config);
}
exports.createDefaultClient = createDefaultClient;
//# sourceMappingURL=provider.js.map