import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, ZodIssue } from 'zod';

/**
 * Formats Zod validation errors into a user-friendly structure
 */
function formatZodErrors(errors: ZodIssue[]): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  errors.forEach((error) => {
    const path = error.path.join('.');
    const key = path || 'general';
    
    if (!formatted[key]) {
      formatted[key] = [];
    }
    formatted[key].push(error.message);
  });

  return formatted;
}

/**
 * Middleware factory for validating requests against a Zod schema
 * 
 * @example
 * router.post('/register', validate(registerSchema), userController.register);
 */
export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace request properties with validated/transformed data
      req.body = result.body ?? req.body;
      req.query = result.query ?? req.query;
      req.params = result.params ?? req.params;

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: formatZodErrors(error.errors),
        });
      }

      // Unexpected error, pass to error handler
      return next(error);
    }
  };
}

/**
 * Validate only the request body
 */
export function validateBody(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync(req.body);
      req.body = result;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: formatZodErrors(error.errors),
        });
      }
      return next(error);
    }
  };
}

/**
 * Validate only query parameters
 */
export function validateQuery(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync(req.query);
      req.query = result;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: formatZodErrors(error.errors),
        });
      }
      return next(error);
    }
  };
}

/**
 * Validate only URL parameters
 */
export function validateParams(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync(req.params);
      req.params = result;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: formatZodErrors(error.errors),
        });
      }
      return next(error);
    }
  };
}

export default validate;
