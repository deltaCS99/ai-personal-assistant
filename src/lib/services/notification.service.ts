// ===============================
// src/lib/services/notification.service.ts
// ===============================
import { prisma } from '@/lib/database/client';
import { AIProviderFactory } from '@/lib/ai/providers/factory';
import { PromptFactory } from '@/lib/ai/prompts/factory';
import { MessageProviderFactory } from '@/lib/messaging/factory';
import { MessagePlatform } from '@/lib/messaging/types';
import { log } from '@/lib/logger';
import { format, startOfDay, endOfDay, addDays, differenceInDays } from 'date-fns';

interface User {
  id: string;
  platform: string;
  platformId: string;
  name?: string | null;
  username?: string | null;
  services: string;
  notificationPlatform: string | null;
  enableMorningNotification: boolean;
  enableEveningNotification: boolean;
  morningNotificationTime?: string | null;
  eveningNotificationTime?: string | null;
  timezone?: string | null;
  leads: Lead[];
  transactions: Transaction[];
}

interface Lead {
  id: string;
  name: string;
  status: string;
  nextStep: string | null;
  nextFollowup: Date | null;
  notes: string | null;
  interested: boolean;
  contacted: boolean;
  replied: boolean;
  updatedAt: Date;
  createdAt: Date;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  babylonPrinciple: string | null;
  date: Date;
  createdAt: Date;
}

interface TodayActivities {
  leadsUpdated: number;
  leadsCreated: number;
  transactionsAdded: number;
  totalSpent: number;
  totalEarned: number;
  followupsCompleted: number;
}

interface UserInsights {
  totalLeads: number;
  activeLeads: number;
  recentActivity: number;
  servicesActive: string[];
  lastActiveDate: string | null;
  savingsRate: number;
  topCategory: string | null;
}

export class NotificationService {
  private readonly aiProvider = AIProviderFactory.createFromEnv();

  async sendMorningDigest(userId: string): Promise<void> {
    try {
      log.info('Generating morning digest', { userId: userId.substring(0, 8) });

      const user = await this.getUserWithRelations(userId);
      if (!user || !user.enableMorningNotification) {
        log.info('User not found or morning notifications disabled', { userId });
        return;
      }

      // Prepare morning digest data
      const digestData = await this.prepareMorningDigestData(user);
      
      // Get provider name (could be made configurable per user)
      const providerName = this.getAIProviderName();
      
      // Generate digest using template
      const prompt = PromptFactory.getMorningDigestPromptNatural(providerName, digestData);
      const digest = await this.aiProvider.generateResponse(prompt, 'Generate my morning digest');

      // Send notification
      await this.sendNotification(user, 'morning', digest);

      log.info('Morning digest sent', { userId: userId.substring(0, 8) });

    } catch (error) {
      log.error('Failed to send morning digest', error, { userId });
      await this.logFailedNotification(userId, 'morning', error);
    }
  }

  async sendEveningSummary(userId: string): Promise<void> {
    try {
      log.info('Generating evening summary', { userId: userId.substring(0, 8) });

      const user = await this.getUserWithRelations(userId);
      if (!user || !user.enableEveningNotification) {
        log.info('User not found or evening notifications disabled', { userId });
        return;
      }

      // Prepare evening summary data
      const summaryData = await this.prepareEveningSummaryData(user);
      
      // Generate summary using template
      const providerName = this.getAIProviderName();
      const prompt = PromptFactory.getEveningSummaryPromptNatural(providerName, summaryData);
      const summary = await this.aiProvider.generateResponse(prompt, 'Generate my evening summary');

      // Send notification
      await this.sendNotification(user, 'evening', summary);

      log.info('Evening summary sent', { userId: userId.substring(0, 8) });

    } catch (error) {
      log.error('Failed to send evening summary', error, { userId });
      await this.logFailedNotification(userId, 'evening', error);
    }
  }

