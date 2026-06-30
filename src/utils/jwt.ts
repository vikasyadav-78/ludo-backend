import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface TokenPayload {
  userId: string;
  role: 'USER' | 'ADMIN' | 'SUPPORT';
}

export const signAccessToken = (payload: TokenPayload): string => {
  const isStaff = payload.role === 'ADMIN' || payload.role === 'SUPPORT';
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: isStaff ? '3d' : '15m' });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
};
