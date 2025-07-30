// ===============================
// src/lib/messaging/providers/telegram.ts
// ===============================
import TelegramBot from 'node-telegram-bot-api';
import { BaseMessageProvider } from './base';
import { IncomingMessage } from '../types';

export class TelegramProvider extends BaseMessageProvider {
  name = 'telegram';
  private readonly bot: TelegramBot;
  
  constructor(token: string) {
    super();
    this.bot = new TelegramBot(token);
  }
  
  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      await this.bot.sendMessage(parseInt(chatId), message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      this.handleError(error, 'sendMessage');
      throw error;
    }
  }
  
  parseWebhook(body: any): IncomingMessage | null {
    try {
      if (!body.message || !body.message.text) {
        return null;
      }
      
      const { message } = body;
      return this.createIncomingMessage(
        message.chat.id.toString(),
        message.text,
        message.from.id.toString(),
        {
          username: message.from.username,
          firstName: message.from.first_name,
          lastName: message.from.last_name
        }
      );
    } catch (error) {
      this.handleError(error, 'parseWebhook');
      return null;
    }
  }
}