// ===============================
// src/lib/services/conversational-ai.service.ts - COMPLETE WITH FIXES
// ===============================
import { PromptFactory } from '@/lib/ai/prompts/factory';
import { UserService } from './user.service';
import { SalesService } from './sales.service';
import { FinanceService } from './finance.service';
import { ConfirmationService } from './confirmation.service';
import { ConversationHistoryService } from './conversation-history.service';
import { BaseAIService } from './base-ai.service';
import { EntityContext } from './context-detector.service';
import { prisma } from '@/lib/database/client';
import { log } from '@/lib/logger';
import { extractJsonPayload } from '../utils/json';

export class ConversationalAIService extends BaseAIService {
  private readonly userService = new UserService();
  private readonly salesService = new SalesService();
  private readonly financeService = new FinanceService();

  async processMessage(userId: string, message: string, conversationHistory?: string): Promise<string> {
    try {
      // 🎯 STEP 1: Store user message in conversation history
      await ConversationHistoryService.addMessage(userId, 'user', message, 'general');

      // 🎯 STEP 2: Check for pending confirmations FIRST
      const [salesConfirmation, financeConfirmation] = await Promise.all([
        ConfirmationService.hasPendingConfirmation(userId, 'sales'),
        ConfirmationService.hasPendingConfirmation(userId, 'finance')
      ]);

      let response: string;
      let responseContext: 'sales' | 'finance' | 'general' = 'general';

      // If user has pending confirmations, route directly to appropriate service
      if (salesConfirmation && this.looksLikeConfirmation(message)) {
        response = await this.salesService.processMessage(userId, message, conversationHistory);
        responseContext = 'sales';
      } else if (financeConfirmation && this.looksLikeConfirmation(message)) {
        response = await this.financeService.processMessage(userId, message, conversationHistory);
        responseContext = 'finance';
      } else {
        // No pending confirmations - proceed with context-aware processing
        response = await this.processMessageWithContext(userId, message, conversationHistory);
        
        // 🎯 NEW: Extract context from AI response
        const jsonResponse = extractJsonPayload(response);
        responseContext = jsonResponse.context || 'general';
      }

      // Store AI response with determined context
      await ConversationHistoryService.addMessage(userId, 'assistant', response, responseContext);

      return response;

    } catch (error) {
      const errorResponse = this.logError(error, 'Conversational AI', userId);
      
      // Store error response in history too
      await ConversationHistoryService.addMessage(userId, 'assistant', errorResponse, 'general');
      
      return errorResponse;
    }
  }

  // 🎯 Implement the abstract method from BaseAIService
  protected async processWithEnhancedContext(
    userId: string,
    message: string,
    entityContext: EntityContext,
    conversationHistory?: string
  ): Promise<string> {
    try {
      const setupState = await this.userService.getSetupState(userId);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      const providerName = this.getProviderName();
      
      // Add all context sources
      let contextualInfo = `\n\n=== RETRIEVED CONTEXT ===\n${entityContext.context}\n=== END CONTEXT ===\n`;
      
      if (conversationHistory) {
        contextualInfo = `\n\n=== CONVERSATION HISTORY ===\n${conversationHistory}\n${contextualInfo}`;
      }
      
      const prompt = this.buildContextualPrompt(user, setupState, providerName) + contextualInfo;
      
      const aiResponse = await this.aiProvider.generateResponse(prompt, message);
      return await this.processAIResponse(userId, aiResponse, message);

    } catch (error) {
      log.error('Enhanced context processing failed, falling back', { error, userId: userId.substring(0, 8) });
      // Fallback to normal processing
      return await this.processNormalMessage(userId, message, conversationHistory);
    }
  }

