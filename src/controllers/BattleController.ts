import { Response, NextFunction } from 'express';
import battleService from '../services/BattleService';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import catchAsync from '../utils/catchAsync';

export const createBattle = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const battle = await battleService.createBattle(userId, req.body);
  res.status(201).json({
    status: 'success',
    data: { battle },
  });
});

export const joinBattle = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const battle = await battleService.joinBattle(userId, id);
  res.status(200).json({
    status: 'success',
    data: { battle },
  });
});

export const cancelBattle = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { id } = req.params;
  await battleService.cancelBattle(userId, id);
  res.status(200).json({
    status: 'success',
    message: 'Battle cancelled successfully and entry fee refunded',
  });
});

export const getBattleDetails = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const battle = await battleService.getBattleDetails(id);
  res.status(200).json({
    status: 'success',
    data: { battle },
  });
});

export const getOpenBattles = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const battles = await battleService.getOpenBattles();
  res.status(200).json({
    status: 'success',
    data: { battles },
  });
});

export const getActiveBattles = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const battles = await battleService.getActiveBattles();
  res.status(200).json({
    status: 'success',
    data: { battles },
  });
});

export const getCompletedBattles = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const battles = await battleService.getCompletedBattles();
  res.status(200).json({
    status: 'success',
    data: { battles },
  });
});

export const getBattleHistory = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const battles = await battleService.getBattleHistory(userId);
  res.status(200).json({
    status: 'success',
    data: { battles },
  });
});

export const setInviteCode = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { inviteCode } = req.body;
  const battle = await battleService.setInviteCode(userId, id, inviteCode);
  res.status(200).json({
    status: 'success',
    data: { battle },
  });
});
