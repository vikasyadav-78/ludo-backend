import AppError from '../../utils/AppError';
import { systemSettingsCache } from './SystemSettingsCache';

export class SystemSettingsValidator {
  validateBatch(settings: Record<string, string>) {
    const merged = { ...systemSettingsCache.getAllValues(), ...settings };

    for (const [key, val] of Object.entries(settings)) {
      this.validateKey(key, val, merged);
    }
  }

  private validateKey(key: string, val: string, merged: Record<string, string>) {
    // 1. Boolean check
    const booleanKeys = [
      'MAINTENANCE_MODE',
      'REGISTRATION_ENABLED',
      'LOGIN_ENABLED',
      'REFERRAL_SYSTEM_ENABLED',
      'AUTO_WITHDRAWAL_ENABLED',
      'AI_VERIFICATION_ENABLED',
      'RAZORPAY_ENABLED',
      'UPI_ENABLED',
      'MANUAL_DEPOSIT_ENABLED',
      'MANUAL_WITHDRAWAL_ENABLED',
      'PUSH_NOTIFICATIONS_ENABLED',
      'EMAIL_NOTIFICATIONS_ENABLED',
      'SMS_NOTIFICATIONS_ENABLED',
    ];

    if (booleanKeys.includes(key)) {
      if (val !== 'true' && val !== 'false') {
        throw new AppError(`Setting '${key}' must be either 'true' or 'false'`, 400);
      }
      return;
    }

    // 2. Percentage check
    const percentageKeys = [
      'WITHDRAWAL_CHARGES_PERCENT',
      'COMMISSION_PERCENTAGE',
      'REFERRAL_WINNING_COMMISSION_PERCENT',
      'REFERRAL_COMMISSION',
    ];

    if (percentageKeys.includes(key)) {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 100) {
        throw new AppError(`Setting '${key}' must be a percentage between 0 and 100`, 400);
      }
      return;
    }

    // 3. Positive number check
    const positiveNumberKeys = [
      'WELCOME_BONUS_AMOUNT',
      'MIN_DEPOSIT',
      'MAX_DEPOSIT',
      'MIN_WITHDRAWAL',
      'MAX_WITHDRAWAL',
      'MAX_DAILY_WITHDRAWALS',
      'MIN_BATTLE_AMOUNT',
      'MAX_BATTLE_AMOUNT',
      'AUTO_CANCEL_TIME_MINS',
      'INVITE_CODE_TIMEOUT_MINS',
      'REFERRAL_FIRST_DEPOSIT_REWARD',
      'REFERRAL_BONUS_AMOUNT',
      'OTP_EXPIRY_MINS',
      'OTP_RETRY_LIMIT',
      'LOGIN_RETRY_LIMIT',
    ];

    if (positiveNumberKeys.includes(key)) {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        throw new AppError(`Setting '${key}' must be a positive number`, 400);
      }
    }

    // 4. Min/Max comparison checks
    if (key === 'MIN_DEPOSIT' || key === 'MAX_DEPOSIT') {
      const min = parseFloat(merged.MIN_DEPOSIT || '0');
      const max = parseFloat(merged.MAX_DEPOSIT || '0');
      if (min > max) {
        throw new AppError('Minimum Deposit limit cannot exceed Maximum Deposit limit', 400);
      }
    }

    if (key === 'MIN_WITHDRAWAL' || key === 'MAX_WITHDRAWAL') {
      const min = parseFloat(merged.MIN_WITHDRAWAL || '0');
      const max = parseFloat(merged.MAX_WITHDRAWAL || '0');
      if (min > max) {
        throw new AppError('Minimum Withdrawal limit cannot exceed Maximum Withdrawal limit', 400);
      }
    }

    if (key === 'MIN_BATTLE_AMOUNT' || key === 'MAX_BATTLE_AMOUNT') {
      const min = parseFloat(merged.MIN_BATTLE_AMOUNT || '0');
      const max = parseFloat(merged.MAX_BATTLE_AMOUNT || '0');
      if (min > max) {
        throw new AppError('Minimum Battle stake amount cannot exceed Maximum Battle stake amount', 400);
      }
    }

    // 5. Password Policy validation
    if (key === 'PASSWORD_POLICY') {
      const allowed = ['MIN_8_CHARS', 'MIN_8_CHARS_1_NUM', 'MIN_8_CHARS_1_ALPHA_1_NUM', 'MIN_8_CHARS_SPECIAL'];
      if (!allowed.includes(val)) {
        throw new AppError(`Setting 'PASSWORD_POLICY' must be one of: ${allowed.join(', ')}`, 400);
      }
    }
  }
}

export const systemSettingsValidator = new SystemSettingsValidator();
export default systemSettingsValidator;
