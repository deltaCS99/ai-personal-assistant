// ===============================
// src/lib/messaging/providers/whatsapp.ts
// ===============================
import { BaseMessageProvider } from './base';
import { IncomingMessage } from '../types';

export class WhatsAppProvider extends BaseMessageProvider {
  name = 'whatsapp';
  private accessToken: string;
  private phoneNumberId: string;
  
  constructor(accessToken: string, phoneNumberId: string) {
    super();
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }
  
  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: chatId,
            type: 'text',
            text: { body: message }
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.statusText}`);
      }
    } catch (error) {
      this.handleError(error, 'sendMessage');
      throw error;
    }
  }
  
  parseWebhook(body: any): IncomingMessage | null {
    try {
      if (!body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        return null;
      }
      
      const message = body.entry[0].changes[0].value.messages[0];
      const contact = body.entry[0].changes[0].value.contacts[0];
      
      if (message.type !== 'text') {
        return null;
      }
      
      return this.createIncomingMessage(
        message.from,
        message.text.body,
        message.from,
        {
          contactName: contact?.profile?.name,
          messageId: message.id
        }
      );
    } catch (error) {
      this.handleError(error, 'parseWebhook');
      return null;
    }
  }
}