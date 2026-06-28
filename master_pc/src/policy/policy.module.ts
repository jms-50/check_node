import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { AdminApiKeyGuard } from '../security/admin-api-key.guard';

@Module({
  imports: [],
  controllers: [PolicyController],
  providers: [PolicyService, AdminApiKeyGuard],
  exports: [PolicyService],
})
export class PolicyModule {}
