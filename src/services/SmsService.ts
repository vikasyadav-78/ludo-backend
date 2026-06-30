import { logger } from '../config/logger';
import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

export class SmsService {
  private authKey: string;
  private templateId: string;
  private senderId: string;
  private route: string;

  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY || '';
    this.templateId = process.env.MSG91_TEMPLATE_ID || '';
    this.senderId = process.env.MSG91_SENDER_ID || '';
    this.route = process.env.MSG91_ROUTE || '4';
  }

  async sendOtp(mobile: string, otp: string): Promise<void> {
    const smsEnabled = systemSettingsCache.getBoolean('SMS_NOTIFICATIONS_ENABLED', true);
    if (!smsEnabled) {
      logger.info(`SMS notifications are disabled. Skipping OTP send to: ${mobile}`);
      return;
    }

    // Prefix country code 91 if it's a 10-digit Indian number without country code
    const formattedMobile = mobile.length === 10 ? `91${mobile}` : mobile;

    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📲 [SMS SIMULATOR] Generated Mobile OTP for ${mobile}: ${otp}\n`);
    }

    if (!this.authKey || !this.templateId || !this.senderId || this.authKey.includes('your_msg91_')) {
      logger.info(`MSG91 credentials not fully configured. Simulated SMS for ${mobile}`);
      return;
    }

    const url = 'https://control.msg91.com/api/v5/flow/';
    const body = {
      template_id: this.templateId,
      sender: this.senderId,
      route: this.route,
      recipients: [
        {
          mobiles: formattedMobile,
          otp: otp, // Variable used in template (e.g. ##otp##)
        },
      ],
    };

    const makeRequest = async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'authkey': this.authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const resData = (await response.json()) as any;
      if (resData && resData.type === 'error') {
        throw new Error(`MSG91 API error: ${resData.message}`);
      }
    };

    try {
      await makeRequest();
      logger.info(`MSG91 SMS sent successfully to: ${mobile}`);
    } catch (error: any) {
      logger.warn(`First attempt to send SMS to ${mobile} failed: ${error.message}. Retrying once...`);
      try {
        // Retry once after 1 second
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await makeRequest();
        logger.info(`MSG91 SMS sent successfully to ${mobile} on retry.`);
      } catch (retryError: any) {
        logger.error(`Failed to send SMS to ${mobile} after retry: ${retryError.message}`);
        console.log(`\n📲 [SMS FALLBACK SIMULATOR] OTP for ${mobile}: ${otp}\n`);
      }
    }
  }
}

export const smsService = new SmsService();
export default smsService;
