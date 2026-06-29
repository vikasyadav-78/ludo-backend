import { z } from 'zod';

export const depositRequestSchema = z.object({
  body: z.object({
    amount: z.string().transform((val) => parseFloat(val)).refine((val) => val > 0, 'Amount must be greater than 0'),
    transactionId: z.string().min(4, 'Transaction ID must be at least 4 characters'),
    paymentMethod: z.string().min(2, 'Payment method is required'),
  }),
});

export const withdrawalRequestSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    paymentMethod: z.string().min(2, 'Payment method is required'),
    paymentDetails: z.string().min(5, 'Payment details are required'),
  }),
});
