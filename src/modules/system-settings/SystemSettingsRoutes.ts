import { Router } from 'express';
import * as controller from './SystemSettingsController';
import { protect } from '../../middlewares/auth';
import { restrictTo } from '../../middlewares/role';

const router = Router();

// Public settings route: GET /api/v1/system-settings/public
router.get('/public', controller.getPublicSettings);

// Admin settings routes: GET/PUT /api/v1/system-settings/admin
router.get('/admin', protect, restrictTo('ADMIN'), controller.getSettings);
router.put('/admin', protect, restrictTo('ADMIN'), controller.updateSettings);

export default router;
