import bcrypt from 'bcryptjs';
import prisma from '../database/db';
import userRepository from '../repositories/UserRepository';
import { signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken } from '../utils/jwt';
import AppError from '../utils/AppError';
import { logger } from '../config/logger';
import otpService from './OtpService';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

export class AuthService {
  private validatePasswordPolicy(password: string): void {
    const policy = systemSettingsCache.get('PASSWORD_POLICY', 'MIN_8_CHARS');
    if (policy === 'MIN_8_CHARS') {
      if (password.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400);
      }
    } else if (policy === 'MIN_8_CHARS_1_NUM') {
      if (password.length < 8 || !/\d/.test(password)) {
        throw new AppError('Password must be at least 8 characters long and contain at least one number', 400);
      }
    } else if (policy === 'MIN_8_CHARS_1_ALPHA_1_NUM') {
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        throw new AppError('Password must be at least 8 characters long and contain both letters and numbers', 400);
      }
    } else if (policy === 'MIN_8_CHARS_SPECIAL') {
      const isStrong = password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password) &&
        /[!@#$%^&*(),.?":{}|<>]/.test(password);
      if (!isStrong) {
        throw new AppError('Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters', 400);
      }
    }
  }

  async registerSendOtp(data: any): Promise<any> {
    const registrationEnabled = systemSettingsCache.getBoolean('REGISTRATION_ENABLED', true);
    if (!registrationEnabled) {
      throw new AppError('Registration is currently disabled by administrator.', 403);
    }

    const { name, email, mobile, password, referralCode } = data;
    this.validatePasswordPolicy(password);

    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email already registered', 400);
    }

    const existingMobile = await userRepository.findByMobile(mobile);
    if (existingMobile) {
      throw new AppError('Mobile number already registered', 400);
    }

    // Validate referral code if provided
    if (referralCode) {
      const referralSystemEnabled = systemSettingsCache.getBoolean('REFERRAL_SYSTEM_ENABLED', true);

      if (referralSystemEnabled) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode }
        });
        if (!referrer) {
          throw new AppError('Invalid referral code', 400);
        }
        if (referrer.email === email || referrer.mobile === mobile) {
          throw new AppError('You cannot refer yourself', 400);
        }
      }
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    const provider = (process.env.OTP_PROVIDER || 'twilio').toLowerCase();
    const otpIdentifier = provider === 'email' ? email : mobile;

    const existingOtp = await prisma.otpVerification.findUnique({
      where: { identifier: otpIdentifier }
    });

    if (existingOtp) {
      // Cooldown check (60 seconds)
      const timeDiff = Date.now() - new Date(existingOtp.lastSentAt).getTime();
      if (timeDiff < 60000) {
        throw new AppError('Please wait 60 seconds before requesting another OTP', 429);
      }

      // Max attempts limit (5 attempts per 15 minutes)
      let attempts = existingOtp.attempts;
      const isCooldownOver = Date.now() - new Date(existingOtp.lastSentAt).getTime() > 900000; // 15 mins
      if (isCooldownOver) {
        attempts = 0; // Reset attempts after 15 mins
      }

      if (attempts >= systemSettingsCache.getNumber('OTP_RETRY_LIMIT', 5)) {
        throw new AppError('Maximum OTP requests exceeded. Please try again after 15 minutes.', 429);
      }

      await prisma.otpVerification.update({
        where: { identifier: otpIdentifier },
        data: {
          otpHash,
          expiry: new Date(Date.now() + systemSettingsCache.getNumber('OTP_EXPIRY_MINS', 5) * 60000), // dynamic minutes expiry
          attempts: attempts + 1,
          lastSentAt: new Date(),
        }
      });
    } else {
      await prisma.otpVerification.create({
        data: {
          identifier: otpIdentifier,
          otpHash,
          expiry: new Date(Date.now() + systemSettingsCache.getNumber('OTP_EXPIRY_MINS', 5) * 60000),
          attempts: 1,
          lastSentAt: new Date(),
        }
      });
    }

    await otpService.sendOtp(otpIdentifier, otp);

    const response: any = {
      status: 'success',
      message: provider === 'email'
        ? 'OTP sent successfully to your email address.'
        : 'OTP sent successfully to your mobile number.',
    };
    if (process.env.NODE_ENV === 'development') {
      response.otp = otp;
    }
    return response;
  }

  async registerVerifyOtp(data: any): Promise<{ user: any; token: string }> {
    const registrationEnabled = systemSettingsCache.getBoolean('REGISTRATION_ENABLED', true);
    if (!registrationEnabled) {
      throw new AppError('Registration is currently disabled by administrator.', 403);
    }

    const { name, email, mobile, password, referralCode, otp } = data;
    this.validatePasswordPolicy(password);

    // Check unique again to prevent race conditions
    const existingEmail = await userRepository.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email already registered', 400);
    }

    const existingMobile = await userRepository.findByMobile(mobile);
    if (existingMobile) {
      throw new AppError('Mobile number already registered', 400);
    }

    const provider = (process.env.OTP_PROVIDER || 'twilio').toLowerCase();
    const otpIdentifier = provider === 'email' ? email : mobile;

    const record = await prisma.otpVerification.findUnique({
      where: { identifier: otpIdentifier }
    });

    if (!record) {
      throw new AppError(provider === 'email' ? 'No OTP request found for this email address' : 'No OTP request found for this mobile number', 400);
    }

    // Expiry check (5 mins)
    if (new Date() > new Date(record.expiry)) {
      throw new AppError('OTP has expired. Please request a new one.', 400);
    }

    // Compare OTP
    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      if (newAttempts >= 5) {
        await prisma.otpVerification.delete({ where: { identifier: otpIdentifier } });
        throw new AppError('Maximum invalid OTP attempts exceeded. Please request a new OTP.', 400);
      } else {
        await prisma.otpVerification.update({
          where: { identifier: otpIdentifier },
          data: { attempts: newAttempts }
        });
        throw new AppError('Invalid OTP', 400);
      }
    }

    // Delete OTP record immediately
    await prisma.otpVerification.delete({ where: { identifier: otpIdentifier } });

    // Hashed Password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user and wallet in a Prisma transaction
    const newUser = await prisma.$transaction(async (tx) => {
      // Generate unique referral code for the registering user (Formula: Upper(FirstName) + first 4 digits of mobile)
      const firstPartName = name.trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
      const first4Mobile = mobile.trim().slice(0, 4);
      const baseReferralCode = `${firstPartName}${first4Mobile}`;
      let generatedReferralCode = baseReferralCode;
      let codeExists = true;
      let attempts = 0;
      while (codeExists && attempts < 20) {
        attempts++;
        const existingCodeUser = await tx.user.findUnique({
          where: { referralCode: generatedReferralCode }
        });
        if (!existingCodeUser) {
          codeExists = false;
        } else {
          const randomDigits = Math.floor(10 + Math.random() * 90).toString(); // 2 random digits
          generatedReferralCode = `${baseReferralCode}${randomDigits}`;
        }
      }

      if (codeExists) {
        generatedReferralCode = `${baseReferralCode}${Date.now().toString().slice(-4)}`;
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          mobile,
          password: hashedPassword,
          role: 'USER',
          status: 'ACTIVE',
          referralCode: generatedReferralCode,
          isMobileVerified: true,
          isEmailVerified: false,
        },
      });

      // Fetch welcome bonus amount setting or default to 50
      const welcomeBonus = systemSettingsCache.getNumber('WELCOME_BONUS_AMOUNT', 50);

      // Create matching wallet
      const wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          bonusBalance: welcomeBonus,
        },
      });

      // Log transaction and ledger if welcome bonus is credited
      if (welcomeBonus > 0) {
        const txLog = await tx.transaction.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            amount: welcomeBonus,
            type: 'REFERRAL_BONUS',
            status: 'SUCCESS',
            description: 'Welcome Bonus Credited on Registration',
          },
        });

        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            userId: user.id,
            transactionId: txLog.id,
            previousBalance: 0,
            newBalance: welcomeBonus,
            balanceType: 'BONUS',
            description: 'Welcome Bonus Credited on Registration',
          },
        });
      }

      // Referral code logic
      if (referralCode) {
        const referralSystemEnabled = systemSettingsCache.getBoolean('REFERRAL_SYSTEM_ENABLED', true);

        if (referralSystemEnabled) {
          const referrer = await tx.user.findUnique({ where: { referralCode } });
          if (referrer) {
            if (referrer.id === user.id || referrer.email === user.email || referrer.mobile === user.mobile) {
              throw new AppError('You cannot refer yourself', 400);
            }

            // Create Referral entry
            await tx.referral.create({
              data: {
                referrerId: referrer.id,
                referredId: user.id,
                referralCode,
              },
            });

            // Fetch REFERRAL_FIRST_DEPOSIT_REWARD setting or default to 500
            const referralRewardAmount = systemSettingsCache.getNumber('REFERRAL_FIRST_DEPOSIT_REWARD', 500);

            // Create pending ReferralReward reward entry
            await tx.referralReward.create({
              data: {
                referrerId: referrer.id,
                referredId: user.id,
                amount: referralRewardAmount,
                status: 'PENDING',
              },
            });
          }
        }
      }

      return user;
    });

    const token = signAccessToken({ userId: newUser.id, role: newUser.role });

    logger.info(`User registered successfully with MySQL post OTP verification: ${newUser.email}`);
    return {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        mobileVerified: newUser.isMobileVerified,
        emailVerified: newUser.isEmailVerified,
      },
      token
    };
  }

  async login(data: any, ipAddress: string, userAgent: string): Promise<{ user: any; token: string; refreshToken: string }> {
    const { identifier: reqIdentifier, email, password } = data;
    const identifier = reqIdentifier || email;

    const isEmail = identifier.includes('@');
    const user = isEmail ? await userRepository.findByEmail(identifier) : await userRepository.findByMobile(identifier);

    if (!user) {
      await prisma.loginHistory.create({
        data: {
          email: identifier,
          ipAddress,
          userAgent,
          status: 'FAILED',
          failureReason: 'User not found',
        },
      });
      throw new AppError('Invalid email or password', 401);
    }

    if (user.status === 'SUSPENDED') {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email: user.email,
          ipAddress,
          userAgent,
          status: 'FAILED',
          failureReason: 'User is suspended',
        },
      });
      throw new AppError('Your account has been suspended', 403);
    }

    const loginEnabled = systemSettingsCache.getBoolean('LOGIN_ENABLED', true);
    if (!loginEnabled && user.role !== 'ADMIN' && user.role !== 'SUPPORT') {
      throw new AppError('Login is temporarily disabled.', 403);
    }

    const loginRetryLimit = systemSettingsCache.getNumber('LOGIN_RETRY_LIMIT', 5);
    const startOfPeriod = new Date(Date.now() - 15 * 60000);
    const failedAttempts = await prisma.loginHistory.count({
      where: {
        email: user.email,
        status: 'FAILED',
        timestamp: { gte: startOfPeriod }
      }
    });

    if (failedAttempts >= loginRetryLimit) {
      throw new AppError('Too many failed login attempts. Please try again after 15 minutes.', 429);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          email: user.email,
          ipAddress,
          userAgent,
          status: 'FAILED',
          failureReason: 'Incorrect password',
        },
      });
      throw new AppError('Invalid email or password', 401);
    }

    // Record success login
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        status: 'SUCCESS',
      },
    });

    // Update login audit fields on User model
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        lastLoginDevice: userAgent,
      }
    });

    const token = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, role: user.role });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        mobileVerified: user.isMobileVerified,
        emailVerified: user.isEmailVerified,
      },
      token,
      refreshToken,
    };
  }

  async refreshToken(rToken: string): Promise<{ token: string }> {
    try {
      const decoded = verifyRefreshToken(rToken);
      const user = await userRepository.findById(decoded.userId);
      if (!user || user.status === 'SUSPENDED') {
        throw new AppError('Authentication failed', 401);
      }

      const newToken = signAccessToken({ userId: user.id, role: user.role });
      return { token: newToken };
    } catch (err) {
      throw new AppError('Invalid refresh token', 401);
    }
  }

  async changePassword(userId: string, data: any): Promise<void> {
    const { oldPassword, newPassword } = data;

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new AppError('Incorrect old password', 400);
    }

    this.validatePasswordPolicy(newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await userRepository.update(userId, { password: hashedPassword });
    logger.info(`Password changed successfully for user: ${user.email}`);
  }

  async generateForgotPasswordToken(identifier: string): Promise<string> {
    const isEmail = identifier.includes('@');
    const user = isEmail ? await userRepository.findByEmail(identifier) : await userRepository.findByMobile(identifier);
    if (!user) {
      throw new AppError('No user found with that email or mobile number', 404);
    }
    return signAccessToken({ userId: user.id, role: user.role });
  }

  async sendForgotPasswordOtp(identifier: string): Promise<any> {
    const isEmailInput = identifier.includes('@');
    const user = isEmailInput ? await userRepository.findByEmail(identifier) : await userRepository.findByMobile(identifier);
    if (!user) {
      throw new AppError('No user found with that email or mobile number', 404);
    }

    const provider = (process.env.OTP_PROVIDER || 'twilio').toLowerCase();
    const targetIdentifier = provider === 'email' ? user.email : (isEmailInput ? user.email : user.mobile);
    const isSendingToEmail = provider === 'email' || isEmailInput;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    const existingOtp = await prisma.otpVerification.findUnique({
      where: { identifier: targetIdentifier }
    });

    if (existingOtp) {
      const timeDiff = Date.now() - new Date(existingOtp.lastSentAt).getTime();
      if (timeDiff < 60000) {
        throw new AppError('Please wait 60 seconds before requesting another OTP', 429);
      }

      let attempts = existingOtp.attempts;
      const isCooldownOver = Date.now() - new Date(existingOtp.lastSentAt).getTime() > 900000;
      if (isCooldownOver) {
        attempts = 0;
      }

      if (attempts >= systemSettingsCache.getNumber('OTP_RETRY_LIMIT', 5)) {
        throw new AppError('Maximum OTP requests exceeded. Please try again after 15 minutes.', 429);
      }

      await prisma.otpVerification.update({
        where: { identifier: targetIdentifier },
        data: {
          otpHash,
          expiry: new Date(Date.now() + systemSettingsCache.getNumber('OTP_EXPIRY_MINS', 5) * 60000),
          attempts: attempts + 1,
          lastSentAt: new Date(),
        }
      });
    } else {
      await prisma.otpVerification.create({
        data: {
          identifier: targetIdentifier,
          otpHash,
          expiry: new Date(Date.now() + systemSettingsCache.getNumber('OTP_EXPIRY_MINS', 5) * 60000),
          attempts: 1,
          lastSentAt: new Date(),
        }
      });
    }

    await otpService.sendOtp(targetIdentifier, otp);

    const response: any = {
      status: 'success',
      target: targetIdentifier,
      message: isSendingToEmail 
        ? 'OTP sent successfully to your email address.' 
        : 'OTP sent successfully to your mobile number.',
    };
    if (process.env.NODE_ENV === 'development') {
      response.otp = otp;
    }
    return response;
  }

  async resetPasswordMobile(data: any): Promise<void> {
    const { identifier: reqIdentifier, mobile, email, otp, password } = data;
    const identifier = reqIdentifier || mobile || email;

    if (!identifier) {
      throw new AppError('Identifier (email or mobile) is required', 400);
    }

    const isEmailInput = identifier.includes('@');
    const user = isEmailInput ? await userRepository.findByEmail(identifier) : await userRepository.findByMobile(identifier);
    if (!user) {
      throw new AppError('No user found with that email or mobile number', 404);
    }

    const provider = (process.env.OTP_PROVIDER || 'twilio').toLowerCase();
    const targetIdentifier = provider === 'email' ? user.email : (isEmailInput ? user.email : user.mobile);

    const record = await prisma.otpVerification.findUnique({
      where: { identifier: targetIdentifier }
    });

    if (!record) {
      throw new AppError(provider === 'email' ? 'No OTP request found for this email address' : 'No OTP request found for this email or mobile number', 400);
    }

    if (new Date() > new Date(record.expiry)) {
      throw new AppError('OTP has expired. Please request a new one.', 400);
    }

    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      if (newAttempts >= systemSettingsCache.getNumber('OTP_RETRY_LIMIT', 5)) {
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

    this.validatePasswordPolicy(password);
    await prisma.otpVerification.delete({ where: { identifier: targetIdentifier } });

    const hashedPassword = await bcrypt.hash(password, 12);
    await userRepository.update(user.id, { password: hashedPassword });
    logger.info(`Password reset successfully via OTP for: ${targetIdentifier}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      this.validatePasswordPolicy(newPassword);
      const decoded = verifyAccessToken(token);
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await userRepository.update(decoded.userId, { password: hashedPassword });
    } catch (error: any) {
      throw new AppError(error.message || 'Token invalid or expired', 400);
    }
  }
}

export const authService = new AuthService();
export default authService;
