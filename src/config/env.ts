import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  DATABASE_URL: z.string().default('mysql://root:@localhost:3306/ludo'),
  JWT_SECRET: z.string().default('super_secret_jwt_access_key_123'),
  JWT_REFRESH_SECRET: z.string().default('super_secret_jwt_refresh_key_123'),
  CLOUDINARY_CLOUD_NAME: z.string().default('placeholder_cloud_name'),
  CLOUDINARY_API_KEY: z.string().default('placeholder_api_key'),
  CLOUDINARY_API_SECRET: z.string().default('placeholder_api_secret'),
  GEMINI_API_KEY: z.string().default('placeholder_gemini_key'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RAZORPAY_KEY_ID: z.string().default('REPLACE_WITH_MY_KEY_ID'),
  RAZORPAY_KEY_SECRET: z.string().default('REPLACE_WITH_MY_SECRET_KEY'),
  // MSG91 configuration
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_ROUTE: z.string().optional().default('4'),
  // SMTP configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment configuration validation failed:', parsed.error.format());
  process.exit(1);
}

// In production mode, fail fast if mandatory OTP provider configurations are missing
if (parsed.data.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!parsed.data.MSG91_AUTH_KEY) missing.push('MSG91_AUTH_KEY');
  if (!parsed.data.MSG91_TEMPLATE_ID) missing.push('MSG91_TEMPLATE_ID');
  if (!parsed.data.MSG91_SENDER_ID) missing.push('MSG91_SENDER_ID');
  if (!parsed.data.SMTP_HOST) missing.push('SMTP_HOST');
  if (!parsed.data.SMTP_USER) missing.push('SMTP_USER');
  if (!parsed.data.SMTP_PASS) missing.push('SMTP_PASS');
  if (!parsed.data.SMTP_FROM) missing.push('SMTP_FROM');

  if (missing.length > 0) {
    console.error(`❌ Mandatory production environment variables are missing: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const env = parsed.data;
