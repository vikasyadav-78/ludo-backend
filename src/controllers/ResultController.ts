import { Response, NextFunction } from 'express';
import resultService from '../services/ResultService';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import aiVerificationService from '../services/AIVerificationService';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';

export const submitResult = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { battleId, status } = req.body; // status is WIN, LOSS, or CANCEL

  if (!battleId || !status) {
    throw new AppError('battleId and status are required', 400);
  }

  let screenshotUrl = '';
  let screenshotPublicId = '';
  if (req.file) {
    const cloudResult = await uploadBufferToCloudinary(req.file.buffer, 'battle_results');
    screenshotUrl = cloudResult.secure_url;
    screenshotPublicId = cloudResult.public_id;
  }

  const result = await resultService.submitResult(userId, battleId, status, screenshotUrl, screenshotPublicId);

  // Trigger background AI verification asynchronously if both players have submitted
  if (result.triggerAI) {
    aiVerificationService.verifyBattleResult(battleId);
  }

  res.status(200).json({
    status: 'success',
    data: {
      message: result.message
    },
  });
});
export default submitResult;
