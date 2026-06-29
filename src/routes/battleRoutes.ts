import { Router } from 'express';
import * as battleController from '../controllers/BattleController';
import { submitResult } from '../controllers/ResultController';
import { protect } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { upload } from '../middlewares/multer';
import { createBattleSchema, submitResultSchema } from '../validators/battleValidator';

const router = Router();

router.use(protect);

router.post('/', validate(createBattleSchema), battleController.createBattle);
router.post('/:id/join', battleController.joinBattle);
router.post('/:id/cancel', battleController.cancelBattle);

router.get('/open', battleController.getOpenBattles);
router.get('/active', battleController.getActiveBattles);
router.get('/completed', battleController.getCompletedBattles);
router.get('/history', battleController.getBattleHistory);
router.get('/:id', battleController.getBattleDetails);

// Result submission endpoint
router.post('/submit-result', upload.single('screenshot'), validate(submitResultSchema), submitResult);
router.post('/:id/invite-code', battleController.setInviteCode);

export default router;
