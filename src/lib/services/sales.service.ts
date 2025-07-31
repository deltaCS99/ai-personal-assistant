import { prisma } from '@/lib/database/client';
import { LeadUpdate, LeadUpdateSchema } from '@/lib/types/sales';
import { DuplicateDetection, DuplicateDetectionSchema, ProgressReport, ProgressReportSchema } from '@/lib/types/common';
import { PromptFactory } from '@/lib/ai/prompts/factory';
import { BaseAIService } from './base-ai.service';
import { ConfirmationService, PendingConfirmation } from './confirmation.service';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow, subDays, subWeeks, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { log } from '../logger';
import z from 'zod';
import { EntityContext } from './context-detector.service';

interface ProgressData {
  overview: {
    totalLeads: number;
    leadsThisWeek: number;
    leadsThisMonth: number;
    leadsLast3Months: number;
    growthRate: number;
  };
  statusBreakdown: Array<{
    status: string;
    _count: { status: number };
  }>;
  conversionMetrics: {
    contactedRate: number;
    replyRate: number;
    interestRate: number;
    winRate: number;
  };
  activityMetrics: {
    updatesThisWeek: number;
    followupsScheduled: number;
    overdueFollowups: number;
    activityScore: number;
  };
  followupHealth: {
    totalActiveLeads: number;
    leadsWithFollowups: number;
    followupCoverage: number;
  };
  recentWins: number;
  pipelineValue: {
    interested: number;
    proposals: number;
    negotiations: number;
    estimatedValue: number;
  };
  timeframe: {
    analyzed: string;
    period: string;
  };
}

export class SalesService extends BaseAIService {
  async processMessage(userId: string, message: string, conversationHistory?: string): Promise<string> {
    try {
      // Check if this is a confirmation response first
      if (this.isConfirmationMessage(message)) {
        return await this.handleConfirmation(userId, message);
      }

      // 🎯 NEW: Use context-aware processing
      return await this.processMessageWithContext(userId, message, conversationHistory);
    } catch (error) {
      return this.logError(error, 'Sales', userId);
    }
  }

  protected async processWithEnhancedContext(
    userId: string,
    message: string,
    entityContext: EntityContext,
    conversationHistory?: string
  ): Promise<string> {
    try {
      // Get existing sales context
      const userSalesContext = await this.getUserSalesContext(userId);

      // Add retrieved entity context
      let contextualInfo = `\n\n=== RETRIEVED CONTEXT ===\n${entityContext.context}\n=== END CONTEXT ===\n`;

      if (conversationHistory) {
        contextualInfo = `\n\n=== CONVERSATION HISTORY ===\n${conversationHistory}\n${contextualInfo}`;
      }

      // Build enhanced prompt
      const prompt = PromptFactory.getSalesPrompt(this.getProviderName()) + userSalesContext + contextualInfo;

      // Process with enhanced context
      const leadUpdate = await this.processAIRequest<LeadUpdate>(
        prompt,
        message,
        LeadUpdateSchema,
        userId,
        'SalesWithContext'
      );

      const result = await this.processLeadUpdate(userId, leadUpdate, message);
      return this.formatResponse(result, leadUpdate, message);

    } catch (error) {
      log.error('Enhanced context processing failed, falling back', { error, userId: userId.substring(0, 8) });
      // Fallback to normal processing
      return await this.processNormalMessage(userId, message, conversationHistory);
    }
  }

  protected async processNormalMessage(
    userId: string,
    message: string,
    conversationHistory?: string
  ): Promise<string> {
    const userSalesContext = await this.getUserSalesContext(userId);
    let prompt = PromptFactory.getSalesPrompt(this.getProviderName()) + userSalesContext;

    if (conversationHistory) {
      prompt += `\n\n=== CONVERSATION HISTORY ===\n${conversationHistory}\n=== END HISTORY ===\n`;
    }

    const leadUpdate = await this.processAIRequest<LeadUpdate>(
      prompt,
      message,
      LeadUpdateSchema,
      userId,
      'Sales'
    );

    const result = await this.processLeadUpdate(userId, leadUpdate, message);
    return this.formatResponse(result, leadUpdate, message);
  }

  private isConfirmationMessage(message: string): boolean {
    const confirmationPatterns = [
      /^(yes|y|confirm|create new|new lead)$/i,
      /^(no|n|cancel|abort)$/i,
      /^(update|use existing|\d+)$/i,
      /^(show|details|info)\s*(\d+)?$/i
    ];

    return confirmationPatterns.some(pattern => pattern.test(message.trim()));
  }

  private async handleConfirmation(userId: string, message: string): Promise<string> {
    const pendingConfirmation = await ConfirmationService.getPendingConfirmation(userId, 'sales');

    if (!pendingConfirmation) {
      return "I don't have any pending confirmations. What would you like to do?";
    }

    const cleanMessage = message.trim().toLowerCase();

    if (cleanMessage.match(/^(yes|y|confirm|create new|new lead)$/)) {
      return await this.executePendingAction(userId, 'create_new', pendingConfirmation);
    } else if (cleanMessage.match(/^(update|use existing|\d+)$/)) {
      const match = cleanMessage.match(/\d+/);
      const targetIndex = match ? parseInt(match[0]) - 1 : 0;
      return await this.executePendingAction(userId, 'update_existing', pendingConfirmation, targetIndex);
    } else if (cleanMessage.match(/^(show|details|info)/)) {
      const match = cleanMessage.match(/\d+/);
      const targetIndex = match ? parseInt(match[0]) - 1 : 0;
      return await this.showLeadDetails(userId, pendingConfirmation, targetIndex);
    } else {
      await ConfirmationService.clearPendingConfirmation(userId, 'sales');
      return "👍 Cancelled. What else can I help you with?";
    }
  }

