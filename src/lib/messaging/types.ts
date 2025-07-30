// ===============================
// src/lib/messaging/types.ts
// ===============================
export interface MessageProvider {
  name: string;
  sendMessage(chatId: string, message: string): Promise<void>;
  parseWebhook(body: any): IncomingMessage | null;
}

export interface IncomingMessage {
  chatId: string;
  text: string;
  userId: string;
  platform: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type MessagePlatform = 'telegram' | 'whatsapp' | 'sms';