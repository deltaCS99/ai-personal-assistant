// ===============================
// src/lib/types/common.ts
// ===============================

import { z } from 'zod';

// 🎯 Duplicate Detection Schemas
export const DuplicateDetectionSchema = z.object({
  result: z.enum(['DUPLICATE', 'UNIQUE']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  matchedLead: z.string().nullable(),
  matchedTransaction: z.string().nullable().optional()
});

export type DuplicateDetection = z.infer<typeof DuplicateDetectionSchema>;

// 🎯 Confirmation Action Schema (for handling user confirmations)
export const ConfirmationActionSchema = z.object({
  action: z.enum(['confirm_create', 'confirm_update', 'cancel', 'show_details']),
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  reasoning: z.string().optional()
});

export type ConfirmationAction = z.infer<typeof ConfirmationActionSchema>;

export const ProgressReportSchema = z.object({
  type: z.enum(['sales', 'finance']),
  summary: z.string(),
  metrics: z.record(z.any()),
  insights: z.array(z.string()),
  recommendations: z.array(z.object({
    action: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
    expectedImpact: z.string()
  })),
  trends: z.object({
    positive: z.array(z.string()),
    concerning: z.array(z.string()),
    neutral: z.array(z.string())
  }),
  nextSteps: z.array(z.string())
});

export type ProgressReport = z.infer<typeof ProgressReportSchema>;