  private async getUserSalesContext(userId: string): Promise<string> {
    const [totalLeads, statusCounts, todayFollowups, overdueFollowups, existingLeads, recentActivity] = await Promise.all([
      prisma.lead.count({ where: { userId } }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: {
            lt: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.lead.findMany({
        where: { userId },
        select: { name: true, phone: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 20
      }),
      this.getRecentActivity(userId)
    ]);

    let context = `\n\nUSER SALES CONTEXT:`;
    context += `\nTOTAL LEADS: ${totalLeads}`;
    context += `\nTODAY'S FOLLOW-UPS: ${todayFollowups}`;
    context += `\nOVERDUE FOLLOW-UPS: ${overdueFollowups}`;

    if (statusCounts.length > 0) {
      context += `\nLEADS BY STATUS:`;
      statusCounts.forEach(status => {
        context += `\n- ${status.status}: ${status._count.status}`;
      });
    }

    if (recentActivity.totalActivity > 0) {
      context += `\nRECENT ACTIVITY (7 days):`;
      context += `\n- Leads created: ${recentActivity.leadsCreated}`;
      context += `\n- Leads updated: ${recentActivity.leadsUpdated}`;
      context += `\n- Follow-ups completed: ${recentActivity.followupsCompleted}`;
    }

    if (existingLeads.length > 0) {
      context += `\n\nEXISTING LEADS (for duplicate detection):`;
      existingLeads.forEach(lead => {
        context += `\n- ${lead.name}${lead.phone ? ` (${lead.phone})` : ''} - ${lead.status}`;
      });
    }

    return context;
  }

  private async getRecentActivity(userId: string) {
    const sevenDaysAgo = subDays(new Date(), 7);

    const [leadsCreated, leadsUpdated, followupsCompleted] = await Promise.all([
      prisma.lead.count({
        where: {
          userId,
          createdAt: { gte: sevenDaysAgo }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          updatedAt: { gte: sevenDaysAgo },
          createdAt: { lt: sevenDaysAgo }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: {
            gte: sevenDaysAgo,
            lt: new Date()
          }
        }
      })
    ]);

    return {
      leadsCreated,
      leadsUpdated,
      followupsCompleted,
      totalActivity: leadsCreated + leadsUpdated + followupsCompleted
    };
  }

  private async processLeadUpdate(userId: string, update: LeadUpdate, originalMessage: string) {
    const { action, contactName, updates } = update;

    switch (action) {
      case 'create':
        return this.createLead(userId, contactName!, updates);
      case 'update':
        return this.updateLead(userId, contactName!, updates);
      case 'view':
        return this.viewLead(userId, contactName!);
      case 'query':
        return this.queryLeads(userId, originalMessage);
      case 'summary':
        return this.getSummary(userId);
      case 'delete':
        return this.deleteLead(userId, contactName!);
      case 'conversation':
        return this.handleConversation(userId, update, originalMessage);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async handleConversation(userId: string, update: LeadUpdate, originalMessage: string) {
    const progressPrompt = `
Analyze this user message and determine if they are asking for a GENERAL sales progress report or performance analysis.

User message: "${originalMessage}"

Return JSON:
{
  "isProgressRequest": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "why this is or isn't a progress request"
}

ONLY return true for GENERAL progress requests like:
- "How am I doing with sales?"
- "Show me my performance" 
- "Give me a progress report"
- "How's my pipeline performing?"
- "What are my conversion rates?"
- "Show me my sales metrics"

NEVER return true if the message:
- Mentions specific names (like "Maryna", "John", "ABC Corp")
- Contains "should we" or "should I" about specific actions
- Asks about marking leads as lost/won
- Is about individual lead management
- Contains "check on [name]" or similar

The message "${originalMessage}" mentions specific leads or actions, so be very careful.
Return false unless it's clearly asking for OVERALL performance metrics.
`;

    try {
      const progressAnalysis = await this.processAIRequest<{
        isProgressRequest: boolean;
        confidence: number;
        reasoning: string;
      }>(
        progressPrompt,
        '',
        z.object({
          isProgressRequest: z.boolean(),
          confidence: z.number().min(0).max(1),
          reasoning: z.string()
        }),
        userId,
        'ProgressDetection'
      );

      // If AI is confident this is a progress request, generate report
      if (progressAnalysis.isProgressRequest && progressAnalysis.confidence > 0.95) {
        return await this.generateProgressReport(userId);
      }
    } catch (error) {
      log.warn('Progress detection failed, continuing with normal conversation', { error, userId });
    }

    // Normal conversation flow
    const [summary, todayActivity] = await Promise.all([
      this.getSummary(userId),
      this.getTodayActivity(userId)
    ]);

    return {
      action: 'conversation',
      response: update.contextualOpening || "I'm here to help with your sales!",
      context: 'sales',
      userData: {
        totalLeads: summary.total,
        todayFollowups: summary.todayFollowups,
        overdueFollowups: summary.overdueFollowups,
        hasActiveLeads: summary.total > 0,
        statusCounts: summary.byStatus,
        todayActivity: todayActivity
      }
    };
  }

  private async generateProgressReport(userId: string) {
    const progressData = await this.gatherProgressData(userId);

    const prompt = PromptFactory.getSalesProgressPrompt(this.getProviderName());
    const context = JSON.stringify(progressData, null, 2);

    try {
      const report = await this.processAIRequest<ProgressReport>(
        prompt,
        context,
        ProgressReportSchema,
        userId,
        'SalesProgress'
      );

      return {
        action: 'progress_report',
        report,
        rawData: progressData
      };
    } catch (error) {
      log.error('AI progress report generation failed', { error, userId });
      return {
        action: 'progress_report',
        report: this.generateBasicProgressReport(progressData),
        rawData: progressData
      };
    }
  }

  private async gatherProgressData(userId: string): Promise<ProgressData> {
    const now = new Date();
    const lastWeek = subWeeks(now, 1);
    const lastMonth = subMonths(now, 1);
    const last3Months = subMonths(now, 3);

    const [
      totalLeads,
      leadsThisWeek,
      leadsThisMonth,
      leadsLast3Months,
      statusBreakdown,
      conversionMetrics,
      activityMetrics,
      followupHealth,
      recentWins,
      pipelineValue
    ] = await Promise.all([
      prisma.lead.count({ where: { userId } }),
      prisma.lead.count({ where: { userId, createdAt: { gte: lastWeek } } }),
      prisma.lead.count({ where: { userId, createdAt: { gte: lastMonth } } }),
      prisma.lead.count({ where: { userId, createdAt: { gte: last3Months } } }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true }
      }),
      this.calculateConversionMetrics(userId),
      this.calculateActivityMetrics(userId),
      this.calculateFollowupHealth(userId),
      prisma.lead.count({
        where: {
          userId,
          status: 'Closed - Won',
          updatedAt: { gte: lastMonth }
        }
      }),
      this.estimatePipelineValue(userId)
    ]);

    return {
      overview: {
        totalLeads,
        leadsThisWeek,
        leadsThisMonth,
        leadsLast3Months,
        growthRate: this.calculateGrowthRate(leadsThisMonth, leadsLast3Months)
      },
      statusBreakdown,
      conversionMetrics,
      activityMetrics,
      followupHealth,
      recentWins,
      pipelineValue,
      timeframe: {
        analyzed: format(now, 'yyyy-MM-dd'),
        period: '3 months'
      }
    };
  }

  private async calculateConversionMetrics(userId: string) {
    const totalLeads = await prisma.lead.count({ where: { userId } });

    if (totalLeads === 0) {
      return { contactedRate: 0, replyRate: 0, interestRate: 0, winRate: 0 };
    }

    const [contacted, replied, interested, won] = await Promise.all([
      prisma.lead.count({ where: { userId, contacted: true } }),
      prisma.lead.count({ where: { userId, replied: true } }),
      prisma.lead.count({ where: { userId, interested: true } }),
      prisma.lead.count({ where: { userId, status: 'Closed - Won' } })
    ]);

    return {
      contactedRate: Math.round((contacted / totalLeads) * 100),
      replyRate: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
      interestRate: replied > 0 ? Math.round((interested / replied) * 100) : 0,
      winRate: interested > 0 ? Math.round((won / interested) * 100) : 0
    };
  }

  private async calculateActivityMetrics(userId: string) {
    const lastWeek = subWeeks(new Date(), 1);

    const [updatesThisWeek, followupsScheduled, overdueFollowups] = await Promise.all([
      prisma.lead.count({
        where: {
          userId,
          updatedAt: { gte: lastWeek }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: { gte: new Date() }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: { lt: new Date() }
        }
      })
    ]);

    return {
      updatesThisWeek,
      followupsScheduled,
      overdueFollowups,
      activityScore: this.calculateActivityScore(updatesThisWeek, followupsScheduled, overdueFollowups)
    };
  }

  private calculateActivityScore(updates: number, scheduled: number, overdue: number): number {
    const baseScore = updates + scheduled;
    const penalty = overdue * 2;
    return Math.max(0, baseScore - penalty);
  }

  private async calculateFollowupHealth(userId: string) {
    const totalLeads = await prisma.lead.count({
      where: {
        userId,
        status: { notIn: ['Closed - Won', 'Closed - Lost'] }
      }
    });

    const leadsWithFollowups = await prisma.lead.count({
      where: {
        userId,
        nextFollowup: { not: null },
        status: { notIn: ['Closed - Won', 'Closed - Lost'] }
      }
    });

    return {
      totalActiveLeads: totalLeads,
      leadsWithFollowups,
      followupCoverage: totalLeads > 0 ? Math.round((leadsWithFollowups / totalLeads) * 100) : 0
    };
  }

  private async estimatePipelineValue(userId: string) {
    const [interested, proposals, negotiations] = await Promise.all([
      prisma.lead.count({ where: { userId, status: 'Interested' } }),
      prisma.lead.count({ where: { userId, status: 'Proposal Sent' } }),
      prisma.lead.count({ where: { userId, status: 'Waiting' } })
    ]);

    const estimatedValue = (interested * 1000 * 0.3) + (proposals * 1000 * 0.6) + (negotiations * 1000 * 0.8);

    return {
      interested,
      proposals,
      negotiations,
      estimatedValue: Math.round(estimatedValue)
    };
  }

  private calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private generateBasicProgressReport(data: ProgressData): ProgressReport {
    const insights: string[] = [];
    const recommendations: ProgressReport['recommendations'] = [];
    const trends: ProgressReport['trends'] = { positive: [], concerning: [], neutral: [] };

    // Generate basic insights
    if (data.overview.growthRate > 20) {
      insights.push(`Strong growth with ${data.overview.growthRate}% increase in new leads`);
      trends.positive.push('Lead generation is accelerating');
    } else if (data.overview.growthRate < -10) {
      insights.push(`Lead generation has slowed by ${Math.abs(data.overview.growthRate)}%`);
      trends.concerning.push('Declining lead acquisition');
      recommendations.push({
        action: 'Increase prospecting activities',
        priority: 'high',
        reason: 'Lead generation is below previous period',
        expectedImpact: 'Restore pipeline growth'
      });
    }

    if (data.conversionMetrics.winRate > 15) {
      trends.positive.push('High conversion rate to wins');
    } else if (data.conversionMetrics.winRate < 5) {
      trends.concerning.push('Low win rate needs improvement');
      recommendations.push({
        action: 'Review and improve sales process',
        priority: 'high',
        reason: 'Win rate is below optimal levels',
        expectedImpact: 'Increase deal closure rate'
      });
    }

    return {
      type: 'sales',
      summary: `Pipeline analysis shows ${data.overview.totalLeads} total leads with ${data.overview.growthRate}% growth rate`,
      metrics: data,
      insights,
      recommendations,
      trends,
      nextSteps: [
        'Focus on overdue follow-ups',
        'Maintain consistent prospecting',
        'Track conversion improvements'
      ]
    };
  }

  // 🎯 Duplicate detection with AI
  private async checkForDuplicate(userId: string, newLeadName: string, newLeadPhone?: string): Promise<DuplicateDetection> {
    const existingLeads = await prisma.lead.findMany({
      where: { userId },
      select: { name: true, phone: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 15
    });

    if (existingLeads.length === 0) {
      return {
        result: 'UNIQUE',
        confidence: 1.0,
        reasoning: 'No existing leads to compare against',
        matchedLead: null
      };
    }

    let context = `NEW LEAD TO CHECK:\n`;
    context += `Name: "${newLeadName}"\n`;
    if (newLeadPhone) context += `Phone: "${newLeadPhone}"\n`;

    context += `\nEXISTING LEADS:\n`;
    existingLeads.forEach((lead, index) => {
      context += `${index + 1}. "${lead.name}"`;
      if (lead.phone) context += ` - Phone: ${lead.phone}`;
      context += ` - Status: ${lead.status}\n`;
    });

    const prompt = PromptFactory.getSalesDuplicateDetectionPrompt(this.getProviderName());

    try {
      const detection = await this.processAIRequest<DuplicateDetection>(
        prompt,
        context,
        DuplicateDetectionSchema,
        userId,
        'SalesDuplicateDetection'
      );

      return detection;
    } catch (error) {
      log.error('Sales duplicate detection failed, defaulting to UNIQUE', { error, userId });
      return {
        result: 'UNIQUE',
        confidence: 0.5,
        reasoning: 'AI detection failed, assuming unique to be safe',
        matchedLead: null
      };
    }
  }

  private async createLead(userId: string, name: string, updates: LeadUpdate['updates'] = {}) {
    // First check for exact matches
    const exactMatch = await this.findExistingLead(userId, name, updates.phone);

    if (exactMatch) {
      const updatedLead = await prisma.lead.update({
        where: { id: exactMatch.id },
        data: {
          ...(updates.phone && { phone: updates.phone }),
          ...(updates.contacted !== undefined && { contacted: updates.contacted }),
          ...(updates.replied !== undefined && { replied: updates.replied }),
          ...(updates.interested !== undefined && { interested: updates.interested }),
          ...(updates.status && { status: updates.status }),
          ...(updates.nextStep && { nextStep: updates.nextStep }),
          ...(updates.nextFollowup && { nextFollowup: new Date(updates.nextFollowup) }),
          ...(updates.notes && {
            notes: exactMatch.notes
              ? `${exactMatch.notes}\n\n${updates.notes}`
              : updates.notes
          }),
        },
      });

      return { action: 'create', lead: updatedLead, wasExisting: true };
    }

    // AI duplicate detection
    const duplicateCheck = await this.checkForDuplicate(userId, name, updates.phone);

    if (duplicateCheck.result === 'DUPLICATE' && duplicateCheck.matchedLead) {
      const similarLeads = await this.findSimilarLeadsByName(userId, duplicateCheck.matchedLead);

      await ConfirmationService.storePendingConfirmation(userId, 'sales', {
        type: 'duplicate_detected',
        proposedLead: { name, ...updates },
        duplicateCheck,
        similarLeads
      });

      return {
        action: 'duplicate_confirmation',
        duplicateCheck,
        needsConfirmation: true,
        message: this.formatDuplicateConfirmation(duplicateCheck, { name, ...updates })
      };
    }

    // Create new lead
    const lead = await prisma.lead.create({
      data: {
        userId,
        name: this.cleanLeadName(name),
        phone: updates.phone || undefined,
        contacted: updates.contacted || false,
        replied: updates.replied || false,
        interested: updates.interested || false,
        status: updates.status || 'New',
        nextStep: updates.nextStep || undefined,
        nextFollowup: updates.nextFollowup ? new Date(updates.nextFollowup) : undefined,
        notes: updates.notes || undefined,
      },
    });

    return {
      action: 'create',
      lead,
      wasExisting: false,
      duplicateCheck
    };
  }

  private formatDuplicateConfirmation(duplicateCheck: DuplicateDetection, proposedLead: { name: string;[key: string]: any }): string {
    let message = `🤔 **Potential Duplicate Detected!**\n\n`;
    message += `I found a similar lead: **${duplicateCheck.matchedLead}**\n`;
    message += `📊 Confidence: ${Math.round(duplicateCheck.confidence * 100)}%\n`;
    message += `💭 Reasoning: ${duplicateCheck.reasoning}\n\n`;

    message += `**What you wanted to add:**\n`;
    message += `✨ **${proposedLead.name}**\n`;
    if (proposedLead.phone) message += `📞 ${proposedLead.phone}\n`;
    if (proposedLead.status) message += `📊 ${proposedLead.status}\n`;

    message += `\n**What would you like to do?**\n`;
    message += `• Reply **"yes"** - Create as new lead anyway\n`;
    message += `• Reply **"update"** - Update the existing lead instead\n`;
    message += `• Reply **"show"** - Show me more details about the existing lead\n`;
    message += `• Reply **"cancel"** - Cancel this action`;

    return message;
  }

  private async executePendingAction(
    userId: string,
    action: 'create_new' | 'update_existing',
    pendingConfirmation: PendingConfirmation,
    targetIndex?: number
  ): Promise<string> {
    try {
      const { proposedLead, similarLeads, duplicateCheck } = pendingConfirmation;

      if (!proposedLead) {
        return "❌ Invalid confirmation data. Please try again.";
      }

      if (action === 'create_new') {
        // ... existing create logic ...
      } else if (action === 'update_existing') {
        if (!similarLeads || similarLeads.length === 0) {
          return "❌ No similar leads found to update.";
        }

        const targetLead = similarLeads[targetIndex || 0];
        if (!targetLead) {
          return "❌ Could not find the lead to update. Please try again.";
        }

        const existingLead = await prisma.lead.findFirst({
          where: { userId, id: targetLead.id }
        });

        if (!existingLead) {
          return "❌ Lead no longer exists. Please try again.";
        }

        // 🎯 SMART NOTE APPENDING FOR DUPLICATES
        let updatedNotes = existingLead.notes;
        if (proposedLead.notes) {
          if (existingLead.notes) {
            const existingNotesLower = existingLead.notes.toLowerCase();
            const newNoteLower = proposedLead.notes.toLowerCase();

            if (!existingNotesLower.includes(newNoteLower)) {
              const timestamp = new Date().toLocaleString('en-ZA', {
                timeZone: 'Africa/Johannesburg',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              updatedNotes = `${existingLead.notes}\n\n[${timestamp}] ${proposedLead.notes}`;
            }
          } else {
            updatedNotes = proposedLead.notes;
          }
        }

        const updatedLead = await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            ...(proposedLead.phone && { phone: proposedLead.phone }),
            ...(proposedLead.contacted !== undefined && { contacted: proposedLead.contacted }),
            ...(proposedLead.replied !== undefined && { replied: proposedLead.replied }),
            ...(proposedLead.interested !== undefined && { interested: proposedLead.interested }),
            ...(proposedLead.status && { status: proposedLead.status as any }),
            ...(proposedLead.nextStep && { nextStep: proposedLead.nextStep }),
            ...(proposedLead.nextFollowup && { nextFollowup: new Date(proposedLead.nextFollowup) }),
            ...(updatedNotes !== existingLead.notes && { notes: updatedNotes }),
          },
        });

        await ConfirmationService.clearPendingConfirmation(userId, 'sales');

        return `✅ **Updated existing lead for ${updatedLead.name}**\n\n💡 *Combined with previous lead as you requested*`;
      }

      return "❌ Unknown action. Please try again.";

    } catch (error) {
      await ConfirmationService.clearPendingConfirmation(userId, 'sales');
      return "❌ Something went wrong. Please try adding the lead again.";
    }
  }

  private async showLeadDetails(userId: string, pendingConfirmation: PendingConfirmation, targetIndex: number): Promise<string> {
    const { similarLeads } = pendingConfirmation;

    if (!similarLeads || similarLeads.length === 0) {
      return "❌ No similar leads found.";
    }

    const targetLead = similarLeads[targetIndex];
    if (!targetLead) {
      return "❌ Could not find lead details.";
    }

    const fullLead = await prisma.lead.findFirst({
      where: { userId, id: targetLead.id }
    });

    if (!fullLead) {
      return "❌ Could not find lead details.";
    }

    return this.formatViewResponse({ lead: fullLead }) +
      `\n\n💭 *Reply with 'update' to merge with this lead, or 'yes' to create separately*`;
  }

  private async findSimilarLeadsByName(userId: string, name: string) {
    return await prisma.lead.findMany({
      where: {
        userId,
        name: { contains: name, mode: 'insensitive' }
      },
      take: 3
    });
  }

  private async findExistingLead(userId: string, name: string, phone?: string) {
    const cleanName = this.cleanLeadName(name);

    const searchStrategies = [
      { name: { equals: cleanName, mode: 'insensitive' as const } },
      ...(phone ? [{ phone: { equals: phone } }] : []),
      { name: { contains: cleanName, mode: 'insensitive' as const } },
    ];

    for (const whereClause of searchStrategies) {
      const lead = await prisma.lead.findFirst({
        where: { userId, ...whereClause },
      });

      if (lead) {
        return lead;
      }
    }

    return null;
  }

  private cleanLeadName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .toLowerCase();
  }

  // Implement remaining methods...
  private async updateLead(userId: string, name: string, updates: LeadUpdate['updates'] = {}) {
    const lead = await this.findExistingLead(userId, name, updates.phone);

    if (!lead) {
      log.info(`Lead "${name}" not found for update, creating instead`, { userId });
      return await this.createLead(userId, name, updates);
    }

    // 🎯 SMART NOTE APPENDING LOGIC
    let updatedNotes = lead.notes;
    if (updates.notes) {
      if (lead.notes) {
        // Check if the new note is already in existing notes (avoid duplicates)
        const existingNotesLower = lead.notes.toLowerCase();
        const newNoteLower = updates.notes.toLowerCase();

        if (!existingNotesLower.includes(newNoteLower)) {
          // Add timestamp and append new note
          const timestamp = new Date().toLocaleString('en-ZA', {
            timeZone: 'Africa/Johannesburg',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          updatedNotes = `${lead.notes}\n\n[${timestamp}] ${updates.notes}`;
        }
        // If note already exists, don't duplicate it
      } else {
        // First note
        updatedNotes = updates.notes;
      }
    }

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(updates.phone && { phone: updates.phone }),
        ...(updates.contacted !== undefined && { contacted: updates.contacted }),
        ...(updates.replied !== undefined && { replied: updates.replied }),
        ...(updates.interested !== undefined && { interested: updates.interested }),
        ...(updates.status && { status: updates.status }),
        ...(updates.nextStep && { nextStep: updates.nextStep }),
        ...(updates.nextFollowup && { nextFollowup: new Date(updates.nextFollowup) }),
        ...(updatedNotes !== lead.notes && { notes: updatedNotes }), // Only update if notes changed
      },
    });

    return { action: 'update', lead: updatedLead };
  }

  private async getTodayActivity(userId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [leadsCreatedToday, leadsUpdatedToday, followupsCompletedToday] = await Promise.all([
      prisma.lead.findMany({
        where: {
          userId,
          createdAt: { gte: todayStart }
        },
        select: { name: true, status: true, createdAt: true }
      }),
      prisma.lead.findMany({
        where: {
          userId,
          updatedAt: { gte: todayStart },
          createdAt: { lt: todayStart }
        },
        select: { name: true, status: true, updatedAt: true }
      }),
      prisma.lead.findMany({
        where: {
          userId,
          nextFollowup: {
            gte: todayStart,
            lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
          }
        },
        select: { name: true, status: true, nextFollowup: true }
      })
    ]);

    return {
      leadsCreated: leadsCreatedToday,
      leadsUpdated: leadsUpdatedToday,
      followupsDue: followupsCompletedToday,
      totalActivity: leadsCreatedToday.length + leadsUpdatedToday.length
    };
  }

  private async viewLead(userId: string, name: string) {
    const lead = await this.findExistingLead(userId, name);
    if (!lead) throw new Error(`Lead "${name}" not found`);
    return { action: 'view', lead };
  }

  private async deleteLead(userId: string, name: string) {
    const lead = await this.findExistingLead(userId, name);
    if (!lead) throw new Error(`Lead "${name}" not found`);

    await prisma.lead.delete({
      where: { id: lead.id },
    });

    return { action: 'delete', lead };
  }

  private async queryLeads(userId: string, originalMessage: string) {
    const message = originalMessage.toLowerCase();
    const whereCondition: any = { userId };
    let queryType = 'all';

    if (message.includes('today')) {
      whereCondition.nextFollowup = {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
        lt: new Date(new Date().setHours(23, 59, 59, 999))
      };
      queryType = 'today';
    } else if (message.includes('overdue')) {
      whereCondition.nextFollowup = {
        lt: new Date(new Date().setHours(0, 0, 0, 0))
      };
      queryType = 'overdue';
    } else if (message.includes('new')) {
      whereCondition.status = 'New';
      queryType = 'new';
    } else if (message.includes('interested')) {
      whereCondition.interested = true;
      queryType = 'interested';
    }

    const leads = await prisma.lead.findMany({
      where: whereCondition,
      orderBy: [{ nextFollowup: 'asc' }, { updatedAt: 'desc' }],
      take: 10,
    });

    return { action: 'query', leads, queryType };
  }

  private async getSummary(userId: string) {
    const [total, byStatus, todayFollowups, overdueFollowups, recentActivity] = await Promise.all([
      prisma.lead.count({ where: { userId } }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      prisma.lead.count({
        where: {
          userId,
          nextFollowup: {
            lt: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.lead.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 3
      })
    ]);

    return { action: 'summary', total, byStatus, todayFollowups, overdueFollowups, recentActivity };
  }

  private formatResponse(result: any, update: LeadUpdate, originalMessage: string): string {
    switch (result.action) {
      case 'create':
        return this.formatCreateResponse(result, update);
      case 'duplicate_confirmation':
        return result.message;
      case 'progress_report':
        return this.formatProgressResponse(result);
      case 'conversation':
        return this.formatConversationResponse(result, update);
      case 'update':
        return this.formatUpdateResponse(result, update);
      case 'view':
        return this.formatViewResponse(result);
      case 'query':
        return this.formatQueryResponse(result.leads, result.queryType);
      case 'summary':
        return this.formatSummaryResponse(result);
      case 'delete':
        return this.formatDeleteResponse(result);
      default:
        return 'Action completed successfully.';
    }
  }

  private formatProgressResponse(result: any): string {
    const { report, rawData } = result;

    let response = `📊 **Sales Progress Report**\n\n`;

    // Overview metrics
    response += `📈 **Pipeline Overview:**\n`;
    response += `• Total leads: ${rawData.overview.totalLeads}\n`;
    response += `• This month: ${rawData.overview.leadsThisMonth}\n`;
    response += `• Growth rate: ${rawData.overview.growthRate}%\n\n`;

    // Conversion metrics
    response += `🎯 **Conversion Rates:**\n`;
    response += `• Contact rate: ${rawData.conversionMetrics.contactedRate}%\n`;
    response += `• Reply rate: ${rawData.conversionMetrics.replyRate}%\n`;
    response += `• Interest rate: ${rawData.conversionMetrics.interestRate}%\n`;
    response += `• Win rate: ${rawData.conversionMetrics.winRate}%\n\n`;

    // Activity score
    response += `⚡ **Activity Score:** ${rawData.activityMetrics.activityScore}\n`;
    response += `• Updates this week: ${rawData.activityMetrics.updatesThisWeek}\n`;
    response += `• Scheduled follow-ups: ${rawData.activityMetrics.followupsScheduled}\n`;
    if (rawData.activityMetrics.overdueFollowups > 0) {
      response += `• ⚠️ Overdue follow-ups: ${rawData.activityMetrics.overdueFollowups}\n`;
    }
    response += `\n`;

    // AI insights
    if (report.insights?.length > 0) {
      response += `🧠 **Key Insights:**\n`;
      report.insights.forEach((insight: string) => {
        response += `• ${insight}\n`;
      });
      response += `\n`;
    }

    // Recommendations
    if (report.recommendations?.length > 0) {
      response += `💡 **Recommendations:**\n`;
      report.recommendations.forEach((rec: any, i: number) => {
        const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        response += `${i + 1}. ${priority} ${rec.action}\n`;
        response += `   *${rec.reason}*\n`;
      });
      response += `\n`;
    }

    // Trends
    if (report.trends?.positive?.length > 0) {
      response += `✅ **What's Working:**\n`;
      report.trends.positive.forEach((trend: string) => {
        response += `• ${trend}\n`;
      });
      response += `\n`;
    }

    if (report.trends?.concerning?.length > 0) {
      response += `⚠️ **Areas for Improvement:**\n`;
      report.trends.concerning.forEach((trend: string) => {
        response += `• ${trend}\n`;
      });
      response += `\n`;
    }

    return response;
  }

  private formatCreateResponse(result: any, update: LeadUpdate): string {
    const { lead, wasExisting, duplicateCheck } = result;

    let response = wasExisting
      ? `✅ **Updated existing lead for ${lead.name}**`
      : `✅ **Created lead for ${lead.name}**`;

    if (lead.phone) {
      response += `\n📞 Phone: ${lead.phone}`;
    }

    if (lead.status !== 'New') {
      response += `\n📊 Status: ${lead.status}`;
    }

    if (lead.nextFollowup) {
      const followupDate = new Date(lead.nextFollowup);
      response += `\n📅 Follow-up: ${format(followupDate, 'EEEE, MMM do \'at\' HH:mm')}`;
    }

    if (duplicateCheck && duplicateCheck.result === 'UNIQUE') {
      response += `\n\n🧠 **AI confirmed unique lead** (${Math.round(duplicateCheck.confidence * 100)}% confidence)`;
    }

    return this.formatSalesExtras(response, update);
  }

  private formatConversationResponse(result: any, update: LeadUpdate): string {
    let response = result.response || update.contextualOpening || '';

    if (result.userData) {
      if (result.userData.totalLeads === 0) {
        response += `\n\n💡 *Ready to start building your pipeline? Try adding your first prospect!*`;
      } else if (result.userData.overdueFollowups > 0) {
        response += `\n\n⏰ *You have ${result.userData.overdueFollowups} overdue follow-ups that need attention.*`;
      } else if (result.userData.todayFollowups > 0) {
        response += `\n\n📅 *You have ${result.userData.todayFollowups} follow-ups scheduled for today - great job staying organized!*`;
      } else if (result.userData.totalLeads > 10) {
        response += `\n\n🚀 *Your pipeline is growing nicely with ${result.userData.totalLeads} leads!*`;
      }
    }

    return this.formatSalesExtras(response, update);
  }

  private formatSalesExtras(response: string, update: LeadUpdate): string {
    if (update.salesWisdom) {
      response += `\n\n💼 **Sales Wisdom:** ${update.salesWisdom}`;
    }

    if (update.suggestions?.length) {
      response += '\n\n💡 **AI Suggestions:**\n';
      update.suggestions.forEach((s, i) => {
        response += `${i + 1}. ${s.suggestion}\n   *${s.reason}*\n`;
      });
    }

    if (update.smartAdvice?.length) {
      response += '\n\n🎯 **Smart Advice:**\n';
      update.smartAdvice.forEach(tip => {
        response += `• ${tip}\n`;
      });
    }

    return response;
  }

  private formatUpdateResponse(result: any, update: LeadUpdate): string {
    const { lead, wasExisting } = result;

    let response = wasExisting === false
      ? `✅ **Created new lead for ${lead.name}** (didn't find existing, so I made a new one!)`
      : `✅ **Updated lead for ${lead.name}**`;

    if (lead.phone) {
      response += `\n📞 Phone: ${lead.phone}`;
    }

    if (lead.status) {
      response += `\n📊 Status: ${lead.status}`;
    }

    if (lead.nextFollowup) {
      const followupDate = new Date(lead.nextFollowup);
      response += `\n📅 Next Follow-up: ${format(followupDate, 'EEEE, MMM do \'at\' HH:mm')}`;
    }

    if (wasExisting === false) {
      response += `\n\n💡 *I couldn't find an existing lead with this name, so I created a fresh one with all your details!*`;
    }

    return this.formatSalesExtras(response, update);
  }

  private formatViewResponse(result: any): string {
    const lead = result.lead;
    const status = this.getStatusEmoji(lead.status);

    let response = `👤 **${lead.name}** ${status}\n\n`;
    response += `📊 **Status:** ${lead.status}\n`;

    if (lead.phone) {
      response += `📞 **Phone:** ${lead.phone}\n`;
    }

    const flags = [];
    if (lead.contacted) flags.push('📞 Contacted');
    if (lead.replied) flags.push('💬 Replied');
    if (lead.interested) flags.push('🎯 Interested');

    if (flags.length > 0) {
      response += `📈 **Activity:** ${flags.join(', ')}\n`;
    }

    if (lead.nextFollowup) {
      const followupDate = new Date(lead.nextFollowup);
      const followupText = this.getFollowupText(followupDate);
      response += `📅 **Next Follow-up:** ${followupText}\n`;
    }

    if (lead.nextStep) {
      response += `🎯 **Next Step:** ${lead.nextStep}\n`;
    }

    if (lead.notes) {
      response += `📝 **Notes:** ${lead.notes}\n`;
    }

    const createdAgo = formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true });
    const updatedAgo = formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true });

    response += `\n⏰ **Timeline:**\n`;
    response += `• Created: ${createdAgo}\n`;
    response += `• Last updated: ${updatedAgo}`;

    return response;
  }

