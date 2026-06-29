import { Router } from 'express';
import * as adminController from '../controllers/AdminController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/role';
import { validate } from '../middlewares/validate';
import { upload } from '../middlewares/multer';
import {
  updateWalletBalanceSchema,
  processDepositSchema,
  rejectDepositSchema,
  resolveDisputeSchema,
  resolveAIReviewSchema,
} from '../validators/adminValidator';

const router = Router();

// Protect all admin endpoints
router.use(protect);
router.use(restrictTo('ADMIN', 'SUPPORT'));

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:id/status', adminController.updateUserStatus);
router.post('/wallet/adjust', validate(updateWalletBalanceSchema), adminController.updateWalletBalance);

router.get('/deposits', adminController.getDepositRequests);
router.post('/deposits/:id/approve', validate(processDepositSchema), adminController.approveDepositRequest);
router.post('/deposits/:id/reject', validate(rejectDepositSchema), adminController.rejectDepositRequest);

router.get('/withdrawals', adminController.getWithdrawalRequests);
router.post('/withdrawals/:id/approve', adminController.approveWithdrawalRequest);
router.post('/withdrawals/:id/reject', validate(rejectDepositSchema), adminController.rejectWithdrawalRequest);

router.post('/battles/:id/resolve-dispute', validate(resolveDisputeSchema), adminController.resolveBattleDispute);

// AI Verification Reviews
router.get('/pending-ai-reviews', adminController.getPendingAIReviews);
router.post('/resolve-ai-review', validate(resolveAIReviewSchema), adminController.resolveAIReview);

// Banners & Announcements
router.post('/banners', upload.single('banner'), adminController.createBanner);
router.post('/announcements', adminController.createAnnouncement);

// Global settings
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);

// Referral Analytics & logs
router.get('/referral-analytics', adminController.getReferralAnalytics);
router.get('/referral-top', adminController.getTopReferrers);
router.get('/referral-earnings', adminController.getReferralEarnings);

// New detailed statistics & dashboards
router.get('/stats-financial', adminController.getFinancialStats);
router.get('/users-detailed', adminController.getUsersDetailed);
router.get('/battles', adminController.getBattles);
router.get('/transactions', adminController.getTransactions);
router.get('/screenshots', adminController.getScreenshots);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/reports', adminController.getReports);
router.post('/send-notification', adminController.sendGlobalNotification);

export default router;


