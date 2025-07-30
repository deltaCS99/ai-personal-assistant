// ===============================
// src/lib/messaging/providers/base.ts
// ===============================
import { MessageProvider, IncomingMessage } from '../types';

export abstract class BaseMessageProvider implements MessageProvider {
  abstract name: string;
  
  abstract sendMessage(chatId: string, message: string): Promise<void>;
  abstract parseWebhook(body: any): IncomingMessage | null;
  
  protected createIncomingMessage(
    chatId: string,
    text: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): IncomingMessage {
    return {
      chatId,
      text,
      userId,
      platform: this.name.toLowerCase(),
      timestamp: new Date(),
      metadata
    };
  }
  
  protected handleError(error: any, context: string): void {
    console.error(`${this.name} Provider Error (${context}):`, error);
  }
}