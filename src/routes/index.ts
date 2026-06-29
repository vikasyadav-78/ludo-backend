import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import walletRoutes from './walletRoutes';
import battleRoutes from './battleRoutes';
import supportRoutes from './supportRoutes';
import adminRoutes from './adminRoutes';
import razorpayRoutes from './razorpayRoutes';
import { checkMaintenance } from '../middlewares/maintenance';
import systemSettingsRoutes from '../modules/system-settings/SystemSettingsRoutes';
import * as systemSettingsController from '../modules/system-settings/SystemSettingsController';
import { protect } from '../middlewares/auth';
import { restrictTo } from '../middlewares/role';

const router = Router();

// Apply global maintenance filter
router.use(checkMaintenance);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/wallets', walletRoutes);
router.use('/battles', battleRoutes);
router.use('/support', supportRoutes);
router.use('/admin', adminRoutes);
router.use('/razorpay', razorpayRoutes);
router.use('/system-settings', systemSettingsRoutes);

// Explicitly register /admin/system-settings and /admin/system-settings PUT
router.get('/admin/system-settings', protect, restrictTo('ADMIN'), systemSettingsController.getSettings);
router.put('/admin/system-settings', protect, restrictTo('ADMIN'), systemSettingsController.updateSettings);

export default router;
