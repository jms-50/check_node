import { Controller, Get, UseGuards } from '@nestjs/common';
import { SlaveRegistryService } from './slave-registry.service';
import { EventLogService } from './event-log.service';
import { AdminApiKeyGuard } from '../security/admin-api-key.guard';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class SlaveHttpController {
  constructor(
    private readonly slaveRegistryService: SlaveRegistryService,
    private readonly eventLogService: EventLogService,
  ) {}

  @Get('slaves')
  async getSlaves() {
    return this.slaveRegistryService.getSlaves();
  }

  @Get('events')
  async getEvents() {
    return this.eventLogService.getEvents();
  }
}
