// ===============================
// src/lib/messaging/factory.ts
// ===============================
import { MessageProvider, MessagePlatform } from './types';
import { TelegramProvider } from './providers/telegram';
import { WhatsAppProvider } from './providers/whatsapp';
import { SMSProvider } from './providers/sms';

export class MessageProviderFactory {
  private static readonly instances: Map<string, MessageProvider> = new Map();
  
  static create(platform: MessagePlatform, serviceType?: string): MessageProvider {
    const key = platform;
    
    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }
    
    let provider: MessageProvider;
    
    switch (platform) {
      case 'telegram':
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!telegramToken) {
          throw new Error('TELEGRAM_BOT_TOKEN not found');
        }
        provider = new TelegramProvider(telegramToken);
        break;
        
      case 'whatsapp':
        const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        
        if (!whatsappToken || !phoneNumberId) {
          throw new Error('WhatsApp credentials not found');
        }
        
        provider = new WhatsAppProvider(whatsappToken, phoneNumberId);
        break;
        
      case 'sms':
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
        
        if (!twilioSid || !twilioToken || !twilioNumber) {
          throw new Error('Twilio credentials not found');
        }
        
        provider = new SMSProvider(twilioSid, twilioToken, twilioNumber);
        break;
        
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    this.instances.set(key, provider);
    return provider;
  }
}