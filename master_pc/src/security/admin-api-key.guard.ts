import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

const ADMIN_API_KEY_HEADER = 'x-admin-api-key';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredKey = process.env.ADMIN_API_KEY?.trim();
    if (!configuredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const headerValue = request.headers[ADMIN_API_KEY_HEADER];
    const providedKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (providedKey && safeCompare(providedKey, configuredKey)) {
      return true;
    }

    throw new UnauthorizedException('Invalid admin API key');
  }
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
