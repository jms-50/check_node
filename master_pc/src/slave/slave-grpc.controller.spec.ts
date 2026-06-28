import { Test, TestingModule } from '@nestjs/testing';
import { SlaveGrpcController } from './slave-grpc.controller';
import { PolicyService } from '../policy/policy.service';
import { SlaveRegistryService } from './slave-registry.service';
import { EventLogService } from './event-log.service';
import { of } from 'rxjs';

describe('SlaveGrpcController', () => {
  let controller: SlaveGrpcController;
  let policyService: PolicyService;
  let registryService: SlaveRegistryService;
  let eventLogService: EventLogService;

  beforeEach(async () => {
    const mockPolicyService = {
      subscribePolicy: jest.fn().mockReturnValue(of({ blocked_urls: [], blocked_processes: [], timestamp: 12345 })),
    };
    const mockRegistryService = {
      register: jest.fn().mockReturnValue({ slave_id: 'mock-id' }),
    };
    const mockEventLogService = {
      heartbeat: jest.fn().mockReturnValue({}),
      reportEvent: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlaveGrpcController],
      providers: [
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: SlaveRegistryService, useValue: mockRegistryService },
        { provide: EventLogService, useValue: mockEventLogService },
      ],
    }).compile();

    controller = module.get<SlaveGrpcController>(SlaveGrpcController);
    policyService = module.get<PolicyService>(PolicyService);
    registryService = module.get<SlaveRegistryService>(SlaveRegistryService);
    eventLogService = module.get<EventLogService>(EventLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call registryService.register and return the result', () => {
      const dto = { hostname: 'test-pc' };
      const res = controller.register(dto);
      expect(registryService.register).toHaveBeenCalledWith(dto);
      expect(res).toEqual({ slave_id: 'mock-id' });
    });
  });

  describe('subscribePolicy', () => {
    it('should call policyService.subscribePolicy and return the stream', (done) => {
      const dto = { id: 'mock-id' };
      controller.subscribePolicy(dto).subscribe((res) => {
        expect(policyService.subscribePolicy).toHaveBeenCalledWith('mock-id');
        expect(res).toEqual({ blocked_urls: [], blocked_processes: [], timestamp: 12345 });
        done();
      });
    });
  });

  describe('heartbeat', () => {
    it('should call eventLogService.heartbeat and return the result', () => {
      const dto = { id: 'mock-id' };
      const res = controller.heartbeat(dto);
      expect(eventLogService.heartbeat).toHaveBeenCalledWith(dto);
      expect(res).toEqual({});
    });
  });

  describe('reportEvent', () => {
    it('should call eventLogService.reportEvent and return the result', () => {
      const dto = { slave_id: 'mock-id', target: 'notepad.exe', type: 'process', timestamp: 123456 };
      const res = controller.reportEvent(dto);
      expect(eventLogService.reportEvent).toHaveBeenCalledWith(dto);
      expect(res).toEqual({});
    });
  });
});
