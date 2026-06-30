import prisma from '../../database/db';
import { systemSettingsRepository } from './SystemSettingsRepository';
import { systemSettingsCache } from './SystemSettingsCache';
import { systemSettingsValidator } from './SystemSettingsValidator';
import { emitSettingsUpdate } from '../../socket/socket';
import bcrypt from 'bcryptjs';

const DEFAULT_CATALOG = [
  // General Settings
  { key: 'APP_NAME', value: 'BattleLudo Arena', category: 'GENERAL', type: 'TEXT', label: 'App Name', description: 'Display name of the gaming platform', isPublic: true },
  { key: 'APP_LOGO', value: '/logo.png', category: 'GENERAL', type: 'TEXT', label: 'App Logo', description: 'URL/path to platform logo', isPublic: true },
  { key: 'MAINTENANCE_MODE', value: 'false', category: 'GENERAL', type: 'BOOLEAN', label: 'Maintenance Mode', description: 'Blocks game features for players', isPublic: true },
  { key: 'REGISTRATION_ENABLED', value: 'true', category: 'GENERAL', type: 'BOOLEAN', label: 'Registration Enabled', description: 'Allow new user registration', isPublic: true },
  { key: 'LOGIN_ENABLED', value: 'true', category: 'GENERAL', type: 'BOOLEAN', label: 'Login Enabled', description: 'Allow users to log in to dashboard', isPublic: true },
  { key: 'REFERRAL_SYSTEM_ENABLED', value: 'true', category: 'GENERAL', type: 'BOOLEAN', label: 'Referral System Enabled', description: 'Allow players to refer users', isPublic: true },

  // Wallet Settings
  { key: 'WELCOME_BONUS_AMOUNT', value: '50', category: 'WALLET', type: 'NUMBER', label: 'Welcome Bonus (₹)', description: 'Credited to player bonus wallet on signup', isPublic: true },
  { key: 'MIN_DEPOSIT', value: '100', category: 'WALLET', type: 'NUMBER', label: 'Minimum Deposit Limit (₹)', description: 'Minimum allowed money to deposit', isPublic: true },
  { key: 'MAX_DEPOSIT', value: '100000', category: 'WALLET', type: 'NUMBER', label: 'Maximum Deposit Limit (₹)', description: 'Maximum allowed money to deposit', isPublic: true },
  { key: 'MIN_WITHDRAWAL', value: '100', category: 'WALLET', type: 'NUMBER', label: 'Minimum Withdrawal Limit (₹)', description: 'Minimum allowed money to withdraw', isPublic: true },
  { key: 'MAX_WITHDRAWAL', value: '10000', category: 'WALLET', type: 'NUMBER', label: 'Maximum Withdrawal Limit (₹)', description: 'Maximum allowed money to withdraw', isPublic: true },
  { key: 'MAX_DAILY_WITHDRAWALS', value: '3', category: 'WALLET', type: 'NUMBER', label: 'Max Daily Withdrawals Count', description: 'Max withdrawal transactions a user can request per day', isPublic: true },
  { key: 'WITHDRAWAL_CHARGES_PERCENT', value: '0', category: 'WALLET', type: 'PERCENTAGE', label: 'Withdrawal Charges (%)', description: 'Deducted as a platform fee when user withdraws winnings', isPublic: true },
  { key: 'AUTO_WITHDRAWAL_ENABLED', value: 'false', category: 'WALLET', type: 'BOOLEAN', label: 'Auto Withdrawal Enabled', description: 'Automatically process withdrawals without admin verification', isPublic: false },

  // Battle Settings
  { key: 'MIN_BATTLE_AMOUNT', value: '50', category: 'BATTLE', type: 'NUMBER', label: 'Minimum Battle Amount (₹)', description: 'Minimum stake to create a battle', isPublic: true },
  { key: 'MAX_BATTLE_AMOUNT', value: '20000', category: 'BATTLE', type: 'NUMBER', label: 'Maximum Battle Amount (₹)', description: 'Maximum stake to create a battle', isPublic: true },
  { key: 'COMMISSION_PERCENTAGE', value: '10', category: 'BATTLE', type: 'PERCENTAGE', label: 'Battle Commission (%)', description: 'Platform fee percentage subtracted from battle winner stakes', isPublic: true },
  { key: 'AUTO_CANCEL_TIME_MINS', value: '15', category: 'BATTLE', type: 'NUMBER', label: 'Auto Cancel Time (mins)', description: 'Period after which unmatched battles cancel', isPublic: true },
  { key: 'INVITE_CODE_TIMEOUT_MINS', value: '5', category: 'BATTLE', type: 'NUMBER', label: 'Invite Code Timeout (mins)', description: 'Period after which invite code expires', isPublic: true },
  { key: 'AI_VERIFICATION_ENABLED', value: 'true', category: 'BATTLE', type: 'BOOLEAN', label: 'AI Verification Enabled', description: 'Automate verification using Gemini Vision AI', isPublic: true },

  // Referral Settings
  { key: 'REFERRAL_BONUS_AMOUNT', value: '50', category: 'REFERRAL', type: 'NUMBER', label: 'Referral Signup Bonus (₹)', description: 'Credited to referee on registration', isPublic: true },
  { key: 'REFERRAL_FIRST_DEPOSIT_REWARD', value: '500', category: 'REFERRAL', type: 'NUMBER', label: 'First Deposit Referral Reward (₹)', description: 'Credited to referrer on referee\'s first deposit', isPublic: true },
  { key: 'REFERRAL_WINNING_COMMISSION_PERCENT', value: '0.5', category: 'REFERRAL', type: 'PERCENTAGE', label: 'Referral Winning Commission (%)', description: 'Percentage referrer gets from referee\'s battle wins', isPublic: true },

  // Payments Settings
  { key: 'RAZORPAY_ENABLED', value: 'true', category: 'PAYMENTS', type: 'BOOLEAN', label: 'Razorpay Gateway Enabled', description: 'Enables automatic card/UPI deposit via Razorpay', isPublic: true },
  { key: 'UPI_ENABLED', value: 'true', category: 'PAYMENTS', type: 'BOOLEAN', label: 'UPI Payout Enabled', description: 'Enables withdrawals to UPI address', isPublic: true },
  { key: 'MANUAL_DEPOSIT_ENABLED', value: 'true', category: 'PAYMENTS', type: 'BOOLEAN', label: 'Manual Deposit Bank Transfer Enabled', description: 'Enables manual bank deposit screenshots uploads', isPublic: true },
  { key: 'MANUAL_WITHDRAWAL_ENABLED', value: 'true', category: 'PAYMENTS', type: 'BOOLEAN', label: 'Manual Bank Withdrawal Enabled', description: 'Enables bank IMPS/NEFT withdrawal requests', isPublic: true },

  // Notifications Settings
  { key: 'PUSH_NOTIFICATIONS_ENABLED', value: 'true', category: 'NOTIFICATIONS', type: 'BOOLEAN', label: 'Push Notifications Enabled', description: 'Enable real-time player alert bells', isPublic: true },
  { key: 'EMAIL_NOTIFICATIONS_ENABLED', value: 'true', category: 'NOTIFICATIONS', type: 'BOOLEAN', label: 'Email Notifications Enabled', description: 'Allow SMTP transactional email delivery', isPublic: true },
  { key: 'SMS_NOTIFICATIONS_ENABLED', value: 'true', category: 'NOTIFICATIONS', type: 'BOOLEAN', label: 'SMS Notifications Enabled', description: 'Allow MSG91 SMS delivery', isPublic: true },

  // Security Settings
  { key: 'OTP_EXPIRY_MINS', value: '5', category: 'SECURITY', type: 'NUMBER', label: 'OTP Expiry (mins)', description: 'Lifespan of validation OTP tokens', isPublic: false },
  { key: 'OTP_RETRY_LIMIT', value: '5', category: 'SECURITY', type: 'NUMBER', label: 'OTP Retry Limit', description: 'Max OTP sends allowed in a cooldown period', isPublic: false },
  { key: 'LOGIN_RETRY_LIMIT', value: '5', category: 'SECURITY', type: 'NUMBER', label: 'Login Retry Limit', description: 'Max failed login attempts before lockout', isPublic: false },
  { key: 'PASSWORD_POLICY', value: 'MIN_8_CHARS', category: 'SECURITY', type: 'TEXT', label: 'Password Policy Mode', description: 'Strength check policy for registration/change password', isPublic: false },
];

