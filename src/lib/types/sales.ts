// ===============================
// src/lib/types/sales.ts - UPDATED
// ===============================
import { z } from 'zod';

export const LeadStatus = z.enum([
  'New', 'Contacted', 'Replied', 'Interested',
  'Waiting', 'Proposal Sent', 'Closed - Won', 'Closed - Lost'
]);

export const LeadUpdateSchema = z.object({
  action: z.enum(['create', 'update', 'query', 'summary', 'delete', 'view', 'conversation']),
  contextualOpening: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  updates: z.object({
    contacted: z.boolean().optional(),
    replied: z.boolean().optional(),
    interested: z.boolean().optional(),
    status: LeadStatus.optional(),
    nextStep: z.string().optional(),
    nextFollowup: z.string().optional(),
    notes: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  suggestions: z.array(z.object({
    type: z.enum(['next_step', 'followup_timing', 'followup_action']),
    suggestion: z.string(),
    reason: z.string(),
    priority: z.enum(['high', 'medium', 'low'])
  })).optional(),
  salesWisdom: z.string().optional(),
  smartAdvice: z.array(z.string()).optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationAction: z.enum(['create_new', 'update_existing', 'show_details']).optional(),
  confirmationTarget: z.string().optional()
});

export type LeadUpdate = z.infer<typeof LeadUpdateSchema>;
export type LeadStatusType = z.infer<typeof LeadStatus>;