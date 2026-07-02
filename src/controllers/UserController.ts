import { Response, NextFunction } from 'express';
import userRepository from '../repositories/UserRepository';
import { uploadBufferToCloudinary } from '../utils/cloudinary';
import { AuthenticatedRequest } from '../interfaces/auth.interface';
import AppError from '../utils/AppError';
import catchAsync from '../utils/catchAsync';
import referralService from '../services/ReferralService';
import bcrypt from 'bcryptjs';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';
import otpService from '../services/OtpService';


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

export const verifySendOtp = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user!;
  const { type } = req.body; // 'email' or 'mobile'
  if (type !== 'email' && type !== 'mobile') {
    throw new AppError('Invalid verification type', 400);
  }

  // Generate random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  // Since mobile SMS is disabled, if type is mobile we route the OTP to email!
  const provider = (systemSettingsCache.get('OTP_PROVIDER') || process.env.OTP_PROVIDER || 'email').toLowerCase();
  const targetIdentifier = (type === 'email' || provider === 'email') ? user.email : user.mobile;

  // Store OTP in database
  await prisma.otpVerification.upsert({
    where: { identifier: targetIdentifier },
    update: {
      otpHash,
      expiry: new Date(Date.now() + 5 * 60000), // 5 minutes
      attempts: 0,
      lastSentAt: new Date()
    },
    create: {
      identifier: targetIdentifier,
      otpHash,
      expiry: new Date(Date.now() + 5 * 60000),
      attempts: 0,
      lastSentAt: new Date()
    }
  });

  // Send OTP
  await otpService.sendOtp(targetIdentifier, otp);

  res.status(200).json({
    status: 'success',
    message: (type === 'email' || provider === 'email')
      ? `Verification OTP sent to your registered email address ${user.email}.`
      : `Verification OTP sent to your mobile number ${user.mobile}.`,
    target: targetIdentifier
  });
});

export const verifyOtp = catchAsync(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user!;
  const { type, otp } = req.body; // type is 'email' or 'mobile'
  if (type !== 'email' && type !== 'mobile') {
    throw new AppError('Invalid verification type', 400);
  }
  if (!otp) {
    throw new AppError('OTP code is required', 400);
  }

  const provider = (systemSettingsCache.get('OTP_PROVIDER') || process.env.OTP_PROVIDER || 'email').toLowerCase();
  const targetIdentifier = (type === 'email' || provider === 'email') ? user.email : user.mobile;

  const record = await prisma.otpVerification.findUnique({
    where: { identifier: targetIdentifier }
  });
  if (!record) {
    throw new AppError('No OTP request found for this channel', 400);
  }

  if (new Date() > new Date(record.expiry)) {
    throw new AppError('OTP has expired', 400);
  }

  const isMatch = await bcrypt.compare(otp, record.otpHash);
  if (!isMatch) {
    const newAttempts = record.attempts + 1;
    if (newAttempts >= 5) {
      await prisma.otpVerification.delete({ where: { identifier: targetIdentifier } });
      throw new AppError('Maximum invalid OTP attempts exceeded. Please request a new OTP.', 400);
    } else {
      await prisma.otpVerification.update({
        where: { identifier: targetIdentifier },
        data: { attempts: newAttempts }
      });
      throw new AppError('Invalid OTP', 400);
    }
  }

  // Success! Delete OTP record
  await prisma.otpVerification.delete({ where: { identifier: targetIdentifier } });

  // Update user verification status in database
  const updateData = type === 'email' ? { isEmailVerified: true } : { isMobileVerified: true };
  const updatedUser = await userRepository.update(user.id, updateData);

  if (!updatedUser) {
    throw new AppError('User not found after update', 404);
  }

  res.status(200).json({
    status: 'success',
    message: `${type === 'email' ? 'Email' : 'Mobile'} verified successfully!`,
    data: {
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile,
        role: updatedUser.role,
        avatar: updatedUser.avatar,
        referralCode: updatedUser.referralCode,
        mobileVerified: updatedUser.isMobileVerified,
        emailVerified: updatedUser.isEmailVerified,
        createdAt: updatedUser.createdAt
      }
    }
  });
});
