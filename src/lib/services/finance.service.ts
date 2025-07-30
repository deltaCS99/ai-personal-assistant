// ===============================
// src/lib/services/enhanced-finance.service.ts - COMPLETE Finance Service
// ===============================
import { prisma } from '@/lib/database/client';
import { FinanceUpdate, FinanceUpdateSchema } from '@/lib/types/finance';
import { DuplicateDetection, DuplicateDetectionSchema, ProgressReport, ProgressReportSchema } from '@/lib/types/common';
import { PromptFactory } from '@/lib/ai/prompts/factory';
import { BaseAIService } from './base-ai.service';
import { ConfirmationService } from './confirmation.service';
import { format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { log } from '../logger';
import { z } from 'zod';

interface FinancialProgressData {
  snapshot: {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    investmentPercentage: number;
    emergencyFundMonths: number;
    debtToIncomeRatio: number;
    transactionCount: number;
  };
  trends: Array<{
    month: string;
    income: number;
    expenses: number;
    savings: number;
    savingsRate: number;
  }>;
  goals: Array<{
    name: string;
    type: string;
    current: number;
    target: number;
    progress: number;
    remaining: number;
    monthsToGoal: number;
  }>;
  spending: Array<{
    category: string;
    amount: number;
    transactions: number;
    averagePerTransaction: number;
  }>;
  income: {
    averageMonthlyIncome: number;
    stabilityScore: number;
    monthlyIncomes: number[];
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  investments: {
    totalValue: number;
    accounts: number;
    averageAccountValue: number;
    diversification: 'good' | 'moderate' | 'low';
  };
  babylonScore: {
    overallScore: number;
    principles: {
      payYourselfFirst: number;
      controlExpenses: number;
      makeMoneyWork: number;
      guardAgainstLoss: number;
      increaseEarning: number;
    };
    strengths: string[];
    improvements: string[];
  };
  timeframe: {
    analyzed: string;
    period: string;
  };
}

interface PendingFinanceConfirmation {
  type: 'transaction_duplicate';
  proposedTransaction: {
    description: string;
    amount: number;
    category: string;
    babylonPrinciple?: string;
    date?: string;
  };
  duplicateCheck: DuplicateDetection;
  similarTransactions: Array<{
    id: string;
    description: string;
    amount: number;
    category: string;
    createdAt: Date;
  }>;
  timestamp: number;
}

export class FinanceService extends BaseAIService {
  async processMessage(userId: string, message: string): Promise<string> {
    try {
      // 🎯 CRITICAL: Check if this is a confirmation response first
      if (this.isConfirmationMessage(message)) {
        return await this.handleConfirmation(userId, message);
      }

      const userFinancialContext = await this.getUserFinancialContext(userId);
      const prompt = PromptFactory.getFinancePrompt(this.getProviderName()) + userFinancialContext;

      const financeUpdate = await this.processAIRequest<FinanceUpdate>(
        prompt,
        message,
        FinanceUpdateSchema,
        userId,
        'Finance'
      );

      const result = await this.processFinanceUpdate(userId, financeUpdate, message);
      return this.formatResponse(result, financeUpdate);
    } catch (error) {
      return this.logError(error, 'Finance', userId);
    }
  }

  // 🎯 ENHANCED: More specific confirmation detection
  private isConfirmationMessage(message: string): boolean {
    const confirmationPatterns = [
      /^(yes|y|confirm|add new|new transaction)$/i,
      /^(no|n|cancel|abort)$/i,
      /^(update|use existing)$/i,
      /^update\s+\d+$/i,
      /^(show|details|info)\s*\d*$/i
    ];
    
    const trimmedMessage = message.trim();
    
    return confirmationPatterns.some(pattern => pattern.test(trimmedMessage)) && 
           trimmedMessage.length < 20;
  }

  private async handleConfirmation(userId: string, message: string): Promise<string> {
    const pendingConfirmation = await ConfirmationService.getPendingConfirmation(userId, 'finance');
    
    if (!pendingConfirmation) {
      return await this.processNormalMessage(userId, message);
    }

    const cleanMessage = message.trim().toLowerCase();

    if (cleanMessage.match(/^(yes|y|confirm|add new|new transaction)$/)) {
      return await this.executePendingAction(userId, 'add_new', pendingConfirmation);
    } else if (cleanMessage.match(/^(update|use existing)$/) || cleanMessage.match(/^update\s+\d+$/)) {
      const match = cleanMessage.match(/\d+/);
      const targetIndex = match ? parseInt(match[0]) - 1 : 0;
      return await this.executePendingAction(userId, 'update_existing', pendingConfirmation, targetIndex);
    } else if (cleanMessage.match(/^(show|details|info)/)) {
      const match = cleanMessage.match(/\d+/);
      const targetIndex = match ? parseInt(match[0]) - 1 : 0;
      return await this.showTransactionDetails(userId, pendingConfirmation, targetIndex);
    } else if (cleanMessage.match(/^(no|n|cancel|abort)$/)) {
      await ConfirmationService.clearPendingConfirmation(userId, 'finance');
      return "👍 Cancelled. What else can I help you with?";
    } else {
      return await this.processNormalMessage(userId, message);
    }
  }

  private async processNormalMessage(userId: string, message: string): Promise<string> {
    const userFinancialContext = await this.getUserFinancialContext(userId);
    const prompt = PromptFactory.getFinancePrompt(this.getProviderName()) + userFinancialContext;

    const financeUpdate = await this.processAIRequest<FinanceUpdate>(
      prompt,
      message,
      FinanceUpdateSchema,
      userId,
      'Finance'
    );

    const result = await this.processFinanceUpdate(userId, financeUpdate, message);
    return this.formatResponse(result, financeUpdate);
  }

  private async getUserFinancialContext(userId: string): Promise<string> {
    const [accounts, monthlyIncome, monthlyExpenses, recentTransactions, financialHealth] = await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      this.getMonthlyIncome(userId),
      this.getMonthlyExpenses(userId),
      this.getRecentTransactions(userId, 10),
      this.getFinancialHealthMetrics(userId)
    ]);

    let context = `\n\nUSER FINANCIAL CONTEXT:`;

    if (accounts.length > 0) {
      context += `\nACCOUNTS:`;
      accounts.forEach(account => {
        const progress = account.targetAmount
          ? ` (${Math.round((account.currentBalance / account.targetAmount) * 100)}% of R${account.targetAmount} goal)`
          : '';
        context += `\n- ${account.name}: R${account.currentBalance}${progress}`;
      });
    } else {
      context += `\nACCOUNTS: None created yet`;
    }

    context += `\nMONTHLY SUMMARY:`;
    context += `\n- Income: R${monthlyIncome}`;
    context += `\n- Expenses: R${monthlyExpenses}`;
    context += `\n- Savings Rate: ${monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0}%`;
    context += `\n- Net Worth: R${financialHealth.netWorth}`;

    if (recentTransactions.length > 0) {
      context += `\nRECENT ACTIVITY (for duplicate detection):`;
      recentTransactions.forEach(transaction => {
        const date = new Date(transaction.createdAt).toLocaleDateString();
        context += `\n- ${date}: ${transaction.description} R${transaction.amount} (${transaction.category})`;
      });
    } else {
      context += `\nRECENT ACTIVITY: No transactions tracked yet`;
    }

    if (financialHealth.transactionCount > 10) {
      context += `\nFINANCIAL HEALTH:`;
      context += `\n- Emergency fund coverage: ${financialHealth.emergencyFundMonths} months`;
      context += `\n- Debt-to-income ratio: ${financialHealth.debtToIncomeRatio}%`;
      context += `\n- Investment allocation: ${financialHealth.investmentPercentage}%`;
    }

    return context;
  }

  private async getFinancialHealthMetrics(userId: string) {
    const [totalAssets, totalLiabilities, investments, emergencyFund, transactionCount, monthlyIncome] = await Promise.all([
      prisma.account.aggregate({
        where: { 
          userId, 
          type: { in: ['Asset', 'Investment', 'Emergency Fund'] }
        },
        _sum: { currentBalance: true }
      }),
      
      prisma.account.aggregate({
        where: { userId, type: 'Liability' },
        _sum: { currentBalance: true }
      }),
      
      prisma.account.aggregate({
        where: { userId, type: 'Investment' },
        _sum: { currentBalance: true }
      }),
      
      prisma.account.findFirst({
        where: { userId, type: 'Emergency Fund' }
      }),
      
      prisma.transaction.count({ where: { userId } }),
      
      this.getMonthlyIncome(userId)
    ]);

    const assets = totalAssets._sum.currentBalance || 0;
    const liabilities = Math.abs(totalLiabilities._sum.currentBalance || 0);
    const netWorth = assets - liabilities;
    const investmentValue = investments._sum.currentBalance || 0;
    const emergencyFundValue = emergencyFund?.currentBalance || 0;
    
    return {
      netWorth,
      totalAssets: assets,
      totalLiabilities: liabilities,
      investmentPercentage: assets > 0 ? Math.round((investmentValue / assets) * 100) : 0,
      emergencyFundMonths: monthlyIncome > 0 ? Math.round(emergencyFundValue / (monthlyIncome / 12)) : 0,
      debtToIncomeRatio: monthlyIncome > 0 ? Math.round((liabilities / (monthlyIncome * 12)) * 100) : 0,
      transactionCount
    };
  }

  private async processFinanceUpdate(userId: string, update: FinanceUpdate, originalMessage: string) {
    const { action, transaction, account } = update;

    switch (action) {
      case 'add_transaction':
        return this.addTransaction(userId, transaction!);
      case 'update_account':
        return this.updateAccount(userId, account!);
      case 'check_goal':
        return this.checkGoalProgress(userId);
      case 'summary':
        return this.getFinancialSummary(userId);
      case 'delete_transaction':
        return this.deleteTransaction(userId, transaction!);
      case 'delete_account':
        return this.deleteAccount(userId, account!);
      case 'timeline':
        return this.getTimeline(userId, update.grouping);
      case 'edit_transaction':
        return this.editTransaction(userId, transaction!);
      case 'conversation':
        return this.handleConversation(userId, update, originalMessage);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // 🎯 AI-driven progress detection
  private async handleConversation(userId: string, update: FinanceUpdate, originalMessage: string) {
    const progressPrompt = `
    Analyze this user message and determine if they are asking for a financial progress report, financial health analysis, or financial metrics.

    User message: "${originalMessage}"

    Return JSON:
    {
      "isProgressRequest": true/false,
      "confidence": 0.0-1.0,
      "reasoning": "why this is or isn't a progress request"
    }

    Progress request indicators:
    - Asking about financial performance, results, health, progress
    - Questions about how they're doing financially
    - Requests for financial reports, analysis, or net worth
    - Questions about savings rate, wealth building, or Babylon principles
    - Mentions of progress, performance, metrics in financial context
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
        'FinanceProgressDetection'
      );

      if (progressAnalysis.isProgressRequest && progressAnalysis.confidence > 0.7) {
        return await this.generateProgressReport(userId);
      }
    } catch (error) {
      log.warn('Finance progress detection failed, continuing with normal conversation', { error, userId });
    }

    const summary = await this.getFinancialSummary(userId);
    
    return {
      action: 'conversation',
      response: update.contextualOpening || "I'm here to help with your finances!",
      context: 'finance',
      userData: {
        savingsRate: summary.savingsRate,
        monthlyIncome: summary.monthlyIncome,
        monthlyExpenses: summary.monthlyExpenses,
        totalTransactions: summary.totalTransactions,
        hasGoals: summary.goalProgress.length > 0,
        netWorth: summary.netWorth
      }
    };
  }

  private async generateProgressReport(userId: string) {
    const progressData = await this.gatherFinancialProgressData(userId);
    
    const prompt = PromptFactory.getFinanceProgressPrompt(this.getProviderName());
    const context = JSON.stringify(progressData, null, 2);

    try {
      const report = await this.processAIRequest<ProgressReport>(
        prompt,
        context,
        ProgressReportSchema,
        userId,
        'FinanceProgress'
      );

      return {
        action: 'progress_report',
        report,
        rawData: progressData
      };
    } catch (error) {
      log.error('AI finance progress report generation failed', { error, userId });
      return {
        action: 'progress_report',
        report: this.generateBasicFinancialReport(progressData),
        rawData: progressData
      };
    }
  }

  private async gatherFinancialProgressData(userId: string): Promise<FinancialProgressData> {
    const now = new Date();

    const [
      currentFinancialHealth,
      monthlyTrends,
      savingsGoalProgress,
      expenseBreakdown,
      incomeStability,
      investmentGrowth,
      babylonPrinciplesAdherence
    ] = await Promise.all([
      this.getFinancialHealthMetrics(userId),
      this.getMonthlyTrends(userId),
      this.getSavingsGoalProgress(userId),
      this.getExpenseBreakdown(userId),
      this.getIncomeStability(userId),
      this.getInvestmentGrowth(userId),
      this.assessBabylonPrinciples(userId)
    ]);

    return {
      snapshot: currentFinancialHealth,
      trends: monthlyTrends,
      goals: savingsGoalProgress,
      spending: expenseBreakdown,
      income: incomeStability,
      investments: investmentGrowth,
      babylonScore: babylonPrinciplesAdherence,
      timeframe: {
        analyzed: format(now, 'yyyy-MM-dd'),
        period: '12 months'
      }
    };
  }

  // Continue with all financial analysis methods...
  private async getMonthlyTrends(userId: string) {
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(new Date(), i);
      return {
        month: format(date, 'yyyy-MM'),
        start: startOfMonth(date),
        end: endOfMonth(date)
      };
    }).reverse();

    const trends = await Promise.all(
      last6Months.map(async ({ month, start, end }) => {
        const [income, expenses] = await Promise.all([
          prisma.transaction.aggregate({
            where: {
              userId,
              category: 'Income',
              createdAt: { gte: start, lte: end }
            },
            _sum: { amount: true }
          }),
          
          prisma.transaction.aggregate({
            where: {
              userId,
              category: { in: ['Fixed Expenses', 'Variable Expenses'] },
              createdAt: { gte: start, lte: end }
            },
            _sum: { amount: true }
          })
        ]);

        const monthlyIncome = income._sum.amount || 0;
        const monthlyExpenses = Math.abs(expenses._sum.amount || 0);
        
        return {
          month,
          income: monthlyIncome,
          expenses: monthlyExpenses,
          savings: monthlyIncome - monthlyExpenses,
          savingsRate: monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0
        };
      })
    );

    return trends;
  }

  private async getSavingsGoalProgress(userId: string) {
    const accounts = await prisma.account.findMany({
      where: { 
        userId, 
        targetAmount: { not: null },
        type: { in: ['Asset', 'Emergency Fund', 'Investment'] }
      }
    });

    const goals = await Promise.all(accounts.map(async (account) => ({
      name: account.name,
      type: account.type,
      current: account.currentBalance,
      target: account.targetAmount!,
      progress: Math.round((account.currentBalance / account.targetAmount!) * 100),
      remaining: account.targetAmount! - account.currentBalance,
      monthsToGoal: await this.calculateMonthsToGoal(account.currentBalance, account.targetAmount!, userId)
    })));

    return goals;
  }

  private async calculateMonthsToGoal(current: number, target: number, userId: string): Promise<number> {
    const monthlySavings = await this.getAverageMonthlySavings(userId);
    if (monthlySavings <= 0) return Infinity;
    return Math.ceil((target - current) / monthlySavings);
  }

  private async getAverageMonthlySavings(userId: string): Promise<number> {
    const last3Months = subMonths(new Date(), 3);
    
    const [income, expenses] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId,
          category: 'Income',
          createdAt: { gte: last3Months }
        },
        _sum: { amount: true }
      }),
      
      prisma.transaction.aggregate({
        where: {
          userId,
          category: { in: ['Fixed Expenses', 'Variable Expenses'] },
          createdAt: { gte: last3Months }
        },
        _sum: { amount: true }
      })
    ]);

    const totalIncome = income._sum.amount || 0;
    const totalExpenses = Math.abs(expenses._sum.amount || 0);
    
    return (totalIncome - totalExpenses) / 3;
  }

  private async getExpenseBreakdown(userId: string) {
    const lastMonth = subMonths(new Date(), 1);
    
    const expenses = await prisma.transaction.groupBy({
      by: ['category'],
      where: {
        userId,
        amount: { lt: 0 },
        createdAt: { gte: lastMonth }
      },
      _sum: { amount: true },
      _count: { category: true }
    });

    return expenses.map(expense => ({
      category: expense.category,
      amount: Math.abs(expense._sum.amount || 0),
      transactions: expense._count.category,
      averagePerTransaction: Math.abs((expense._sum.amount || 0) / expense._count.category)
    }));
  }

  private async getIncomeStability(userId: string) {
    const last6Months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), i));
    
    const incomeByMonth = await Promise.all(
      last6Months.map(async (month) => {
        const income = await prisma.transaction.aggregate({
          where: {
            userId,
            category: 'Income',
            createdAt: {
              gte: startOfMonth(month),
              lte: endOfMonth(month)
            }
          },
          _sum: { amount: true }
        });
        
        return income._sum.amount || 0;
      })
    );

    const averageIncome = incomeByMonth.reduce((sum, income) => sum + income, 0) / incomeByMonth.length;
    const variance = incomeByMonth.reduce((sum, income) => sum + Math.pow(income - averageIncome, 2), 0) / incomeByMonth.length;
    const standardDeviation = Math.sqrt(variance);
    const stabilityScore = averageIncome > 0 ? Math.max(0, 100 - (standardDeviation / averageIncome) * 100) : 0;

    return {
      averageMonthlyIncome: Math.round(averageIncome),
      stabilityScore: Math.round(stabilityScore),
      monthlyIncomes: incomeByMonth,
      trend: this.calculateIncomeTrend(incomeByMonth)
    };
  }

  private calculateIncomeTrend(incomes: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (incomes.length < 2) return 'stable';
    
    const recentAvg = incomes.slice(0, 3).reduce((sum, income) => sum + income, 0) / 3;
    const olderAvg = incomes.slice(3).reduce((sum, income) => sum + income, 0) / (incomes.length - 3);
    
    if (olderAvg === 0) return 'stable';
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private async getInvestmentGrowth(userId: string) {
    const investments = await prisma.account.findMany({
      where: { userId, type: 'Investment' }
    });

    const totalInvestmentValue = investments.reduce((sum, inv) => sum + inv.currentBalance, 0);
    
    return {
      totalValue: totalInvestmentValue,
      accounts: investments.length,
      averageAccountValue: investments.length > 0 ? totalInvestmentValue / investments.length : 0,
      diversification: investments.length >= 3 ? 'good' as const : investments.length >= 2 ? 'moderate' as const : 'low' as const
    };
  }

  private async assessBabylonPrinciples(userId: string) {
    const [
      savingsRate,
      hasEmergencyFund,
      hasInvestments,
      debtRatio,
      incomeGrowth,
      expenseControl
    ] = await Promise.all([
      this.calculateCurrentSavingsRate(userId),
      this.hasEmergencyFund(userId),
      this.hasInvestments(userId),
      this.getDebtRatio(userId),
      this.getIncomeGrowthRate(userId),
      this.getExpenseControlScore(userId)
    ]);

    const principles = {
      payYourselfFirst: savingsRate >= 10 ? 100 : (savingsRate / 10) * 100,
      controlExpenses: expenseControl,
      makeMoneyWork: hasInvestments ? 100 : 0,
      guardAgainstLoss: hasEmergencyFund ? 100 : 0,
      increaseEarning: incomeGrowth >= 0 ? 100 : 50
    };

    const overallScore = Object.values(principles).reduce((sum, score) => sum + score, 0) / Object.keys(principles).length;

    return {
      overallScore: Math.round(overallScore),
      principles,
      strengths: Object.entries(principles).filter(([_, score]) => score >= 80).map(([name]) => name),
      improvements: Object.entries(principles).filter(([_, score]) => score < 60).map(([name]) => name)
    };
  }

  private async calculateCurrentSavingsRate(userId: string): Promise<number> {
    const monthlyIncome = await this.getMonthlyIncome(userId);
    const monthlyExpenses = await this.getMonthlyExpenses(userId);
    
    return monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
  }

  private async hasEmergencyFund(userId: string): Promise<boolean> {
    const emergencyFund = await prisma.account.findFirst({
      where: { userId, type: 'Emergency Fund' }
    });
    
    const monthlyExpenses = await this.getMonthlyExpenses(userId);
    return emergencyFund ? emergencyFund.currentBalance >= (monthlyExpenses * 3) : false;
  }

  private async hasInvestments(userId: string): Promise<boolean> {
    const investments = await prisma.account.count({
      where: { userId, type: 'Investment', currentBalance: { gt: 0 } }
    });
    
    return investments > 0;
  }

  private async getDebtRatio(userId: string): Promise<number> {
    const [totalDebt, monthlyIncome] = await Promise.all([
      prisma.account.aggregate({
        where: { userId, type: 'Liability' },
        _sum: { currentBalance: true }
      }),
      this.getMonthlyIncome(userId)
    ]);

    const debt = Math.abs(totalDebt._sum.currentBalance || 0);
    return monthlyIncome > 0 ? (debt / (monthlyIncome * 12)) * 100 : 0;
  }

  private async getIncomeGrowthRate(userId: string): Promise<number> {
    const currentMonth = await this.getMonthlyIncome(userId);
    const lastMonth = await this.getIncomeForMonth(userId, subMonths(new Date(), 1));
    
    return lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;
  }

  private async getIncomeForMonth(userId: string, month: Date): Promise<number> {
    const income = await prisma.transaction.aggregate({
      where: {
        userId,
        category: 'Income',
        createdAt: {
          gte: startOfMonth(month),
          lte: endOfMonth(month)
        }
      },
      _sum: { amount: true }
    });

    return income._sum.amount || 0;
  }

  private async getExpenseControlScore(userId: string): Promise<number> {
    const last3MonthsExpenses = await this.getExpensesForLastMonths(userId, 3);
    const previousExpenses = await this.getExpensesForLastMonths(userId, 6, 3);
    
    if (previousExpenses === 0) return 50;
    
    const changeRate = ((last3MonthsExpenses - previousExpenses) / previousExpenses) * 100;
    
    return Math.max(0, 100 - Math.max(0, changeRate));
  }

  private cleanUsername(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .substring(0, 30);
  }

  private async getExpensesForLastMonths(userId: string, months: number, offset: number = 0): Promise<number> {
    const startDate = subMonths(new Date(), months + offset);
    const endDate = offset > 0 ? subMonths(new Date(), offset) : new Date();
    
    const expenses = await prisma.transaction.aggregate({
      where: {
        userId,
        category: { in: ['Fixed Expenses', 'Variable Expenses'] },
        createdAt: { gte: startDate, lte: endDate }
      },
      _sum: { amount: true }
    });

    return Math.abs(expenses._sum.amount || 0) / months;
  }

  private generateBasicFinancialReport(data: FinancialProgressData): ProgressReport {
    const insights: string[] = [];
    const recommendations: ProgressReport['recommendations'] = [];
    const trends: ProgressReport['trends'] = { positive: [], concerning: [], neutral: [] };

    // Babylon Principles Assessment
    if (data.babylonScore.overallScore >= 80) {
      insights.push(`Excellent adherence to Babylon principles with ${data.babylonScore.overallScore}% score`);
      trends.positive.push('Strong financial foundation following ancient wisdom');
    } else if (data.babylonScore.overallScore < 60) {
      insights.push(`Room for improvement in Babylon principles (${data.babylonScore.overallScore}% score)`);
      trends.concerning.push('Financial habits need strengthening');
    }

    // Savings Rate Analysis
    const currentSavingsRate = data.trends[data.trends.length - 1]?.savingsRate || 0;
    if (currentSavingsRate >= 20) {
      trends.positive.push('Excellent savings rate above 20%');
    } else if (currentSavingsRate < 10) {
      trends.concerning.push('Savings rate below recommended 10%');
      recommendations.push({
        action: 'Increase savings rate to at least 10% of income',
        priority: 'high',
        reason: 'Babylon principle: Pay yourself first',
        expectedImpact: 'Build long-term wealth foundation'
      });
    }

    // Net Worth Trend
    if (data.snapshot.netWorth > 0) {
      trends.positive.push('Positive net worth indicates good financial health');
    } else {
      trends.concerning.push('Negative net worth needs attention');
      recommendations.push({
        action: 'Focus on debt reduction and asset building',
        priority: 'high',
        reason: 'Negative net worth limits financial options',
        expectedImpact: 'Achieve financial stability'
      });
    }

    return {
      type: 'finance',
      summary: `Financial health analysis shows ${data.babylonScore.overallScore}% Babylon score with R${data.snapshot.netWorth.toLocaleString()} net worth`,
      metrics: data,
      insights,
      recommendations,
      trends,
      nextSteps: [
        'Review and optimize spending categories',
        'Increase emergency fund if needed',
        'Consider investment diversification',
        'Track progress monthly'
      ]
    };
  }

  // 🎯 Transaction duplicate detection
  private async checkForTransactionDuplicate(userId: string, newTransaction: FinanceUpdate['transaction']): Promise<DuplicateDetection> {
    if (!newTransaction) {
      return {
        result: 'UNIQUE',
        confidence: 1.0,
        reasoning: 'No transaction to check',
        matchedLead: null,
        matchedTransaction: null
      };
    }

    const recentTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        createdAt: { gte: subDays(new Date(), 14) }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    if (recentTransactions.length === 0) {
      return {
        result: 'UNIQUE',
        confidence: 1.0,
        reasoning: 'No recent transactions to compare against',
        matchedLead: null,
        matchedTransaction: null
      };
    }

    let context = `NEW TRANSACTION TO CHECK:\n`;
    context += `Description: "${newTransaction.description}"\n`;
    context += `Amount: R${newTransaction.amount}\n`;
    context += `Category: ${newTransaction.category}\n`;
    context += `Date: ${newTransaction.date || 'today'}\n`;
    
    context += `\nRECENT TRANSACTIONS (last 14 days):\n`;
    recentTransactions.forEach((transaction, index) => {
      const date = format(new Date(transaction.createdAt), 'yyyy-MM-dd');
      context += `${index + 1}. "${transaction.description}" R${transaction.amount} (${transaction.category}) - ${date}\n`;
    });

    const prompt = PromptFactory.getFinanceDuplicateDetectionPrompt(this.getProviderName());
    
    try {
      const detection = await this.processAIRequest<DuplicateDetection>(
        prompt,
        context,
        DuplicateDetectionSchema,
        userId,
        'FinanceDuplicateDetection'
      );

      return detection;
    } catch (error) {
      log.error('Finance duplicate detection failed, defaulting to UNIQUE', { error, userId });
      return {
        result: 'UNIQUE',
        confidence: 0.5,
        reasoning: 'AI detection failed, assuming unique to be safe',
        matchedLead: null,
        matchedTransaction: null
      };
    }
  }

  // 🎯 Add transaction with duplicate detection
  private async addTransaction(userId: string, transactionData: FinanceUpdate['transaction']) {
    if (!transactionData || !transactionData.description || transactionData.amount === undefined) {
      throw new Error('Invalid transaction data');
    }

    // Check for duplicates
    const duplicateCheck = await this.checkForTransactionDuplicate(userId, transactionData);

    if (duplicateCheck.result === 'DUPLICATE' && duplicateCheck.matchedTransaction) {
      const similarTransactions = await this.findSimilarTransactions(userId, duplicateCheck.matchedTransaction);
      
      await ConfirmationService.storePendingConfirmation(userId, 'finance', {
        type: 'transaction_duplicate',
        proposedTransaction: {
          description: transactionData.description,
          amount: transactionData.amount,
          category: transactionData.category!,
          babylonPrinciple: transactionData.babylonPrinciple,
          date: transactionData.date
        },
        duplicateCheck,
        similarTransactions
      });

      return {
        action: 'duplicate_confirmation',
        duplicateCheck,
        needsConfirmation: true,
        message: this.formatTransactionDuplicateConfirmation(duplicateCheck, transactionData)
      };
    }

    // Create new transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        description: transactionData.description,
        amount: transactionData.amount,
        category: transactionData.category!,
        babylonPrinciple: transactionData.babylonPrinciple || undefined,
        date: transactionData.date ? new Date(transactionData.date) : undefined,
      },
    });

    return { 
      action: 'add_transaction', 
      transaction,
      duplicateCheck 
    };
  }

  private formatTransactionDuplicateConfirmation(duplicateCheck: DuplicateDetection, proposedTransaction: FinanceUpdate['transaction']): string {
    let message = `🤔 **Potential Duplicate Transaction!**\n\n`;
    message += `I found a similar transaction: **${duplicateCheck.matchedTransaction}**\n`;
    message += `📊 Confidence: ${Math.round(duplicateCheck.confidence * 100)}%\n`;
    message += `💭 Reasoning: ${duplicateCheck.reasoning}\n\n`;
    
    message += `**What you wanted to add:**\n`;
    message += `💰 **${proposedTransaction?.description}** R${proposedTransaction?.amount}\n`;
    message += `📁 Category: ${proposedTransaction?.category}\n`;
    
    message += `\n**What would you like to do?**\n`;
    message += `• Reply **"yes"** - Add as new transaction anyway\n`;
    message += `• Reply **"update"** - Update the existing transaction instead\n`;
    message += `• Reply **"show"** - Show me more details about the existing transaction\n`;
    message += `• Reply **"cancel"** - Cancel this action`;
    
    return message;
  }

  private async findSimilarTransactions(userId: string, description: string) {
    return await prisma.transaction.findMany({
      where: {
        userId,
        description: { contains: description, mode: 'insensitive' }
      },
      orderBy: { createdAt: 'desc' },
      take: 3
    });
  }

  private async executePendingAction(
    userId: string, 
    action: 'add_new' | 'update_existing', 
    pendingConfirmation: any, 
    targetIndex?: number
  ): Promise<string> {
    try {
      const { proposedTransaction, similarTransactions, duplicateCheck } = pendingConfirmation;
      
      if (!proposedTransaction) {
        return "❌ Invalid confirmation data. Please try again.";
      }
      
      if (action === 'add_new') {
        const transaction = await prisma.transaction.create({
          data: {
            userId,
            description: proposedTransaction.description,
            amount: proposedTransaction.amount,
            category: proposedTransaction.category,
            babylonPrinciple: proposedTransaction.babylonPrinciple || undefined,
            date: proposedTransaction.date ? new Date(proposedTransaction.date) : undefined,
          },
        });

        await ConfirmationService.clearPendingConfirmation(userId, 'finance');
        
        return `✅ **Added new transaction: ${transaction.description}** R${transaction.amount}\n\n💡 *You chose to add as separate from similar transaction*`;
        
      } else if (action === 'update_existing') {
        if (!similarTransactions || similarTransactions.length === 0) {
          return "❌ No similar transactions found to update.";
        }
        
        const targetTransaction = similarTransactions[targetIndex || 0];
        if (!targetTransaction) {
          return "❌ Could not find the transaction to update. Please try again.";
        }

        const updatedTransaction = await prisma.transaction.update({
          where: { id: targetTransaction.id },
          data: {
            description: proposedTransaction.description || targetTransaction.description,
            amount: proposedTransaction.amount !== undefined ? proposedTransaction.amount : targetTransaction.amount,
            category: proposedTransaction.category || targetTransaction.category,
            babylonPrinciple: proposedTransaction.babylonPrinciple || targetTransaction.babylonPrinciple,
            date: proposedTransaction.date ? new Date(proposedTransaction.date) : targetTransaction.date,
          },
        });

        await ConfirmationService.clearPendingConfirmation(userId, 'finance');
        
        return `✅ **Updated existing transaction: ${updatedTransaction.description}** R${updatedTransaction.amount}\n\n💡 *Merged with previous transaction as requested*`;
      }

      return "❌ Unknown action. Please try again.";
      
    } catch (error) {
      await ConfirmationService.clearPendingConfirmation(userId, 'finance');
      return "❌ Something went wrong. Please try adding the transaction again.";
    }
  }

  private async showTransactionDetails(userId: string, pendingConfirmation: any, targetIndex: number): Promise<string> {
    const { similarTransactions } = pendingConfirmation;
    
    if (!similarTransactions || similarTransactions.length === 0) {
      return "❌ No similar transactions found.";
    }
    
    const targetTransaction = similarTransactions[targetIndex];
    if (!targetTransaction) {
      return "❌ Could not find transaction details.";
    }

    const date = new Date(targetTransaction.createdAt).toLocaleDateString();
    
    let response = `💰 **Transaction Details:**\n`;
    response += `• Description: ${targetTransaction.description}\n`;
    response += `• Amount: R${targetTransaction.amount}\n`;
    response += `• Category: ${targetTransaction.category}\n`;
    response += `• Date: ${date}\n`;
    
    if (targetTransaction.babylonPrinciple) {
      response += `• Babylon Principle: ${targetTransaction.babylonPrinciple}\n`;
    }

    response += `\n💭 *Reply with 'update' to merge with this transaction, or 'yes' to add separately*`;
    
    return response;
  }

  // Continue with existing methods...
  private async getRecentTransactions(userId: string, limit: number = 5) {
    return await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  private async getMonthlyIncome(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const income = await prisma.transaction.aggregate({
      where: {
        userId,
        category: 'Income',
        createdAt: { gte: thirtyDaysAgo }
      },
      _sum: { amount: true }
    });

    return income._sum.amount || 0;
  }

  private async getMonthlyExpenses(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const expenses = await prisma.transaction.aggregate({
      where: {
        userId,
        category: { in: ['Fixed Expenses', 'Variable Expenses', 'Debt Payment'] },
        createdAt: { gte: thirtyDaysAgo }
      },
      _sum: { amount: true }
    });

    return Math.abs(expenses._sum.amount || 0);
  }

  private async updateAccount(userId: string, accountData: FinanceUpdate['account']) {
    if (!accountData || !accountData.name) {
      throw new Error('Invalid account data');
    }

    const account = await prisma.account.upsert({
      where: {
        userId_name: { userId, name: accountData.name }
      },
      update: {
        currentBalance: accountData.currentBalance || 0,
        targetAmount: accountData.targetAmount || undefined,
        type: accountData.type || 'Asset'
      },
      create: {
        userId,
        name: accountData.name,
        type: accountData.type || 'Asset',
        currentBalance: accountData.currentBalance || 0,
        targetAmount: accountData.targetAmount || undefined,
      },
    });

    return { action: 'update_account', account };
  }

  private async deleteTransaction(userId: string, transactionData: FinanceUpdate['transaction']) {
    if (!transactionData || !transactionData.id) {
      throw new Error('Transaction ID required for deletion');
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        userId,
        id: transactionData.id,
      },
    });

    if (!transaction) throw new Error('Transaction not found');

    await prisma.transaction.delete({
      where: { id: transaction.id },
    });

    return { action: 'delete_transaction', transaction };
  }

  private async deleteAccount(userId: string, accountData: FinanceUpdate['account']) {
    if (!accountData || (!accountData.id && !accountData.name)) {
      throw new Error('Account ID or name required for deletion');
    }

    const account = await prisma.account.findFirst({
      where: {
        userId,
        id: accountData.id || undefined,
        name: accountData.name || undefined,
      },
    });

    if (!account) throw new Error('Account not found');

    await prisma.account.delete({
      where: { id: account.id },
    });

    return { action: 'delete_account', account };
  }

  private async editTransaction(userId: string, transactionData: FinanceUpdate['transaction']) {
    if (!transactionData || !transactionData.id) {
      throw new Error('Transaction ID required for editing');
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        userId,
        id: transactionData.id,
      },
    });

    if (!transaction) throw new Error('Transaction not found');

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        description: transactionData.description || transaction.description,
        amount: transactionData.amount !== undefined ? transactionData.amount : transaction.amount,
        category: transactionData.category || transaction.category,
        babylonPrinciple: transactionData.babylonPrinciple || transaction.babylonPrinciple,
        date: transactionData.date ? new Date(transactionData.date) : transaction.date,
      },
    });

    return { action: 'edit_transaction', transaction: updatedTransaction };
  }

  private async getTimeline(userId: string, grouping: string = 'month') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'desc' }
    });

    return { action: 'timeline', transactions, grouping };
  }

  private async checkGoalProgress(userId: string) {
    const accounts = await prisma.account.findMany({
      where: { userId, targetAmount: { not: null } }
    });

    const goalProgress = accounts.map(account => ({
      name: account.name,
      current: account.currentBalance,
      target: account.targetAmount,
      progress: account.targetAmount ? Math.round((account.currentBalance / account.targetAmount) * 100) : 0,
      remaining: account.targetAmount ? account.targetAmount - account.currentBalance : 0
    }));

    return { action: 'check_goal', goalProgress };
  }

  private async getFinancialSummary(userId: string) {
    const [totalTransactions, monthlyIncome, monthlyExpenses, accounts, goalProgressResult, healthMetrics] = await Promise.all([
      prisma.transaction.count({ where: { userId } }),
      this.getMonthlyIncome(userId),
      this.getMonthlyExpenses(userId),
      prisma.account.findMany({ where: { userId } }),
      this.checkGoalProgress(userId),
      this.getFinancialHealthMetrics(userId)
    ]);

    return {
      action: 'summary',
      totalTransactions,
      monthlyIncome,
      monthlyExpenses,
      savingsRate: monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0,
      netWorth: healthMetrics.netWorth,
      totalAssets: healthMetrics.totalAssets,
      totalLiabilities: healthMetrics.totalLiabilities,
      goalProgress: goalProgressResult.goalProgress,
      accounts
    };
  }

  private formatResponse(result: any, update: FinanceUpdate): string {
    switch (result.action || update.action) {
      case 'add_transaction':
        return this.formatAddTransactionResponse(result, update);
      case 'duplicate_confirmation':
        return result.message;
      case 'progress_report':
        return this.formatFinanceProgressResponse(result);
      case 'conversation':
        return this.formatFinanceConversationResponse(result, update);
      case 'update_account':
        return this.formatUpdateAccountResponse(result, update);
      case 'summary':
        return this.formatFinanceSummaryResponse(result, update);
      default:
        return this.formatDefaultResponse(result, update);
    }
  }

  private formatFinanceProgressResponse(result: any): string {
    const { report, rawData } = result;
    
    let response = `💰 **Financial Health Report**\n\n`;
    
    // Babylon Score
    response += `🏛️ **Babylon Principles Score: ${rawData.babylonScore.overallScore}%**\n`;
    if (rawData.babylonScore.strengths.length > 0) {
      response += `✅ Strengths: ${rawData.babylonScore.strengths.join(', ')}\n`;
    }
    if (rawData.babylonScore.improvements.length > 0) {
      response += `🎯 Areas to improve: ${rawData.babylonScore.improvements.join(', ')}\n`;
    }
    response += `\n`;
    
    // Financial Snapshot
    response += `📊 **Financial Snapshot:**\n`;
    response += `• Net Worth: R${rawData.snapshot.netWorth.toLocaleString()}\n`;
    response += `• Assets: R${rawData.snapshot.totalAssets.toLocaleString()}\n`;
    response += `• Emergency Fund: ${rawData.snapshot.emergencyFundMonths} months coverage\n`;
    response += `• Investment Allocation: ${rawData.snapshot.investmentPercentage}%\n\n`;
    
    // Savings Trend
    const latestTrend = rawData.trends[rawData.trends.length - 1];
    if (latestTrend) {
      response += `💹 **Latest Month Performance:**\n`;
      response += `• Income: R${latestTrend.income.toLocaleString()}\n`;
      response += `• Expenses: R${latestTrend.expenses.toLocaleString()}\n`;
      response += `• Savings: R${latestTrend.savings.toLocaleString()}\n`;
      response += `• Savings Rate: ${latestTrend.savingsRate}%\n\n`;
    }
    
    // Goal Progress
    if (rawData.goals.length > 0) {
      response += `🎯 **Savings Goals Progress:**\n`;
      rawData.goals.forEach((goal: any) => {
        response += `• ${goal.name}: ${goal.progress}% (R${goal.current.toLocaleString()} / R${goal.target.toLocaleString()})\n`;
      });
      response += `\n`;
    }
    
    // AI Insights
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
    
    return response;
  }

  private formatAddTransactionResponse(result: any, update: FinanceUpdate): string {
    let response = update.contextualOpening || '';
    
    if (result.transaction) {
      response += `\n\n💰 **Transaction recorded**: ${result.transaction.description} R${result.transaction.amount}`;
      if (result.transaction.category) {
        response += `\n📁 Category: ${result.transaction.category}`;
      }
      if (result.transaction.babylonPrinciple) {
        response += `\n🏛️ Principle: ${result.transaction.babylonPrinciple}`;
      }
    }

    if (result.duplicateCheck && result.duplicateCheck.result === 'UNIQUE') {
      response += `\n\n🧠 **AI confirmed unique transaction** (${Math.round(result.duplicateCheck.confidence * 100)}% confidence)`;
    }

    return this.formatWithExtras(response, update);
  }

  private formatFinanceConversationResponse(result: any, update: FinanceUpdate): string {
    let response = result.response || update.contextualOpening || '';

    if (result.userData) {
      if (result.userData.totalTransactions === 0) {
        response += `\n\n💡 *Ready to start tracking your finances? Try telling me about a recent expense or income.*`;
      } else if (result.userData.savingsRate > 15) {
        response += `\n\n🎉 *You're doing amazing with a ${result.userData.savingsRate}% savings rate!*`;
      } else if (result.userData.savingsRate < 5) {
        response += `\n\n💪 *There's room to improve your savings rate. The Babylonians recommend saving at least 10%.*`;
      }
      
      if (result.userData.netWorth > 0) {
        response += `\n\n💎 *Your positive net worth of R${result.userData.netWorth.toLocaleString()} shows good financial health!*`;
      }
    }

    return this.formatWithExtras(response, update);
  }

  private formatUpdateAccountResponse(result: any, update: FinanceUpdate): string {
    let response = update.contextualOpening || '';
    
    if (result.account) {
      response += `\n\n🏦 **Account updated**: ${result.account.name}`;
      if (result.account.currentBalance !== undefined) {
        response += `\n💰 Balance: R${result.account.currentBalance}`;
      }
      if (result.account.targetAmount) {
        const progress = Math.round((result.account.currentBalance / result.account.targetAmount) * 100);
        response += `\n🎯 Progress: ${progress}% of R${result.account.targetAmount} goal`;
      }
    }

    return this.formatWithExtras(response, update);
  }

  private formatFinanceSummaryResponse(result: any, update: FinanceUpdate): string {
    let response = update.contextualOpening || '';
    
    response += `\n\n📈 **Financial Summary:**
• Net Worth: R${result.netWorth.toLocaleString()}
• Monthly Income: R${result.monthlyIncome.toLocaleString()}
• Monthly Expenses: R${result.monthlyExpenses.toLocaleString()}
• Savings Rate: ${result.savingsRate}%
• Active Goals: ${result.goalProgress?.length || 0}
• Total Transactions: ${result.totalTransactions}`;
        
    if (result.accounts?.length > 0) {
      response += `\n\n💳 **Accounts:**`;
      result.accounts.forEach((account: any) => {
        response += `\n• ${account.name}: R${account.currentBalance.toLocaleString()}`;
      });
    }

    return this.formatWithExtras(response, update);
  }

  private formatDefaultResponse(result: any, update: FinanceUpdate): string {
    let response = update.contextualOpening || '';
    
    switch (result.action) {
      case 'delete_transaction':
        response += `\n\n🗑️ **Transaction deleted**: ${result.transaction?.description}`;
        break;
      case 'edit_transaction':
        response += `\n\n✏️ **Transaction updated**: ${result.transaction?.description} R${result.transaction?.amount}`;
        break;
      case 'timeline':
        response += `\n\n📅 **Recent Financial Activity:**\n`;
        if (result.transactions?.length > 0) {
          result.transactions.slice(0, 10).forEach((transaction: any) => {
            const date = new Date(transaction.date || transaction.createdAt).toLocaleDateString();
            const amount = transaction.amount > 0 ? `+R${transaction.amount}` : `-R${Math.abs(transaction.amount)}`;
            response += `• ${date}: ${transaction.description} ${amount}\n`;
          });
        } else {
          response += `No recent transactions found.`;
        }
        break;
      case 'check_goal':
        response += `\n\n📊 **Goal Progress:**\n`;
        if (result.goalProgress?.length > 0) {
          result.goalProgress.forEach((goal: any) => {
            response += `• ${goal.name}: ${goal.progress}% (R${goal.current} / R${goal.target})\n`;
            if (goal.remaining > 0) {
              response += `  Still need: R${goal.remaining}\n`;
            }
          });
        } else {
          response += `No active savings goals. Want to set one up?`;
        }
        break;
      default:
        response += `\n\nAction completed successfully.`;
    }

    return this.formatWithExtras(response, update);
  }

  private formatWithExtras(response: string, update: FinanceUpdate): string {
    if (update.babylonWisdom) {
      response += `\n\n🏛️ **Babylon Wisdom:** ${update.babylonWisdom}`;
    }

    if (update.suggestions?.length) {
      response += '\n\n💡 **AI Suggestions:**\n';
      update.suggestions.forEach((s, i) => {
        response += `${i + 1}. ${s.action}\n   *${s.reason}*\n`;
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
}

