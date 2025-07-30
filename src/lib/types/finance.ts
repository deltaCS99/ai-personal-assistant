// ===============================
// src/lib/types/finance.ts
// ===============================
import { z } from 'zod';

export const TransactionCategorySchema = z.enum([
  'Income', 'Fixed Expenses', 'Variable Expenses',
  'Savings', 'Investment', 'Debt Payment'
]);

export const BabylonPrincipleSchema = z.enum([
  'Pay Self First', 'Control Spending', 'Make Money Work',
  'Guard Against Loss', 'Own Home', 'Plan Future', 'Increase Earning'
]);

export const AccountTypeSchema = z.enum([
  'Asset', 'Liability', 'Investment', 'Emergency Fund'
]);

export const TransactionSchema = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  category: TransactionCategorySchema.optional(),
  babylonPrinciple: BabylonPrincipleSchema.optional(),
  date: z.string().optional()
});

export const AccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: AccountTypeSchema.optional(),
  currentBalance: z.number().optional(),
  targetAmount: z.number().optional()
});

export const FinanceUpdateSchema = z.object({
  contextualOpening: z.string().optional(),
  action: z.enum(['add_transaction', 'update_account', 'check_goal', 'summary', 'delete_transaction', 'delete_account', 'timeline', 'edit_transaction', 'conversation']),
  transaction: TransactionSchema.optional(),
  account: AccountSchema.optional(),
  babylonWisdom: z.string().optional(),
  suggestions: z.array(z.object({
    action: z.string(),
    reason: z.string()
  })).optional(),
  smartAdvice: z.array(z.string()).optional(),
  grouping: z.enum(['week', 'month']).optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationAction: z.enum(['add_new', 'update_existing', 'show_details']).optional(),
  confirmationTarget: z.string().optional()
});

export type FinanceUpdate = z.infer<typeof FinanceUpdateSchema>;
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>;
export type BabylonPrinciple = z.infer<typeof BabylonPrincipleSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Account = z.infer<typeof AccountSchema>;