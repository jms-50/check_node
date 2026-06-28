import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_ADMIN_ORIGINS = [
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

export function buildCorsOptions(): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(process.env.ADMIN_CORS_ORIGINS);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-API-Key'],
  };
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_ADMIN_ORIGINS;

  return new Set(origins);
}
