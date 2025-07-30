// ===============================
// src/lib/types/user.ts
// ===============================
import { z } from 'zod';

export const UserServiceSchema = z.enum(['sales', 'finance']);
export const PlatformSchema = z.enum(['telegram', 'whatsapp', 'sms']);

export const CreateUserSchema = z.object({
  platform: PlatformSchema,
  platformId: z.string(),
  services: z.array(UserServiceSchema),
  name: z.string().optional(),
  phone: z.string().optional(),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UserService = z.infer<typeof UserServiceSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
