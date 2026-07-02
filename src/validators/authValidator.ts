import { z } from 'zod';

const mobileRegex = /^[6-9]\d{9}$/;
const otpRegex = /^\d{6}$/;

export const registerSendOtpSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    mobile: z.string().regex(mobileRegex, 'Invalid Indian mobile number (must be 10 digits starting with 6-9)'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    referralCode: z.string().optional().nullable(),
    agree: z.boolean().refine((val) => val === true, 'You must agree to the Terms & Conditions and Privacy Policy'),
  }),
});

export const registerVerifyOtpSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    mobile: z.string().regex(mobileRegex, 'Invalid Indian mobile number'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    referralCode: z.string().optional().nullable(),
    otp: z.string().regex(otpRegex, 'OTP must be a 6-digit number'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().optional(),
    email: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  }).refine(data => data.identifier || data.email, {
    message: 'Email or Mobile Number is required',
    path: ['identifier'],
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    identifier: z.string().optional(),
    email: z.string().optional(),
  }).refine(data => data.identifier || data.email, {
    message: 'Email or Mobile Number is required',
    path: ['identifier'],
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

export const resetPasswordMobileSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Identifier is required').optional(),
    mobile: z.string().regex(mobileRegex, 'Invalid Indian mobile number').optional(),
    otp: z.string().regex(otpRegex, 'OTP must be a 6-digit number'),
    password: z.string().min(6, 'New password must be at least 6 characters'),
  }),
});

export const verifyResetOtpSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Identifier is required'),
    otp: z.string().regex(otpRegex, 'OTP must be a 6-digit number'),
  }),
});
