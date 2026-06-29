import { Router } from 'express';
import * as supportController from '../controllers/SupportController';
import { protect } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { upload } from '../middlewares/multer';
import { createTicketSchema, replyMessageSchema } from '../validators/supportValidator';

const router = Router();

router.use(protect);

router.post('/tickets', validate(createTicketSchema), supportController.createTicket);
router.get('/tickets', supportController.getMyTickets);
router.get('/tickets/:id', supportController.getTicketDetails);
router.post('/tickets/:id/reply', upload.array('attachments', 3), validate(replyMessageSchema), supportController.replyToTicket);
router.post('/tickets/:id/close', supportController.closeTicket);

export default router;
