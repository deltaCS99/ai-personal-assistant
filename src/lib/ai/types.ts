// ===============================
// src/lib/ai/types.ts
// ===============================
export interface AIProvider {
  name: string;
  generateResponse(prompt: string, userMessage: string): Promise<string>;
}

export interface AIConfig {
  provider: 'openai' | 'claude' | 'gemini'| 'azure-foundry';
  model?: string;
  temperature?: number;
  maxTokens?: number;
}