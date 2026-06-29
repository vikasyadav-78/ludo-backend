import { z } from 'zod';

export const createTicketSchema = z.object({
  body: z.object({
    title: z.string().min(4, 'Title must be at least 4 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    category: z.enum(['PAYMENT', 'BATTLE', 'TECHNICAL', 'OTHER']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('LOW'),
  }),
});

export const replyMessageSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'Message cannot be empty'),
  }),
});
