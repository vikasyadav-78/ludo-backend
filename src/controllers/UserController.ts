import { Response, NextFunction } from 'express';
import userRepository from '../repositories/UserRepository';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import referralService from '../services/ReferralService';


export const getProfile = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  res.status(200).json({
    status: 'success',
    data: { user },
  });
});

export const updateProfile = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { name, email } = req.body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;

  if (email !== undefined && email !== req.user!.email) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError('Email already registered by another user', 400);
    }
    updateData.email = email;
  }

  const updatedUser = await userRepository.update(userId, updateData);

  res.status(200).json({
    status: 'success',
    data: { user: updatedUser },
  });
});

export const changeMobile = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const { mobile } = req.body;

  const existing = await userRepository.findByMobile(mobile);
  if (existing) {
    throw new AppError('Mobile number already registered by another user', 400);
  }

  const updatedUser = await userRepository.update(userId, { mobile });

  res.status(200).json({
    status: 'success',
    data: { user: updatedUser },
  });
});

export const uploadAvatar = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  if (!req.file) {
    throw new AppError('Please upload an image file', 400);
  }

  const cloudResult = await uploadBufferToCloudinary(req.file.buffer, 'avatars');

  const updatedUser = await userRepository.update(userId, { avatar: cloudResult.secure_url });

  res.status(200).json({
    status: 'success',
    data: { avatarUrl: cloudResult.secure_url, user: updatedUser },
  });
});

export const getReferralDashboard = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const stats = await referralService.getReferralDashboardStats(userId);
  res.status(200).json({
    status: 'success',
    data: stats,
  });
});
import prisma from '../database/db';

export const getLeaderboard = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // 1. Get top winners
  const topWinnersRaw = await prisma.battle.groupBy({
    by: ['winnerId'],
    where: {
      status: { in: ['COMPLETED', 'SETTLED'] },
      winnerId: { not: null }
    },
    _sum: { winnerAmount: true },
    _count: { id: true },
    orderBy: { _sum: { winnerAmount: 'desc' } },
    take: 10
  });

  const topWinners = [];
  let rank = 1;
  for (const item of topWinnersRaw) {
    if (!item.winnerId) continue;
    const user = await prisma.user.findUnique({
      where: { id: item.winnerId },
      select: { name: true, avatar: true }
    });
    if (user) {
      topWinners.push({
        rank: rank++,
        name: user.name,
        avatar: user.avatar || '',
        winnings: item._sum.winnerAmount || 0,
        wins: item._count.id || 0
      });
    }
  }

  // 2. Get top referrers
  const topReferrersRaw = await prisma.referral.groupBy({
    by: ['referrerId'],
    _count: { referredId: true },
    orderBy: { _count: { referredId: 'desc' } },
    take: 10
  });

  const topReferrers = [];
  let refRank = 1;
  for (const item of topReferrersRaw) {
    const user = await prisma.user.findUnique({
      where: { id: item.referrerId },
      select: { name: true, avatar: true }
    });
    if (!user) continue;

    const rewardsSum = await prisma.referralReward.aggregate({
      where: { referrerId: item.referrerId, status: 'CLAIMED' },
      _sum: { amount: true }
    });
    
    const commissionSum = await prisma.transaction.aggregate({
      where: {
        userId: item.referrerId,
        type: 'REFERRAL_BONUS',
        description: { contains: 'commission' },
        status: 'SUCCESS'
      },
      _sum: { amount: true }
    });

    topReferrers.push({
      rank: refRank++,
      name: user.name,
      avatar: user.avatar || '',
      referralsCount: item._count.referredId,
      bonusEarned: (rewardsSum._sum.amount || 0) + (commissionSum._sum.amount || 0)
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      topWinners,
      topReferrers
    }
  });
});
