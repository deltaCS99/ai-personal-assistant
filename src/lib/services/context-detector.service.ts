// ===============================
// 2. NEW: src/lib/services/context-detector.service.ts
// ===============================
import { prisma } from '@/lib/database/client';
import { BaseAIService } from './base-ai.service';
import { AIProviderFactory } from '../ai/providers/factory';
import { z } from 'zod';
import { log } from '../logger';

const ContextDetectionSchema = z.object({
  needsContext: z.boolean(),
  entityType: z.enum(['lead', 'account', 'none']),
  entityName: z.string(),
  reason: z.string()
});

export interface EntityContext {
  type: 'lead' | 'account' | 'none';
  entityName: string;
  context: string;
}

export class ContextDetectorService {
  private readonly provider = AIProviderFactory.createContextDetectionProvider();
  
  // 🎯 Main entry point - AI-driven context detection
  async detectAndRetrieveContext(userId: string, message: string): Promise<EntityContext> {
    try {
      // Step 1: Let AI decide if context is needed
      const prompt = `
        You are a context detection AI. Analyze the user message and determine if it mentions specific leads or accounts that would need database context.

        Return ONLY valid JSON in this exact format:
        {
          "needsContext": true/false,
          "entityType": "lead|account|none",
          "entityName": "exact name mentioned (empty if none)",
          "reason": "why context is needed or not needed"
        }

        NEEDS CONTEXT when message mentions:
        - Specific business/person names (e.g., "Black Rose Guest House", "John Smith")  
        - Account names (e.g., "car fund", "savings account", "emergency fund")
        - Draft/message requests for specific entities
        - Questions about specific leads/accounts

        DOESN'T NEED CONTEXT for:
        - General questions or advice
        - Progress reports or summaries
        - Generic financial/sales advice
        - New transactions without specific account mention

        Return ONLY the JSON structure, no other text.
      `;

      const response = await this.provider.generateResponse(prompt, message);
      
      // Parse the JSON response
      const detection = JSON.parse(response);
      
      // Validate with Zod
      const validatedDetection = ContextDetectionSchema.parse(detection);

      if (!validatedDetection.needsContext || validatedDetection.entityType === 'none') {
        return { type: 'none', entityName: '', context: '' };
      }

      // Step 2: Retrieve actual context from database
      const context = await this.retrieveEntityContext(
        userId, 
        validatedDetection.entityType, 
        validatedDetection.entityName
      );

      return {
        type: validatedDetection.entityType,
        entityName: validatedDetection.entityName,
        context
      };

    } catch (error) {
      log.error('Context detection failed', { error, userId, message });
      return { type: 'none', entityName: '', context: '' };
    }
  }

  // 🎯 Simple database context retrieval
  private async retrieveEntityContext(userId: string, entityType: 'lead' | 'account', entityName: string): Promise<string> {
    try {
      if (entityType === 'lead') {
        return await this.getLeadContext(userId, entityName);
      } else if (entityType === 'account') {
        return await this.getAccountContext(userId, entityName);
      }
      return '';
    } catch (error) {
      log.error('Entity context retrieval failed', { error, userId, entityType, entityName });
      return '';
    }
  }

  private async getLeadContext(userId: string, leadName: string): Promise<string> {
    // Simple name matching - let AI handle fuzzy matching
    const leads = await prisma.lead.findMany({
      where: {
        userId,
        name: { 
          contains: leadName, 
          mode: 'insensitive' 
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 3
    });

    if (leads.length === 0) {
      // Try partial word matching
      const words = leadName.toLowerCase().split(' ');
      const lead = await prisma.lead.findFirst({
        where: {
          userId,
          OR: words.map(word => ({
            name: { contains: word, mode: 'insensitive' }
          }))
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (!lead) return `No lead found matching "${leadName}".`;
      leads.push(lead);
    }

    const lead = leads[0];
    let context = `LEAD CONTEXT FOR "${lead.name}":\n`;
    context += `- Status: ${lead.status}\n`;
    context += `- Created: ${lead.createdAt.toLocaleDateString()}\n`;
    context += `- Last Updated: ${lead.updatedAt.toLocaleDateString()}\n`;
    
    if (lead.phone) context += `- Phone: ${lead.phone}\n`;
    if (lead.contacted) context += `- Has been contacted: Yes\n`;
    if (lead.replied) context += `- Has replied: Yes\n`;
    if (lead.interested) context += `- Showed interest: Yes\n`;
    if (lead.nextFollowup) {
      const followupDate = new Date(lead.nextFollowup);
      const isOverdue = followupDate < new Date();
      context += `- Next follow-up: ${followupDate.toLocaleDateString()} ${isOverdue ? '(OVERDUE)' : ''}\n`;
    }
    if (lead.nextStep) context += `- Next step: ${lead.nextStep}\n`;
    if (lead.notes) context += `- Notes: ${lead.notes}\n`;

    // Add recent activity context
    const daysSinceUpdate = Math.floor((Date.now() - lead.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    context += `- Last activity: ${daysSinceUpdate} days ago\n`;

    return context;
  }

  private async getAccountContext(userId: string, accountName: string): Promise<string> {
    const accounts = await prisma.account.findMany({
      where: {
        userId,
        name: { 
          contains: accountName, 
          mode: 'insensitive' 
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 3
    });

    if (accounts.length === 0) {
      return `No account found matching "${accountName}".`;
    }

    const account = accounts[0];
    let context = `ACCOUNT CONTEXT FOR "${account.name}":\n`;
    context += `- Type: ${account.type}\n`;
    context += `- Current Balance: R${account.currentBalance.toLocaleString()}\n`;
    
    if (account.targetAmount) {
      const progress = Math.round((account.currentBalance / account.targetAmount) * 100);
      const remaining = account.targetAmount - account.currentBalance;
      context += `- Goal: R${account.targetAmount.toLocaleString()}\n`;
      context += `- Progress: ${progress}% (R${remaining.toLocaleString()} remaining)\n`;
    }
    
    context += `- Created: ${account.createdAt.toLocaleDateString()}\n`;
    context += `- Last Updated: ${account.updatedAt.toLocaleDateString()}\n`;

    // Get recent related transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          { description: { contains: account.name, mode: 'insensitive' } },
          { category: account.type === 'Emergency Fund' ? 'Savings' : 'Investment' }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    if (recentTransactions.length > 0) {
      context += `- Recent activity:\n`;
      recentTransactions.forEach(tx => {
        context += `  • ${tx.createdAt.toLocaleDateString()}: ${tx.description} R${tx.amount}\n`;
      });
    }

    return context;
  }
}