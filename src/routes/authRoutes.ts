import { Router } from 'express';
import * as authController from '../controllers/AuthController';
import { protect } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { authLimiter, otpLimiter } from '../middlewares/rateLimiter';
import {
  registerSendOtpSchema,
  registerVerifyOtpSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetPasswordMobileSchema,
} from '../validators/authValidator';

const router = Router();

router.post('/register-send-otp', otpLimiter, validate(registerSendOtpSchema), authController.registerSendOtp);
router.post('/register-verify-otp', authLimiter, validate(registerVerifyOtpSchema), authController.registerVerifyOtp);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
router.post('/reset-password-mobile', validate(resetPasswordMobileSchema), authController.resetPasswordMobile);

// Protected routes
router.use(protect);
router.post('/change-password', validate(changePasswordSchema), authController.changePassword);
router.post('/logout', authController.logout);

export default router;
