// ===============================
// src/lib/services/confirmation.service.ts - Typed Confirmation Service
// ===============================
import { redisManager } from '@/lib/redis/client';

export interface PendingConfirmation {
  type: 'duplicate_detected' | 'transaction_duplicate';
  proposedLead?: {
    name: string;
    phone?: string;
    contacted?: boolean;
    replied?: boolean;
    interested?: boolean;
    status?: string;
    nextStep?: string;
    nextFollowup?: string;
    notes?: string;
  };
  proposedTransaction?: {
    description: string;
    amount: number;
    category: string;
    babylonPrinciple?: string;
    date?: string;
  };
  duplicateCheck: {
    result: 'DUPLICATE' | 'UNIQUE';
    confidence: number;
    reasoning: string;
    matchedLead?: string | null;
    matchedTransaction?: string | null;
  };
  similarLeads?: Array<{
    id: string;
    name: string;
    phone: string | null;
    status: string;
    createdAt: Date;
  }>;
  similarTransactions?: Array<{
    id: string;
    description: string;
    amount: number;
    category: string;
    createdAt: Date;
  }>;
  timestamp: number;
}

export class ConfirmationService {
  private static getKey(userId: string, type: 'sales' | 'finance'): string {
    return `confirmation:${userId}:${type}`;
  }

  static async storePendingConfirmation(
    userId: string, 
    type: 'sales' | 'finance',
    confirmation: Omit<PendingConfirmation, 'timestamp'>
  ): Promise<void> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId, type);
    const data = JSON.stringify({
      ...confirmation,
      timestamp: Date.now()
    });
    
    await redis.setEx(key, 300, data); // 5 minutes
  }

  static async getPendingConfirmation(
    userId: string, 
    type: 'sales' | 'finance'
  ): Promise<PendingConfirmation | null> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId, type);
    const data = await redis.get(key);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data) as PendingConfirmation;
    } catch (error) {
      console.error('Failed to parse confirmation data:', error);
      await this.clearPendingConfirmation(userId, type);
      return null;
    }
  }

  static async clearPendingConfirmation(
    userId: string, 
    type: 'sales' | 'finance'
  ): Promise<void> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId, type);
    await redis.del(key);
  }

  static async hasPendingConfirmation(
    userId: string, 
    type: 'sales' | 'finance'
  ): Promise<boolean> {
    const redis = await redisManager.getClient();
    const key = this.getKey(userId, type);
    const exists = await redis.exists(key);
    return exists === 1;
  }
}
