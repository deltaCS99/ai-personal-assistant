// ===============================
// src/lib/ai/providers/claude.ts
// ===============================
import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base';

export class ClaudeProvider extends BaseAIProvider {
  name = 'Claude';
  private client: Anthropic;
  
  constructor(apiKey: string, private model: string = 'claude-3-sonnet-20240229') {
    super();
    this.client = new Anthropic({ apiKey });
  }
  
  async generateResponse(prompt: string, userMessage: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        system: this.formatSystemMessage(prompt),
        messages: [
          { role: 'user', content: this.formatUserMessage(userMessage) }
        ]
      });
      
      const content = message.content[0];
      return content.type === 'text' ? content.text : '';
    } catch (error) {
      this.handleError(error);
    }
  }
}