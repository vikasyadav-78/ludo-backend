import { Router } from 'express';
import * as walletController from '../controllers/WalletController';
import { protect } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { upload } from '../middlewares/multer';
import { depositRequestSchema, withdrawalRequestSchema } from '../validators/walletValidator';

const router = Router();

router.use(protect);

router.get('/balance', walletController.getBalance);
router.get('/transactions', walletController.getTransactionHistory);
router.get('/deposits', walletController.getDepositHistory);
router.get('/withdrawals', walletController.getWithdrawalHistory);
router.get('/ledger', walletController.getWalletLedger);

router.post('/deposit-request', upload.single('screenshot'), validate(depositRequestSchema), walletController.createDepositRequest);
router.post('/withdrawal-request', validate(withdrawalRequestSchema), walletController.createWithdrawalRequest);
router.post('/withdrawal-request/:id/cancel', walletController.cancelWithdrawalRequest);

export default router;