  private formatQueryResponse(leads: any[], queryType: string): string {
    if (leads.length === 0) {
      const emptyMessages = {
        'today': "📅 No follow-ups scheduled for today. Great job staying on top of things!",
        'overdue': "✅ No overdue follow-ups. You're caught up!",
        'new': "📋 No new leads found.",
        'interested': "🎯 No interested leads found.",
        'all': "📋 No leads found. Ready to add your first prospect?"
      };
      return emptyMessages[queryType as keyof typeof emptyMessages] || emptyMessages['all'];
    }

    const headers = {
      'today': `📅 **Today's Follow-ups (${leads.length}):**`,
      'overdue': `⚠️ **Overdue Follow-ups (${leads.length}):**`,
      'new': `✨ **New Leads (${leads.length}):**`,
      'interested': `🎯 **Interested Prospects (${leads.length}):**`,
      'all': `📋 **Your Pipeline (${leads.length} leads):**`
    };

    let response = `${headers[queryType as keyof typeof headers] || headers['all']}\n\n`;

    leads.forEach((lead, index) => {
      const status = this.getStatusEmoji(lead.status);
      response += `${index + 1}. ${status} **${lead.name}**\n`;
      response += `   📊 ${lead.status}`;

      if (lead.nextFollowup) {
        const followupDate = new Date(lead.nextFollowup);
        const followupText = this.getFollowupText(followupDate);
        response += ` | ${followupText}`;
      }

      response += `\n\n`;
    });

    return response;
  }

