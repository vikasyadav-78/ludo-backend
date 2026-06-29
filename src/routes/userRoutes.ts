import { Router } from 'express';
import * as userController from '../controllers/UserController';
import { protect } from '../middlewares/auth';
import { upload } from '../middlewares/multer';

const router = Router();

router.use(protect);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.patch('/mobile', userController.changeMobile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.get('/referral-dashboard', userController.getReferralDashboard);
router.get('/leaderboard', userController.getLeaderboard);

export default router;
