import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import AppError from '../utils/AppError';

export class RazorpayService {
  private razorpayInstance: Razorpay;

  constructor() {
    this.razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }

  /**
   * Creates a Razorpay order
   * @param amount Amount in Rupees (will be converted to paise)
   * @param receiptId Receipt tracking ID (e.g. Transaction ID)
   */
  async createOrder(amount: number, receiptId: string): Promise<any> {
    try {
      const options = {
        amount: Math.round(amount * 100), // convert to paise
        currency: 'INR',
        receipt: receiptId,
        payment_capture: 1,
      };

      const order = await this.razorpayInstance.orders.create(options);
      logger.info(`Razorpay order created successfully. ID: ${order.id}`);
      return order;
    } catch (error: any) {
      logger.error('Error creating Razorpay order:', error);
      throw new AppError(error.message || 'Failed to create payment order', 500);
    }
  }

  /**
   * Verifies Razorpay payment signature
   * @param orderId Razorpay order ID
   * @param paymentId Razorpay payment ID
   * @param signature Razorpay signature
   */
  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    try {
      const text = `${orderId}|${paymentId}`;
      const generatedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(text)
        .digest('hex');

      const isValid = generatedSignature === signature;
      logger.info(`Signature verification result for Order ${orderId}: ${isValid}`);
      return isValid;
    } catch (error) {
      logger.error('Error verifying signature:', error);
      return false;
    }
  }
}

export const razorpayService = new RazorpayService();
export default razorpayService;
