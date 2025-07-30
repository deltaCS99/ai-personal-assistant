// ===============================
// src/lib/messaging/providers/sms.ts
// ===============================
import { Twilio } from 'twilio';
import { BaseMessageProvider } from './base';
import { IncomingMessage } from '../types';

export class SMSProvider extends BaseMessageProvider {
  name = 'sms';
  private client: Twilio;
  private phoneNumber: string;
  
  constructor(accountSid: string, authToken: string, phoneNumber: string) {
    super();
    this.client = new Twilio(accountSid, authToken);
    this.phoneNumber = phoneNumber;
  }
  
  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: chatId
      });
    } catch (error) {
      this.handleError(error, 'sendMessage');
      throw error;
    }
  }
  
  parseWebhook(body: any): IncomingMessage | null {
    try {
      if (!body.Body || !body.From) {
        return null;
      }
      
      return this.createIncomingMessage(
        body.From,
        body.Body,
        body.From,
        {
          messageId: body.MessageSid,
          accountSid: body.AccountSid
        }
      );
    } catch (error) {
      this.handleError(error, 'parseWebhook');
      return null;
    }
  }
}
