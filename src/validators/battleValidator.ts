import { z } from 'zod';

export const createBattleSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    amount: z.number().positive('Amount must be positive'),
    inviteCode: z.string().optional().nullable().refine(
      (val) => !val || /^\d{8}$/.test(val),
      { message: 'Invite code must be exactly 8 digits' }
    ),
  }),
});

export const submitResultSchema = z.object({
  body: z.object({
    battleId: z.string(),
    status: z.enum(['WIN', 'LOSS', 'CANCEL']),
  }),
});
