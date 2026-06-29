import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import AppError from '../utils/AppError';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Replace with parsed details to enforce transforms/defaults
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => `${err.path.join('.')} - ${err.message}`).join(', ');
        next(new AppError(errorMessages, 400));
      } else {
        next(error);
      }
    }
  };
};

export default validate;
