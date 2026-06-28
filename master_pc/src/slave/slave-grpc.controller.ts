import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { PolicyService } from '../policy/policy.service';
import { Policy } from '../policy/policy.interface';
import { SlaveRegistryService } from './slave-registry.service';
import { EventLogService } from './event-log.service';
import { assertGrpcSharedToken } from '../security/grpc-auth';
import {
  SlaveInfoRequest,
  SlaveIdRequest,
  EventLogRequest,
} from './dto/slave-grpc.dto';

@Controller()
export class SlaveGrpcController {
  constructor(
    private readonly policyService: PolicyService,
    private readonly slaveRegistryService: SlaveRegistryService,
    private readonly eventLogService: EventLogService,
  ) {}

  @GrpcMethod('CheckNode', 'Register')
  register(data: SlaveInfoRequest, metadata?: Metadata) {
    assertGrpcSharedToken(metadata);
    return this.slaveRegistryService.register(data);
  }

  @GrpcMethod('CheckNode', 'SubscribePolicy')
  subscribePolicy(data: SlaveIdRequest, metadata?: Metadata): Observable<Policy> {
    assertGrpcSharedToken(metadata);
    return this.policyService.subscribePolicy(data.id);
  }

  @GrpcMethod('CheckNode', 'Heartbeat')
  heartbeat(data: SlaveIdRequest, metadata?: Metadata) {
    assertGrpcSharedToken(metadata);
    return this.eventLogService.heartbeat(data);
  }

  @GrpcMethod('CheckNode', 'ReportEvent')
  reportEvent(data: EventLogRequest, metadata?: Metadata) {
    assertGrpcSharedToken(metadata);
    return this.eventLogService.reportEvent(data);
  }
}
