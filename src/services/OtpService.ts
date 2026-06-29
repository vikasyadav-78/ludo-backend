import emailService from './EmailService';
import smsService from './SmsService';
import { logger } from '../config/logger';

export class OtpService {
  async sendOtp(identifier: string, otp: string): Promise<void> {
    const isEmail = identifier.includes('@');
    if (isEmail) {
      logger.info(`Routing OTP to EmailService for: ${identifier}`);
      await emailService.sendOtp(identifier, otp);
    } else {
      logger.info(`Routing OTP to SmsService for: ${identifier}`);
      await smsService.sendOtp(identifier, otp);
    }
  }
}

export const otpService = new OtpService();
export default otpService;