  // 🎯 Enhanced normal processing with conversation history
  protected async processNormalMessage(userId: string, message: string, conversationHistory?: string): Promise<string> {
    const setupState = await this.userService.getSetupState(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    const providerName = this.getProviderName();
    let prompt = this.buildContextualPrompt(user, setupState, providerName);
    
    // Add conversation history if available
    if (conversationHistory) {
      prompt += `\n\n=== CONVERSATION HISTORY ===\n${conversationHistory}\n=== END HISTORY ===\n`;
    }
    
    const aiResponse = await this.aiProvider.generateResponse(prompt, message);
    return await this.processAIResponse(userId, aiResponse, message);
  }

  // 🎯 ENHANCED: Better confirmation detection to avoid conflicts
  private looksLikeConfirmation(message: string): boolean {
    const confirmationPatterns = [
      /^(yes|y|confirm|create new|new lead|new transaction)$/i,
      /^(no|n|cancel|abort)$/i,
      /^(update|use existing)$/i,
      /^update\s+\d+$/i,
      /^(show|details|info)\s*\d*$/i
    ];
    
    const trimmedMessage = message.trim();
    
    return confirmationPatterns.some(pattern => pattern.test(trimmedMessage)) && 
           trimmedMessage.length < 25;
  }

  private buildContextualPrompt(user: any, setupState: any, providerName: string): string {
    const userContext = `
Current User Context:
- Has Username: ${setupState.hasUsername} ${user?.username ? `(${user.username})` : ''}
- Has Name: ${setupState.hasName} ${user?.name ? `(${user.name})` : ''}
- Is New User: ${setupState.isNewUser}
- Morning Notifications: ${user?.enableMorningNotification ? 'Enabled' : 'Disabled'}
- Evening Notifications: ${user?.enableEveningNotification ? 'Enabled' : 'Disabled'}

CRITICAL SETUP EXTRACTION RULES:
- If user has NO username and provides any potential username, extract it immediately
- Examples: "deltaCS" → extract "deltaCS", "I want to use mike_boss" → extract "mike_boss"
- Don't ask for username repeatedly if you just extracted one
- Clean usernames: lowercase, replace spaces with underscores, remove special chars

IMPORTANT: Do NOT handle confirmation responses like "yes", "no", "update", "show" - these are handled by specialized services.

CONVERSATION CONTINUITY:
- Use conversation history to maintain context and avoid repetition
- Reference previous discussions naturally
- Build on past conversations to provide better assistance
- Remember user preferences and patterns from history

CONTEXT CLASSIFICATION:
- ALWAYS include "context" field in your JSON response
- Set context to "general" for setup, chat, help
- Set context to "sales" when routing to sales tool
- Set context to "finance" when routing to finance tool
- This helps categorize conversations for analytics and history

CRITICAL JSON REQUIREMENT:
- You MUST ALWAYS return valid JSON in the specified format
- NEVER return plain text responses
- If you're having trouble with JSON, wrap your response like this:
{
  "response": "your actual response here",
  "context": "general",
  "setupActions": [],
  "toolCalls": []
}

Current Status Context:
${setupState.hasUsername ? 'User already has username set' : 'NEEDS USERNAME - extract from their message'}
${setupState.hasName ? 'User already has name set' : 'May need name after username is set'}
`;

    return PromptFactory.getConversationPrompt(providerName, userContext);
  }

  private async processAIResponse(userId: string, aiResponse: string, originalMessage: string): Promise<string> {
    const jsonResponse = extractJsonPayload(aiResponse);

    await this.handleSetupActions(userId, jsonResponse.setupActions);
    const toolResults = await this.handleToolCalls(userId, jsonResponse.toolCalls, originalMessage);

    return this.buildFinalResponse(jsonResponse.response, toolResults);
  }

  private async handleSetupActions(userId: string, setupActions: any[]): Promise<void> {
    if (!setupActions?.length) return;

    for (const setupAction of setupActions) {
      await this.executeSetupAction(userId, setupAction);
    }
  }

  private async handleToolCalls(userId: string, toolCalls: any[], originalMessage: string): Promise<string[]> {
    if (!toolCalls?.length) return [];

    // 🎯 NEW: Get conversation history for services
    const conversationHistory = await ConversationHistoryService.getContextMessages(userId, 8);

    const results: string[] = [];
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(userId, toolCall, originalMessage, conversationHistory);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  private buildFinalResponse(aiResponse: string, toolResults: string[]): string {
    let finalResponse = '';

    if (aiResponse?.trim()) {
      finalResponse = aiResponse;
    }

    if (toolResults.length > 0) {
      const toolOutput = toolResults.join('\n\n');
      finalResponse = finalResponse ? `${finalResponse}\n\n${toolOutput}` : toolOutput;
    }

    return finalResponse || "I'm here to help! What can I do for you?";
  }

  private async executeSetupAction(userId: string, setupAction: any): Promise<void> {
    try {
      if (setupAction.confidence <= this.getMinConfidence(setupAction.action)) return;

      switch (setupAction.action) {
        case 'set_username':
          await this.handleUsernameSetup(userId, setupAction.value);
          break;
        case 'set_name':
          await this.handleNameSetup(userId, setupAction.value);
          break;
        case 'set_notifications':
          await this.handleNotificationSetup(userId, setupAction.value);
          break;
      }
    } catch (error) {
      log.error('Setup action failed', error, { action: setupAction.action });
    }
  }

  private getMinConfidence(action: string): number {
    return action === 'set_notifications' ? 0.8 : 0.7;
  }

  private async handleUsernameSetup(userId: string, value: string): Promise<void> {
    const cleanUsername = this.cleanUsername(value);
    if (cleanUsername.length < 2) return;

    const result = await this.userService.updateUsername(userId, cleanUsername);
    const logData = { userId, username: cleanUsername };

    if (result.success) {
      log.info('Username set successfully', logData);
    } else {
      log.warn('Username update failed', { ...logData, error: result.error });
    }
  }

  private cleanUsername(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .substring(0, 30);
  }

  private async handleNameSetup(userId: string, value: string): Promise<void> {
    await this.userService.updateName(userId, value);
    log.info('Name set successfully', { userId, name: value });
  }

  private async handleNotificationSetup(userId: string, value: string): Promise<void> {
    await this.updateNotificationPreferences(userId, value);
    log.info('Notifications updated successfully', { userId, action: value });
  }

  private async updateNotificationPreferences(userId: string, action: string): Promise<void> {
    const updates: any = {};

    switch (action) {
      case 'enable_both':
        updates.enableMorningNotification = true;
        updates.enableEveningNotification = true;
        updates.morningNotificationTime = '08:00';
        updates.eveningNotificationTime = '18:00';
        break;
      case 'disable_both':
        updates.enableMorningNotification = false;
        updates.enableEveningNotification = false;
        break;
      case 'enable_morning':
        updates.enableMorningNotification = true;
        updates.morningNotificationTime = '08:00';
        break;
      case 'disable_morning':
        updates.enableMorningNotification = false;
        break;
      case 'enable_evening':
        updates.enableEveningNotification = true;
        updates.eveningNotificationTime = '18:00';
        break;
      case 'disable_evening':
        updates.enableEveningNotification = false;
        break;
    }

    await this.userService.updateNotificationPreferences(userId, updates);
  }

  private async executeTool(userId: string, toolCall: any, originalMessage: string, conversationHistory?: string): Promise<string> {
    try {
      switch (toolCall.tool) {
        case 'sales':
          return await this.salesService.processMessage(userId, originalMessage, conversationHistory);
        case 'finance':
          return await this.financeService.processMessage(userId, originalMessage, conversationHistory);
        default:
          return '';
      }
    } catch (error) {
      log.error('Tool execution failed', error, { tool: toolCall.tool });
      return `Had trouble with ${toolCall.tool} - please try again.`;
    }
  }
}