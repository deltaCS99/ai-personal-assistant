// src/lib/services/base-ai.service.ts - UPDATED WITH CORRECT RETURN TYPES
import { AIProviderFactory } from '@/lib/ai/providers/factory';
import { ContextDetectorService, EntityContext } from './context-detector.service';
import { log } from '@/lib/logger';

export abstract class BaseAIService {
  protected readonly aiProvider = AIProviderFactory.createFromEnv();
  private readonly contextDetector = new ContextDetectorService();
  private readonly maxRetries = 2;
  private readonly retryDelay = 1000; // 1 second

  protected getProviderName(): string {
    const provider = this.aiProvider.constructor.name;
    if (provider.includes('Gemini')) return 'gemini';
    if (provider.includes('Claude')) return 'claude';
    if (provider.includes('OpenAI') || provider.includes('GPT')) return 'openai';
    if (provider.includes('Foundry')) return 'azure-foundry';
    return 'gemini';
  }

  // 🎯 UPDATED: Now returns structured data instead of string
  protected async processMessageWithContext(
    userId: string,
    message: string,
    conversationHistory?: string
  ): Promise<any> {
    try {
      // Step 1: AI-driven context detection (fast, cheap call)
      const entityContext = await this.contextDetector.detectAndRetrieveContext(userId, message);

      // Step 2: Process with enhanced context if needed
      if (entityContext.type !== 'none') {
        log.info('Context detected and retrieved', {
          userId: userId.substring(0, 8),
          entityType: entityContext.type,
          entityName: entityContext.entityName
        });

        // Pass conversation history to enhanced context processing
        return await this.processWithEnhancedContext(userId, message, entityContext, conversationHistory);
      } else {
        // Normal processing without entity context but with conversation history
        log.info('No entity context needed, processing normally', { userId: userId.substring(0, 8) });
        return await this.processNormalMessage(userId, message, conversationHistory);
      }
    } catch (error) {
      log.error('Context-aware message processing failed, falling back to normal processing', {
        error,
        userId: userId.substring(0, 8)
      });
      // Graceful fallback to normal processing with conversation history
      return await this.processNormalMessage(userId, message, conversationHistory);
    }
  }

  // 🎯 UPDATED: Now returns structured data (any) instead of string
  protected abstract processWithEnhancedContext(
    userId: string,
    message: string,
    entityContext: EntityContext,
    conversationHistory?: string
  ): Promise<any>;

  // 🎯 UPDATED: Now returns structured data (any) instead of string  
  protected abstract processNormalMessage(
    userId: string,
    message: string,
    conversationHistory?: string
  ): Promise<any>;

  // 🎯 Main process message method still returns string (the final response text)
  abstract processMessage(userId: string, message: string, conversationHistory?: string): Promise<string>;

