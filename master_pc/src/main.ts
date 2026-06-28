import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { join } from 'path';
import { buildCorsOptions } from './security/cors';

async function bootstrap() {
  // 1. 일반 HTTP 웹 서버 생성 (포트 3000)
  const app = await NestFactory.create(AppModule);

  app.enableCors(buildCorsOptions());

  if (!process.env.ADMIN_API_KEY) {
    console.warn(
      '⚠️  ADMIN_API_KEY is not set. Admin HTTP API is running without API key protection.',
    );
  }
  if (!process.env.GRPC_SHARED_TOKEN) {
    console.warn(
      '⚠️  GRPC_SHARED_TOKEN is not set. Slave gRPC API is running without shared-token protection.',
    );
  }

  const grpcBindUrl = process.env.GRPC_BIND_URL || '0.0.0.0:50051';

  // 2. HTTP 서버에 gRPC 마이크로서비스 기능 추가 (포트 50051)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'checknode',
      protoPath: join(__dirname, '../../pb/service.proto'), // 경로 주의!
      url: grpcBindUrl,
      loader: {
        keepCase: true,
      },
    },
  });

  // 3. gRPC와 HTTP 모두 실행
  await app.startAllMicroservices();
  const httpPort = Number(process.env.HTTP_PORT || 3000);
  await app.listen(httpPort); // 관리자용 HTTP API 포트

  console.log('✅ Master Server is ready!');
  console.log(`➡️  gRPC Bind URL (For Slaves): ${grpcBindUrl}`);
  console.log(`➡️  HTTP Port (For Admins): http://localhost:${httpPort}`);
}
void bootstrap();
