import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { IApiResponse } from '@shared/types';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Every schema in src/validators/schemas.ts is declared in "envelope" form, e.g.
 *
 *   z.object({ body: z.object({ email: ..., password: ... }) })
 *
 * The combined `validate()` middleware understands that shape because it feeds
 * the whole `{ body, query, params }` triple to zod. The targeted helpers
 * (`validateBody` / `validateQuery` / `validateParams`) used to parse the bare
 * request part instead, so they looked for `req.body.body` and rejected every
 * valid request with 400 "Validation failed" -- this is what made login fail.
 *
 * These helpers now unwrap the envelope: they parse `{ <target>: part }` and
 * write the validated inner object back onto the request, so both the parsed
 * values (zod coercions, defaults, strips) and the flat shape controllers
 * expect are both preserved.
 */
const buildFailureResponse = (error: ZodError): IApiResponse => ({
  success: false,
  error: 'Validation failed',
  data: {
    errors: error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    })),
  } as unknown as IApiResponse['data'],
});

/**
 * Run a schema against ONE request part.
 *
 * Every schema in src/validators/schemas.ts is envelope-shaped, e.g.
 *
 *   z.object({ body: z.object({ ... }), params: z.object({ loanId }) })
 *
 * so validation always receives the full `{ body, query, params }` triple. The
 * requested part is then written back onto the request (unwrapped from its
 * envelope) so controllers see the flat shape they expect, with zod's
 * coercions, defaults and strips applied.
 *
 * Sibling parts declared on the same schema (e.g. `params` on a body schema)
 * are validated too, which is why the routes can lean on one schema per
 * endpoint instead of chaining validateBody + validateParams.
 */
const runValidator =
  (target: ValidationTarget) =>
  (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const request = req as unknown as Record<ValidationTarget, unknown>;
      const result = (await schema.parseAsync({
        body: request.body ?? {},
        query: request.query ?? {},
        params: request.params ?? {},
      })) as Record<string, unknown>;

      for (const key of ['body', 'query', 'params'] as const) {
        if (!(key in result)) continue;
        const value = result[key];
        if (key === 'query') {
          Object.assign(request.query as object, value);
        } else {
          request[key] = value;
        }
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(buildFailureResponse(error));
        return;
      }
      next(error);
    }
  };

export const validate = (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as Record<string, unknown>;

      if (result.body !== undefined) req.body = result.body;
      if (result.query !== undefined) {
        Object.assign(req.query, result.query);
      }
      if (result.params !== undefined) {
        Object.assign(req.params, result.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(buildFailureResponse(error));
        return;
      }
      next(error);
    }
  };

export const validateBody = runValidator('body');
export const validateQuery = runValidator('query');
export const validateParams = runValidator('params');