  private async getUserWithRelations(userId: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        leads: {
          where: {
            // Include leads that need attention or were recently updated
            OR: [
              { nextFollowup: { lte: addDays(new Date(), 7) } }, // Due in next 7 days
              { updatedAt: { gte: startOfDay(new Date()) } },     // Updated today
              { status: { in: ['Interested', 'Waiting', 'Proposal Sent'] } } // Active statuses
            ]
          },
          orderBy: [
            { nextFollowup: 'asc' },
            { updatedAt: 'desc' }
          ],
          take: 20
        },
        transactions: {
          where: {
            createdAt: {
              gte: startOfDay(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    }) as User | null;
  }

  private async prepareMorningDigestData(user: User): Promise<any> {
    const today = new Date();
    const tomorrow = addDays(today, 1);

    // Due leads for today and overdue
    const dueLeads = user.leads
      .filter(lead => lead.nextFollowup && lead.nextFollowup <= endOfDay(today))
      .map(lead => ({
        name: lead.name,
        status: lead.status,
        nextStep: lead.nextStep,
        isOverdue: lead.nextFollowup ? lead.nextFollowup < startOfDay(today) : false,
        daysOverdue: lead.nextFollowup ? 
          Math.max(0, differenceInDays(today, lead.nextFollowup)) : 0,
        priority: lead.interested ? 'high' : (lead.replied ? 'medium' : 'low')
      }))
      .sort((a, b) => {
        // Sort by: overdue first, then by priority, then by days overdue
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.priority !== b.priority) {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority as keyof typeof priorityOrder] - 
                 priorityOrder[b.priority as keyof typeof priorityOrder];
        }
        return b.daysOverdue - a.daysOverdue;
      });

    // Recent financial activity (last 3 days)
    const recentTransactions = user.transactions
      .filter(t => t.createdAt >= startOfDay(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)))
      .map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        date: format(t.date, 'MMM dd'),
        babylonPrinciple: t.babylonPrinciple
      }));

    // User insights
    const userInsights = await this.generateUserInsights(user);

    // Tomorrow's scheduled tasks
    const tomorrowTasks = user.leads
      .filter(lead => 
        lead.nextFollowup && 
        lead.nextFollowup >= startOfDay(tomorrow) && 
        lead.nextFollowup <= endOfDay(tomorrow)
      )
      .map(lead => ({
        name: lead.name,
        nextStep: lead.nextStep,
        status: lead.status
      }));

    return {
      dueLeads: JSON.stringify(dueLeads),
      recentTransactions: JSON.stringify(recentTransactions),
      userInsights: JSON.stringify({
        ...userInsights,
        tomorrowTaskCount: tomorrowTasks.length,
        userName: user.name || user.username || 'there'
      })
    };
  }

  private async prepareEveningSummaryData(user: User): Promise<any> {
    const today = new Date();
    const tomorrow = addDays(today, 1);

    // Today's activities
    const todayActivities = await this.calculateTodayActivities(user);

    // Tomorrow's follow-ups
    const tomorrowTasks = user.leads
      .filter(lead => 
        lead.nextFollowup && 
        lead.nextFollowup >= startOfDay(tomorrow) && 
        lead.nextFollowup <= endOfDay(tomorrow)
      )
      .map(lead => ({
        name: lead.name,
        nextStep: lead.nextStep || 'Follow up',
        status: lead.status,
        time: lead.nextFollowup ? format(lead.nextFollowup, 'HH:mm') : null
      }))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // Progress data
    const progressData = await this.calculateProgressMetrics(user);

    return {
      todayActivities: JSON.stringify({
        ...todayActivities,
        userName: user.name || user.username || 'there'
      }),
      tomorrowTasks: JSON.stringify(tomorrowTasks),
      progressData: JSON.stringify(progressData)
    };
  }

  private async calculateTodayActivities(user: User): Promise<TodayActivities> {
    const todayStart = startOfDay(new Date());
    
    // Get today's lead activities
    const todayLeadUpdates = user.leads.filter(lead => 
      lead.updatedAt >= todayStart
    );

    const todayTransactions = user.transactions.filter(t => 
      t.createdAt >= todayStart
    );

    return {
      leadsUpdated: todayLeadUpdates.filter(lead => 
        differenceInDays(lead.updatedAt, lead.createdAt) > 0
      ).length,
      leadsCreated: todayLeadUpdates.filter(lead => 
        differenceInDays(lead.updatedAt, lead.createdAt) === 0
      ).length,
      transactionsAdded: todayTransactions.length,
      totalSpent: todayTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      totalEarned: todayTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0),
      followupsCompleted: todayLeadUpdates.filter(lead => 
        lead.contacted || lead.replied
      ).length
    };
  }

  private async calculateProgressMetrics(user: User): Promise<any> {
    const activeLeads = user.leads.filter(lead => 
      !['Closed - Won', 'Closed - Lost'].includes(lead.status)
    ).length;

    const interestedLeads = user.leads.filter(lead => lead.interested).length;
    const conversionRate = user.leads.length > 0 ? 
      Math.round((interestedLeads / user.leads.length) * 100) : 0;

    // Financial metrics
    const monthlyIncome = user.transactions
      .filter(t => t.category === 'Income' && 
        t.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyExpenses = user.transactions
      .filter(t => ['Fixed Expenses', 'Variable Expenses'].includes(t.category) && 
        t.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const savingsRate = monthlyIncome > 0 ? 
      Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0;

    return {
      activeLeads,
      conversionRate,
      savingsRate,
      monthlyIncome,
      monthlyExpenses,
      weekStreak: await this.calculateActiveWeekStreak(user.id),
      goals: await this.getGoalProgress(user.id)
    };
  }

  private async generateUserInsights(user: User): Promise<UserInsights> {
    const activeLeads = user.leads.filter(lead => 
      !['Closed - Won', 'Closed - Lost'].includes(lead.status)
    ).length;

    const recentActivity = user.leads.filter(lead => 
      lead.updatedAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length + user.transactions.length;

    // Calculate savings rate
    const income = user.transactions
      .filter(t => t.category === 'Income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = user.transactions
      .filter(t => ['Fixed Expenses', 'Variable Expenses'].includes(t.category))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

    // Find top spending category
    const categoryTotals = user.transactions.reduce((acc, t) => {
      if (t.amount < 0) {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    const topCategory = Object.entries(categoryTotals).length > 0 ? 
      Object.entries(categoryTotals).sort(([,a], [,b]) => b - a)[0][0] : null;

    return {
      totalLeads: user.leads.length,
      activeLeads,
      recentActivity,
      servicesActive: user.services?.split(',').filter(s => s.length > 0) || [],
      lastActiveDate: user.transactions.length > 0 ? 
        format(user.transactions[0].createdAt, 'MMM dd') : null,
      savingsRate,
      topCategory
    };
  }

  private async calculateActiveWeekStreak(userId: string): Promise<number> {
    // Simple implementation - count consecutive weeks with activity
    let streak = 0;
    const currentWeekStart = startOfDay(new Date());
    
    for (let week = 0; week < 12; week++) { // Check last 12 weeks
      const weekStart = new Date(currentWeekStart.getTime() - (week * 7 * 24 * 60 * 60 * 1000));
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const hasActivity = await prisma.lead.count({
        where: {
          userId,
          updatedAt: { gte: weekStart, lt: weekEnd }
        }
      }) > 0 || await prisma.transaction.count({
        where: {
          userId,
          createdAt: { gte: weekStart, lt: weekEnd }
        }
      }) > 0;

      if (hasActivity) {
        streak++;
      } else if (week > 0) {
        break; // End streak if no activity (but don't count current week if it just started)
      }
    }

    return streak;
  }

  private async getGoalProgress(userId: string): Promise<any[]> {
    const accounts = await prisma.account.findMany({
      where: { 
        userId,
        targetAmount: { not: null }
      }
    });

    return accounts.map(account => ({
      name: account.name,
      progress: account.targetAmount ? 
        Math.round((account.currentBalance / account.targetAmount) * 100) : 0,
      current: account.currentBalance,
      target: account.targetAmount
    }));
  }

  private async sendNotification(user: User, type: string, content: string): Promise<void> {
    try {
      const platform = (user.notificationPlatform || user.platform) as MessagePlatform;
      const provider = MessageProviderFactory.create(platform);

      // Send to user's chat
      await provider.sendMessage(user.platformId, content);

      // Log successful notification
      await prisma.notification.create({
        data: {
          userId: user.id,
          type,
          content: content.substring(0, 1000), // Limit content length for storage
          platform,
          status: 'sent'
        }
      });

      log.info('Notification sent successfully', { 
        userId: user.id.substring(0, 8), 
        type, 
        platform 
      });

    } catch (error) {
      log.error('Failed to send notification', error, { userId: user.id, type });
      await this.logFailedNotification(user.id, type, error);
    }
  }

  private async logFailedNotification(userId: string, type: string, error: any): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type,
          content: `Failed: ${error.message}`,
          platform: 'unknown',
          status: 'failed'
        }
      });
    } catch (logError) {
      log.error('Failed to log notification failure', logError);
    }
  }

  private getAIProviderName(): string {
    // This could be made configurable per user or globally
    const provider = this.aiProvider.constructor.name;
    if (provider.includes('Gemini')) return 'gemini';
    if (provider.includes('Claude')) return 'claude';
    if (provider.includes('OpenAI') || provider.includes('GPT')) return 'openai';
    return 'gemini';
  }

  // Manual testing methods
  async testMorningDigest(userId: string): Promise<string> {
    try {
      const user = await this.getUserWithRelations(userId);
      if (!user) throw new Error('User not found');

      const digestData = await this.prepareMorningDigestData(user);
      const providerName = this.getAIProviderName();
      const prompt = PromptFactory.getMorningDigestPromptNatural(providerName, digestData);
      
      return await this.aiProvider.generateResponse(prompt, 'Generate my morning digest');
    } catch (error) {
      log.error('Test morning digest failed', error);
      throw error;
    }
  }

  async testEveningSummary(userId: string): Promise<string> {
    try {
      const user = await this.getUserWithRelations(userId);
      if (!user) throw new Error('User not found');

      const summaryData = await this.prepareEveningSummaryData(user);
      const providerName = this.getAIProviderName();
      const prompt = PromptFactory.getEveningSummaryPromptNatural(providerName, summaryData);
      
      return await this.aiProvider.generateResponse(prompt, 'Generate my evening summary');
    } catch (error) {
      log.error('Test evening summary failed', error);
      throw error;
    }
  }

  // Get notification history
  async getNotificationHistory(userId: string, limit: number = 10): Promise<any[]> {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { sentAt: 'desc' },
      take: limit
    });
  }

  // Update notification preferences
  async updateNotificationPreferences(
    userId: string, 
    preferences: {
      enableMorning?: boolean;
      enableEvening?: boolean;
      morningTime?: string;
      eveningTime?: string;
    }
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        enableMorningNotification: preferences.enableMorning,
        enableEveningNotification: preferences.enableEvening,
        morningNotificationTime: preferences.morningTime,
        eveningNotificationTime: preferences.eveningTime,
      }
    });
  }
}