import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  // 1. 일반 HTTP 웹 서버 생성 (포트 3000)
  const app = await NestFactory.create(AppModule);

  // 2. HTTP 서버에 gRPC 마이크로서비스 기능 추가 (포트 50051)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'checknode',
      protoPath: join(__dirname, '../../pb/service.proto'), // 경로 주의!
      url: '0.0.0.0:50051',
    },
  });

  // 3. gRPC와 HTTP 모두 실행
  await app.startAllMicroservices();
  await app.listen(3000); // 관리자용 HTTP API 포트

  console.log('✅ Master Server is ready!');
  console.log('➡️  gRPC Port (For Slaves): 50051');
  console.log('➡️  HTTP Port (For Admins): http://localhost:3000');
}
bootstrap();