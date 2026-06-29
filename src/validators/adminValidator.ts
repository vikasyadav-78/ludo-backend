import { z } from 'zod';

export const updateWalletBalanceSchema = z.object({
  body: z.object({
    userId: z.string(),
    amount: z.number().refine((val) => val !== 0, 'Amount cannot be zero'),
    balanceType: z.enum(['DEPOSIT', 'WINNING', 'BONUS']),
    type: z.enum(['credit', 'debit']),
  }),
});

export const processDepositSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

export const rejectDepositSchema = z.object({
  body: z.object({
    reason: z.string().min(3, 'Rejection reason is required'),
  }),
});

export const resolveDisputeSchema = z.object({
  body: z.object({
    decision: z.enum(['CREATOR_WIN', 'JOINER_WIN', 'CANCEL']),
  }),
});

export const resolveAIReviewSchema = z.object({
  body: z.object({
    battleId: z.string(),
    decision: z.enum(['APPROVE_AI_WINNER', 'MANUAL_SETTLE', 'MANUAL_REFUND', 'REJECT']),
    winnerId: z.string().optional(),
    adminNotes: z.string().optional(),
  }),
});

