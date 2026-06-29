import { Response, NextFunction } from 'express';
import adminService from '../services/AdminService';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';

export const getDashboardStats = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const stats = await adminService.getDashboardStats();
  res.status(200).json({
    status: 'success',
    data: stats,
  });
});

export const getUsers = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const users = await adminService.getUsers();
  res.status(200).json({
    status: 'success',
    data: { users },
  });
});

export const updateUserStatus = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  const { status } = req.body; // ACTIVE or SUSPENDED
  await adminService.updateUserStatus(id, status);
  await adminService.logAdminAction(adminId, `Updated user status of user ID: ${id} to ${status}`);
  res.status(200).json({
    status: 'success',
    message: `User status updated to ${status}`,
  });
});

export const updateWalletBalance = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { userId, amount, balanceType, type } = req.body;
  await adminService.updateWalletBalance(adminId, userId, { amount, balanceType, type });
  await adminService.logAdminAction(adminId, `Adjusted wallet for user ID: ${userId}. Type: ${type}, Amount: ₹${amount}, BalanceType: ${balanceType}`);
  res.status(200).json({
    status: 'success',
    message: 'Wallet balance updated successfully',
  });
});

export const getDepositRequests = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const deposits = await adminService.getDepositRequests();
  res.status(200).json({
    status: 'success',
    data: { deposits },
  });
});

export const approveDepositRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  await adminService.approveDepositRequest(adminId, id);
  await adminService.logAdminAction(adminId, `Approved manual deposit request ID: ${id}`);
  res.status(200).json({
    status: 'success',
    message: 'Deposit approved and wallet credited',
  });
});

export const rejectDepositRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  const { reason } = req.body;
  await adminService.rejectDepositRequest(adminId, id, reason);
  await adminService.logAdminAction(adminId, `Rejected manual deposit request ID: ${id}. Reason: ${reason}`);
  res.status(200).json({
    status: 'success',
    message: 'Deposit request rejected',
  });
});

export const getWithdrawalRequests = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const withdrawals = await adminService.getWithdrawalRequests();
  res.status(200).json({
    status: 'success',
    data: { withdrawals },
  });
});

export const approveWithdrawalRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  await adminService.approveWithdrawalRequest(adminId, id);
  await adminService.logAdminAction(adminId, `Approved withdrawal request ID: ${id}`);
  res.status(200).json({
    status: 'success',
    message: 'Withdrawal approved successfully',
  });
});

export const rejectWithdrawalRequest = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  const { reason } = req.body;
  await adminService.rejectWithdrawalRequest(adminId, id, reason);
  await adminService.logAdminAction(adminId, `Rejected withdrawal request ID: ${id}. Reason: ${reason}`);
  res.status(200).json({
    status: 'success',
    message: 'Withdrawal request rejected and refunded',
  });
});

export const resolveBattleDispute = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { id } = req.params;
  const { decision } = req.body; // CREATOR_WIN, JOINER_WIN, or CANCEL
  await adminService.resolveBattleDispute(adminId, id, decision);
  await adminService.logAdminAction(adminId, `Resolved battle dispute for battle ID: ${id}. Decision: ${decision}`);
  res.status(200).json({
    status: 'success',
    message: 'Battle dispute resolved successfully',
  });
});

export const createBanner = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  if (!req.file) {
    throw new AppError('Banner image is required', 400);
  }
  const cloudResult = await uploadBufferToCloudinary(req.file.buffer, 'banners');
  const banner = await adminService.createBanner(cloudResult.secure_url, req.body.title, req.body.link);
  await adminService.logAdminAction(adminId, `Uploaded new promotional banner: "${req.body.title || 'Untitled'}"`);
  res.status(201).json({
    status: 'success',
    data: { banner },
  });
});

export const createAnnouncement = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const announcement = await adminService.createAnnouncement(adminId, req.body.message);
  await adminService.logAdminAction(adminId, `Dispatched global dashboard announcement: "${req.body.message}"`);
  res.status(201).json({
    status: 'success',
    data: { announcement },
  });
});

export const getSettings = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const settings = await adminService.getSettings();
  res.status(200).json({
    status: 'success',
    data: { settings },
  });
});

export const updateSettings = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const settings = await adminService.updateSettings(req.body);
  await adminService.logAdminAction(adminId, `Updated global platform configuration settings`);
  res.status(200).json({
    status: 'success',
    message: 'Admin settings updated successfully',
    data: { settings },
  });
});

export const getReferralAnalytics = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const analytics = await adminService.getReferralAnalytics();
  res.status(200).json({
    status: 'success',
    data: { analytics },
  });
});

export const getTopReferrers = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const topReferrers = await adminService.getTopReferrers();
  res.status(200).json({
    status: 'success',
    data: { topReferrers },
  });
});

export const getReferralEarnings = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const earningsList = await adminService.getReferralEarningsList();
  res.status(200).json({
    status: 'success',
    data: { earningsList },
  });
});

export const getPendingAIReviews = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const reviews = await adminService.getPendingAIReviews();
  res.status(200).json({
    status: 'success',
    data: { reviews },
  });
});

export const resolveAIReview = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  const { battleId, decision, winnerId, adminNotes } = req.body;
  await adminService.resolveAIReview(adminId, battleId, decision, winnerId, adminNotes);
  await adminService.logAdminAction(adminId, `Resolved AI review for battle ID: ${battleId}. Decision: ${decision}`);
  res.status(200).json({
    status: 'success',
    message: 'AI Review resolved successfully',
  });
});

export const getFinancialStats = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const stats = await adminService.getFinancialStats();
  res.status(200).json({
    status: 'success',
    data: stats,
  });
});

export const getUsersDetailed = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const users = await adminService.getUsersDetailed();
  res.status(200).json({
    status: 'success',
    data: { users },
  });
});

export const getBattles = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const battles = await adminService.getBattlesDetailed();
  res.status(200).json({
    status: 'success',
    data: { battles },
  });
});

export const getTransactions = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const transactions = await adminService.getTransactionsDetailed();
  res.status(200).json({
    status: 'success',
    data: { transactions },
  });
});

export const getScreenshots = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const screenshots = await adminService.getScreenshotsDetailed();
  res.status(200).json({
    status: 'success',
    data: { screenshots },
  });
});

export const getAuditLogs = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const auditLogs = await adminService.getAuditLogs();
  res.status(200).json({
    status: 'success',
    data: { auditLogs },
  });
});

export const sendGlobalNotification = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const adminId = req.user!.id;
  await adminService.sendGlobalNotification(adminId, req.body);
  await adminService.logAdminAction(adminId, `Sent global notification broadcast: "${req.body.title}"`);
  res.status(200).json({
    status: 'success',
    message: 'Global notifications sent successfully',
  });
});

export const getReports = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const financialStats = await adminService.getFinancialStats();
  const users = await adminService.getUsersDetailed();
  const battles = await adminService.getBattlesDetailed();
  const screenshots = await adminService.getScreenshotsDetailed();
  const transactions = await adminService.getTransactionsDetailed();
  const auditLogs = await adminService.getAuditLogs();

  res.status(200).json({
    status: 'success',
    data: {
      financialStats,
      users,
      battles,
      screenshots,
      transactions,
      auditLogs
    }
  });
});


