import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaveGrpcController } from './slave-grpc.controller';
import { SlaveHttpController } from './slave-http.controller';
import { SlaveRegistryService } from './slave-registry.service';
import { EventLogService } from './event-log.service';
import { PolicyModule } from '../policy/policy.module';
import { SlaveEntity } from './slave.entity';
import { EventLogEntity } from './event-log.entity';
import { AdminApiKeyGuard } from '../security/admin-api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaveEntity, EventLogEntity]),
    PolicyModule,
  ],
  controllers: [SlaveGrpcController, SlaveHttpController],
  providers: [SlaveRegistryService, EventLogService, AdminApiKeyGuard],
})
export class SlaveModule {}
