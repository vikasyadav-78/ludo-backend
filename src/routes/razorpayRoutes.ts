import { Router } from 'express';
import * as razorpayController from '../controllers/RazorpayController';
import { protect } from '../middlewares/auth';

const router = Router();

// All Razorpay routes require user authentication
router.use(protect);

router.post('/order', razorpayController.createOrder);
router.post('/verify', razorpayController.verifyPayment);

export default router;