  private formatSummaryResponse(result: any): string {
    let response = `📊 **Sales Pipeline Summary**\n\n`;
    response += `📈 **Total Leads:** ${result.total}\n`;
    response += `📅 **Today's Follow-ups:** ${result.todayFollowups}\n`;

    if (result.overdueFollowups > 0) {
      response += `⚠️ **Overdue Follow-ups:** ${result.overdueFollowups}\n`;
    }

    response += `\n📋 **By Status:**\n`;
    result.byStatus.forEach((status: any) => {
      const emoji = this.getStatusEmoji(status.status);
      response += `${emoji} ${status.status}: ${status._count.status}\n`;
    });

    return response;
  }

  private formatDeleteResponse(result: any): string {
    return `🗑️ **Deleted lead for ${result.lead.name}**`;
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'New': '✨',
      'Contacted': '📞',
      'Replied': '💬',
      'Interested': '🎯',
      'Waiting': '⏳',
      'Proposal Sent': '📄',
      'Closed - Won': '🎉',
      'Closed - Lost': '❌'
    };
    return emojis[status] || '📋';
  }

  private getFollowupText(date: Date): string {
    if (isToday(date)) {
      return `📅 Today ${format(date, 'HH:mm')}`;
    } else if (isTomorrow(date)) {
      return `📅 Tomorrow ${format(date, 'HH:mm')}`;
    } else if (isPast(date)) {
      return `⚠️ Overdue (${format(date, 'MMM do')})`;
    } else {
      return `📅 ${format(date, 'MMM do, HH:mm')}`;
    }
  }
}