export class SystemSettingsService {
  async initializeAndSeed() {
    for (const item of DEFAULT_CATALOG) {
      const existing = await systemSettingsRepository.getByKey(item.key);
      if (!existing) {
        await systemSettingsRepository.upsertSetting(item.key, item);
      } else {
        // Update columns in case they are default/empty
        if (!existing.label || (existing.category === 'GENERAL' && item.category !== 'GENERAL')) {
          await systemSettingsRepository.upsertSetting(item.key, {
            value: existing.value, // retain current database value
            category: item.category,
            type: item.type,
            label: item.label,
            description: item.description,
            isPublic: item.isPublic,
          });
        }
      }
    }

    // Initialize/Refresh Cache
    await systemSettingsCache.initialize();

    // Auto-seed default admin account if none exists
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN' }
    });

    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash('LudoAdmin@7878@', 12);
      
      const adminUser = await prisma.user.create({
        data: {
          name: 'Super Admin',
          email: 'yadavvikas787840@gmail.com',
          mobile: '7878402570',
          password: hashedPassword,
          role: 'ADMIN',
          status: 'ACTIVE',
          isMobileVerified: true,
          isEmailVerified: true,
          referralCode: 'ADMIN100'
        }
      });

      // Initialize wallet for admin
      await prisma.wallet.create({
        data: {
          userId: adminUser.id,
          depositBalance: 0,
          winningBalance: 0,
          bonusBalance: 0
        }
      });
      console.log('👑 Default Admin account seeded successfully!');
    }
  }

  async getAdminSettings() {
    return systemSettingsCache.getAllRecords();
  }

  async getPublicSettings() {
    return systemSettingsCache.getAllPublicRecords();
  }

  async updateSettings(settings: Record<string, string>, adminId: string, adminName: string, ipAddress: string, userAgent: string) {
    // 1. Batch validation
    systemSettingsValidator.validateBatch(settings);

    // 2. Perform updates inside a database transaction
    await prisma.$transaction(async (tx) => {
      for (const [key, newVal] of Object.entries(settings)) {
        const valStr = String(newVal);
        const current = systemSettingsCache.get(key);

        if (current !== valStr) {
          const updatedRecord = await tx.adminSetting.update({
            where: { key },
            data: { value: valStr },
          });

          // Log administrative audit trail
          await tx.adminAuditLog.create({
            data: {
              adminId,
              adminName,
              action: `Setting '${key}' updated from '${current}' to '${valStr}'`,
              ip: ipAddress,
              device: userAgent,
            },
          });

          // Sync cache record
          systemSettingsCache.setRecordLocal(key, updatedRecord);
        }
      }
    });

    // 3. Broadcast system settings update to all online clients in real-time
    const allSettingsValues = systemSettingsCache.getAllValues();
    emitSettingsUpdate(allSettingsValues);

    return systemSettingsCache.getAllRecords();
  }
}

export const systemSettingsService = new SystemSettingsService();
export default systemSettingsService;
