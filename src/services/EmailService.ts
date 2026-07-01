import nodemailer from 'nodemailer';
import { logger } from '../config/logger';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';
import AppError from '../utils/AppError';

class EmailService {
  private transporter;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    // Create SMTP transporter
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // Prevents certificate validation failures on platforms like Railway
      },
    });
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    const emailEnabled = systemSettingsCache.getBoolean('EMAIL_NOTIFICATIONS_ENABLED', true);
    if (!emailEnabled) {
      logger.info(`Email notifications are disabled. Skipping OTP send to: ${email}`);
      return;
    }

    const defaultFrom = `"${process.env.SMTP_FROM_NAME || 'Ludo Battle'}" <no-reply@yourdomain.com>`;
    const from = process.env.SMTP_FROM || defaultFrom;

    const mailOptions = {
      from,
      to: email,
      subject: 'Ludo Arena OTP Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #4f46e5; text-align: center;">Ludo Arena Verification</h2>
          <p>Hello,</p>
          <p>Use the following 6-digit OTP verification code to proceed with your request:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e1b4b; background-color: #f3f4f6; padding: 10px 25px; border-radius: 5px; border: 1px dashed #4f46e5; display: inline-block;">
              ${otp}
            </span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">This code is valid for 5 minutes. If you did not request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 11px; text-align: center;">&copy; 2026 Ludo Arena. All rights reserved.</p>
        </div>
      `,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📧 [EMAIL SIMULATOR] Sent Password Reset OTP to ${email}: ${otp}\n`);
    }

    if (process.env.SMTP_USER && process.env.SMTP_PASS && !process.env.SMTP_USER.includes('your_email')) {
      try {
        await this.transporter.sendMail(mailOptions);
        logger.info(`OTP email sent successfully to: ${email}`);
      } catch (error: any) {
        logger.error(`SMTP email send failed for ${email}: ${error.message}`, { stack: error.stack });
        throw new AppError(`Failed to deliver OTP email: ${error.message}`, 500);
      }
    } else {
      logger.info(`SMTP credentials not configured. Simulated OTP email for ${email}`);
    }
  }
}

export const emailService = new EmailService();
export default emailService;
