import { Response, NextFunction } from 'express';
import supportService from '../services/SupportService';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';

export const createTicket = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const ticket = await supportService.createTicket(userId, req.body);
  res.status(201).json({
    status: 'success',
    data: { ticket },
  });
});

export const getMyTickets = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const tickets = await supportService.getMyTickets(userId);
  res.status(200).json({
    status: 'success',
    data: { tickets },
  });
});

export const getTicketDetails = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const details = await supportService.getTicketDetails(userId, id);
  res.status(200).json({
    status: 'success',
    data: details,
  });
});

export const replyToTicket = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;
  const { message } = req.body;

  let attachments: string[] = [];
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      const cloudResult = await uploadBufferToCloudinary(file.buffer, 'support_attachments');
      attachments.push(cloudResult.secure_url);
    }
  }

  const msg = await supportService.replyToTicket(userId, role, id, message, attachments);

  res.status(201).json({
    status: 'success',
    data: { message: msg },
  });
});

export const closeTicket = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;
  await supportService.closeTicket(userId, id, role);

  res.status(200).json({
    status: 'success',
    message: 'Ticket closed successfully',
  });
});
