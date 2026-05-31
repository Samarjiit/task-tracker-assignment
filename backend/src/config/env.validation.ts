import * as Joi from 'joi';

/** Validates process env at boot — fail fast on misconfiguration. */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  REDIS_HOST: Joi.string().default('redis'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_TLS: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(8).required(),
  JWT_REFRESH_SECRET: Joi.string().min(8).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(604800),

  TASK_CACHE_TTL: Joi.number().default(60),
});
