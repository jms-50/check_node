import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { timingSafeEqual } from 'crypto';

const GRPC_TOKEN_HEADER = 'x-checknode-token';

export function assertGrpcSharedToken(metadata?: Metadata): void {
  const expectedToken = process.env.GRPC_SHARED_TOKEN?.trim();
  if (!expectedToken) {
    return;
  }

  const providedToken = getMetadataValue(metadata, GRPC_TOKEN_HEADER);
  if (providedToken && safeCompare(providedToken, expectedToken)) {
    return;
  }

  throw new RpcException({
    code: status.UNAUTHENTICATED,
    message: 'Invalid gRPC shared token',
  });
}

function getMetadataValue(metadata: Metadata | undefined, key: string): string | undefined {
  const values = metadata?.get(key) ?? [];
  const first = values[0];

  if (typeof first === 'string') {
    return first;
  }

  if (Buffer.isBuffer(first)) {
    return first.toString('utf8');
  }

  return undefined;
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
