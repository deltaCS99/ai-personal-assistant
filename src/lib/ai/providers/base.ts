// ===============================
// src/lib/ai/providers/base.ts
// ===============================
import { AIProvider } from '../types';

export abstract class BaseAIProvider implements AIProvider {
  abstract name: string;
  abstract generateResponse(prompt: string, userMessage: string): Promise<string>;
  
  protected formatSystemMessage(prompt: string): string {
    return prompt.trim();
  }
  
  protected formatUserMessage(message: string): string {
    return message.trim();
  }
  
  protected handleError(error: any): never {
    console.error(`AI Provider Error (${this.name}):`, error);
    throw new Error(`AI processing failed: ${error.message}`);
  }
}
