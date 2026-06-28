import { Test, TestingModule } from '@nestjs/testing';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';

describe('PolicyController', () => {
  let policyController: PolicyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PolicyController],
      providers: [PolicyService],
    }).compile();

    policyController = module.get<PolicyController>(PolicyController);

    // OnModuleInit 수동 실행하여 초기 정책 로딩 처리
    const policyService = module.get<PolicyService>(PolicyService);
    policyService.onModuleInit();
  });

  describe('policy', () => {
    it('returns the current policy', () => {
      expect(policyController.getPolicy()).toMatchObject({
        blocked_urls: [],
        blocked_processes: [],
      });
    });

    it('updates and returns the policy', async () => {
      const result = await policyController.updatePolicy({
        blocked_urls: ['example.com'],
        blocked_processes: ['notepad.exe'],
      });

      expect(result.policy).toMatchObject({
        blocked_urls: ['example.com'],
        blocked_processes: ['notepad.exe'],
      });
      expect(policyController.getPolicy()).toMatchObject(result.policy);
    });

    it('normalizes duplicated hosts and rejects protected processes', async () => {
      await expect(
        policyController.updatePolicy({
          blocked_urls: ['https://Example.com/path', 'example.com'],
          blocked_processes: ['explorer.exe'],
        }),
      ).rejects.toThrow();
    });
  });
});
