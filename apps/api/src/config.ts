import "dotenv/config";
import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    APP_ORIGIN: z.string().url().default("http://localhost:3000"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(300),
    MAX_ACTIVE_RUNS_PER_ORGANIZATION: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(20),
    RUN_STALE_AFTER_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(300),
    MAX_TARGET_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(10 * 1_024 * 1_024)
      .default(1_048_576),
    ENCRYPTION_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    ),
    ALLOW_INSECURE_HTTP_TARGETS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.ENCRYPTION_KEY)
      context.addIssue({
        code: "custom",
        path: ["ENCRYPTION_KEY"],
        message: "ENCRYPTION_KEY is required in production",
      });
  });

export const config = configSchema.parse(process.env);
