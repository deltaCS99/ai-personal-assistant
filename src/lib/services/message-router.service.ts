import { MessageProviderFactory } from '@/lib/messaging/factory';
import { IncomingMessage, MessagePlatform } from '@/lib/messaging/types';
import { UserService } from './user.service';
import { ConversationalAIService } from './conversational-ai.service';
import { log } from '@/lib/logger';

export class MessageRouterService {
  private readonly userService = new UserService();
  private readonly conversationalAI = new ConversationalAIService();

  async processMessage(platform: MessagePlatform, webhookBody: any): Promise<void> {
    try {
      // Parse message from any platform  
      const provider = MessageProviderFactory.create(platform);
      const incomingMessage = provider.parseWebhook(webhookBody);
      
      if (!incomingMessage) {
        log.info('No valid message in webhook');
        return;
      }

      log.info('Processing message', { 
        platform, 
        userId: incomingMessage.userId.substring(0, 8),
        messagePreview: incomingMessage.text.substring(0, 50)
      });

      // Find or create user (lazy setup starts here)
      const user = await this.userService.findOrCreateUser(platform, incomingMessage.userId);

      // Check if user sent a username to identify themselves
      const usernameMatch = this.extractUsername(incomingMessage.text);
      if (usernameMatch) {
        const userByUsername = await this.userService.getUserByUsername(usernameMatch);
        if (userByUsername && userByUsername.id !== user.id) {
          // They're trying to use someone else's username
          await provider.sendMessage(
            incomingMessage.chatId, 
            `That username belongs to someone else! You're identified by your ${platform} account.`
          );
          return;
        }
      }

      // Process through conversational AI (handles lazy setup + conversation + tools)
      const response = await this.conversationalAI.processMessage(user.id, incomingMessage.text);

      // Send response
      await provider.sendMessage(incomingMessage.chatId, response);

      log.info('Message processed successfully', { 
        userId: user.id.substring(0, 8),
        responseLength: response.length
      });

    } catch (error) {
      log.error('Message processing failed', error);
      await this.sendErrorMessage(platform, webhookBody);
    }
  }

  private extractUsername(message: string): string | null {
    // Simple username extraction for user identification
    const trimmed = message.trim();
    if (/^[a-zA-Z0-9_]+$/.test(trimmed) && trimmed.length > 2) {
      return trimmed.toLowerCase();
    }
    return null;
  }

  private async sendErrorMessage(platform: MessagePlatform, webhookBody: any): Promise<void> {
    try {
      const provider = MessageProviderFactory.create(platform);
      const incomingMessage = provider.parseWebhook(webhookBody);
      
      if (incomingMessage) {
        await provider.sendMessage(
          incomingMessage.chatId,
          '❌ Sorry, I encountered an error. Please try again or say "help" for assistance.'
        );
      }
    } catch (sendError) {
      log.error('Failed to send error message', sendError);
    }
  }
}