  protected async processAIRequest<T>(
    prompt: string,
    message: string,
    schema: any,
    userId: string,
    serviceType: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        log.info(`Processing ${serviceType} message (attempt ${attempt})`, {
          userId: userId.substring(0, 8)
        });

        const aiResponse = await this.aiProvider.generateResponse(prompt, message);
        const parsedResponse = JSON.parse(aiResponse);
        const validatedData = schema.parse(parsedResponse);

        log.info(`${serviceType} message processed successfully`, {
          userId: userId.substring(0, 8),
          action: validatedData.action,
          attempt
        });

        return validatedData;

      } catch (error: any) {
        lastError = error;

        // Check if this is a retryable error
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          log.warn(`${serviceType} attempt ${attempt} failed, retrying...`, {
            userId: userId.substring(0, 8),
            error: error.message,
            nextAttempt: attempt + 1
          });

          // Wait before retrying
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        // If we get here, all retries failed or error is not retryable
        log.error(`${serviceType} service error after ${attempt} attempts`, error);
        throw error;
      }
    }

    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';

    // Retryable errors
    return (
      errorMessage.includes('503') ||           // Service unavailable
      errorMessage.includes('502') ||           // Bad gateway
      errorMessage.includes('429') ||           // Rate limited
      errorMessage.includes('overloaded') ||    // Model overloaded
      errorMessage.includes('timeout') ||       // Timeout
      errorMessage.includes('network') ||       // Network issues
      errorMessage.includes('unavailable')      // Service unavailable
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected logError(error: any, context: string, userId?: string): string {
    log.error(`${context} error`, error, userId ? { userId } : {});
    return this.getFriendlyErrorMessage(error, context);
  }

  private getFriendlyErrorMessage(error: any, context: string): string {
    const errorMessage = error.message?.toLowerCase() || '';

    // Specific error handling for different scenarios
    if (errorMessage.includes('503') || errorMessage.includes('overloaded')) {
      return this.getOverloadedMessage(context);
    }

    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return this.getRateLimitMessage(context);
    }

    if (errorMessage.includes('timeout')) {
      return this.getTimeoutMessage(context);
    }

    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return this.getNetworkMessage(context);
    }

    // Generic friendly message
    return this.getGenericMessage(context);
  }

  private getOverloadedMessage(context: string): string {
    const messages = [
      "🤖 Oops! My AI brain is having a traffic jam right now. Even robots need coffee breaks! ☕ Try again in a moment?",
      "🚦 The AI highway is a bit congested! I'm stuck in digital traffic. Give me a sec to find a faster route! 🛣️",
      "🎪 Wow, I'm more popular than a free pizza stand! The AI circus is packed. Let me juggle this in a moment! 🤹‍♂️",
      "🏃‍♂️ I'm running as fast as my circuits can carry me, but there's a queue! Like Black Friday for AI requests! 🛍️",
      "🤯 My AI buddy is pulling an all-nighter and needs a power nap. Even smart computers get tired! 😴"
    ];

    return this.getRandomMessage(messages);
  }

  private getRateLimitMessage(context: string): string {
    const messages = [
      "⏱️ Whoa there, speed racer! I'm hitting my daily AI quota. Let's take a breather! 🏎️",
      "🚨 Rate limit police caught me! I need to slow down before I get a digital speeding ticket! 👮‍♀️",
      "🎢 I've been on the AI rollercoaster too much today! Need to get off and wait in line again! 🎠",
      "📈 I'm more popular than I thought! Hit my request limit. Success is exhausting! 💪",
      "⏰ Even I have office hours! Looks like I need to clock out for a minute. Union rules! 👔"
    ];

    return this.getRandomMessage(messages);
  }

  private getTimeoutMessage(context: string): string {
    const messages = [
      "⏰ I got lost in thought for too long! My AI brain went on a philosophical journey. Let me refocus! 🧠",
      "🐌 Sorry, I was being extra thorough - like checking my work 47 times! Let's try again! ✨",
      "💭 I was daydreaming about electric sheep! Happens to the best of us AIs. Ready to focus now! 🐑",
      "⏳ Time got away from me! I was probably calculating the meaning of life (it's still 42, btw). 🤖",
      "🕰️ Oops, I took a scenic route through the data! Back on track now, ready for round two! 🗺️"
    ];

    return this.getRandomMessage(messages);
  }

  private getNetworkMessage(context: string): string {
    const messages = [
      "📡 My wifi is having mood swings! Even AI assistants have connectivity issues. 📶",
      "🌐 The internet gremlins are at it again! They're probably reorganizing the cables. 🔌",
      "📡 I'm playing digital hide and seek with the servers! Ready or not, here I come! 🎮",
      "🛰️ Houston, we have a connection problem! But don't worry, I'm not floating away! 🚀",
      "🔗 My connection is more unstable than my emotions after watching a sad movie! 🎬"
    ];

    return this.getRandomMessage(messages);
  }

  private getGenericMessage(context: string): string {
    const messages = [
      "🤖 Something went sideways in my digital brain! Let me shake off the static and try again! ⚡",
      "🎯 I missed the mark there! Even AI assistants have off days. Ready for another shot! 🏹",
      "🔧 My circuits got a bit tangled! Time for some digital stretching exercises. Give me a moment! 🤸‍♂️",
      "🎪 Well, that was an unexpected plot twist! Let me reread the script and try again! 📜",
      "🎲 That was a critical fail on my AI dice roll! Rolling again with better luck! 🍀"
    ];

    return this.getRandomMessage(messages);
  }

  private getRandomMessage(messages: string[]): string {
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }
}