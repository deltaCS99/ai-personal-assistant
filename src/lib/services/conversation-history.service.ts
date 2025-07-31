// ===============================
// src/lib/services/conversation-history.service.ts
// ===============================
import { redisManager } from '@/lib/redis/client';
import { formatDistanceToNow, subMinutes } from 'date-fns';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: 'sales' | 'finance' | 'general';
}

export interface ConversationHistory {
  messages: ConversationMessage[];
  lastActivity: number;
  messageCount: number;
}

export class ConversationHistoryService {
  private static readonly MAX_MESSAGES = 20; // Keep last 20 messages (10 exchanges)
  private static readonly TTL_SECONDS = 7200; // 2 hours
  
  private static getKey(userId: string): string {
    return `conversation:${userId}`;
  }

  /**
   * Add a new message to conversation history
   */
  static async addMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    context?: 'sales' | 'finance' | 'general'
  ): Promise<void> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId);
    
    try {
      // Get existing history
      const existingData = await redis.get(key);
      let history: ConversationHistory;
      
      if (existingData) {
        history = JSON.parse(existingData);
      } else {
        history = {
          messages: [],
          lastActivity: Date.now(),
          messageCount: 0
        };
      }
      
      // Add new message
      const newMessage: ConversationMessage = {
        role,
        content,
        timestamp: Date.now(),
        context
      };
      
      history.messages.push(newMessage);
      history.lastActivity = Date.now();
      history.messageCount++;
      
      // Keep only the last MAX_MESSAGES
      if (history.messages.length > this.MAX_MESSAGES) {
        history.messages = history.messages.slice(-this.MAX_MESSAGES);
      }
      
      // Store back to Redis with TTL
      await redis.setEx(key, this.TTL_SECONDS, JSON.stringify(history));
      
    } catch (error) {
      console.error('Failed to add conversation message:', error);
      // Don't throw - conversation history is nice-to-have, not critical
    }
  }

  /**
   * Get conversation history for context
   */
  static async getHistory(userId: string): Promise<ConversationHistory | null> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId);
    
    try {
      const data = await redis.get(key);
      if (!data) return null;
      
      const history = JSON.parse(data) as ConversationHistory;
      
      // Extend TTL on access (user is active)
      await redis.expire(key, this.TTL_SECONDS);
      
      return history;
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return null;
    }
  }

  /**
   * Get recent messages formatted for AI context
   */
  static async getContextMessages(userId: string, count: number = 10): Promise<string> {
    const history = await this.getHistory(userId);
    
    if (!history || history.messages.length === 0) {
      return "No recent conversation history.";
    }
    
    // Get last 'count' messages
    const recentMessages = history.messages.slice(-count);
    
    let context = "RECENT CONVERSATION HISTORY:\n";
    
    recentMessages.forEach((msg, index) => {
      const timeAgo = this.getTimeAgo(msg.timestamp);
      const contextTag = msg.context ? ` [${msg.context}]` : '';
      context += `${msg.role.toUpperCase()}${contextTag} (${timeAgo}): ${msg.content}\n`;
    });
    
    return context + "\n";
  }

  /**
   * Get conversation statistics for insights
   */
  static async getStats(userId: string): Promise<{
    totalMessages: number;
    lastActivity: Date | null;
    averageResponseTime?: number;
    contextBreakdown: Record<string, number>;
  } | null> {
    const history = await this.getHistory(userId);
    
    if (!history) return null;
    
    const contextBreakdown: Record<string, number> = {};
    
    history.messages.forEach(msg => {
      const context = msg.context || 'general';
      contextBreakdown[context] = (contextBreakdown[context] || 0) + 1;
    });
    
    return {
      totalMessages: history.messageCount,
      lastActivity: new Date(history.lastActivity),
      contextBreakdown
    };
  }

  /**
   * Clear conversation history (for privacy/reset)
   */
  static async clearHistory(userId: string): Promise<void> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId);
    await redis.del(key);
  }

  /**
   * Check if user has been active recently
   */
  static async isRecentlyActive(userId: string, withinMinutes: number = 30): Promise<boolean> {
    const history = await this.getHistory(userId);
    
    if (!history) return false;
    
    const cutoff = subMinutes(new Date(), withinMinutes);
    return history.lastActivity > cutoff.getTime();
  }

  /**
   * Get conversation context summary for AI
   */
  static async getContextSummary(userId: string): Promise<string> {
    const [history, stats] = await Promise.all([
      this.getHistory(userId),
      this.getStats(userId)
    ]);
    
    if (!history || !stats) {
      return "New conversation - no history available.";
    }
    
    const isActive = await this.isRecentlyActive(userId, 30);
    const lastActivityText = this.getTimeAgo(history.lastActivity);
    
    let summary = `CONVERSATION CONTEXT:\n`;
    summary += `- Total messages: ${stats.totalMessages}\n`;
    summary += `- Last active: ${lastActivityText}\n`;
    summary += `- Currently active: ${isActive ? 'Yes' : 'No'}\n`;
    
    if (Object.keys(stats.contextBreakdown).length > 0) {
      summary += `- Discussion topics: ${Object.entries(stats.contextBreakdown)
        .map(([context, count]) => `${context}(${count})`)
        .join(', ')}\n`;
    }
    
    return summary + "\n";
  }

  private static getTimeAgo(timestamp: number): string {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  }
}