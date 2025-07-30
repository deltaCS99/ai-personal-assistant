// ===============================
// src/lib/ai/providers/openai.ts
// ===============================
import OpenAI from 'openai';
import { BaseAIProvider } from './base';

export class OpenAIProvider extends BaseAIProvider {
  name = 'OpenAI';
  private readonly client: OpenAI;
  
  constructor(apiKey: string, private readonly model: string = 'gpt-4o') {
    super();
    this.client = new OpenAI({ apiKey });
  }
  
  async generateResponse(prompt: string, userMessage: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.formatSystemMessage(prompt) },
          { role: 'user', content: this.formatUserMessage(userMessage) }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });
      
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      this.handleError(error);
    }
  }
}