import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('policy', () => {
    it('returns the current policy', () => {
      expect(appController.getPolicy()).toMatchObject({
        blocked_urls: [],
        blocked_processes: [],
      });
    });

    it('updates and returns the policy', () => {
      const result = appController.updatePolicy({
        blocked_urls: ['example.com'],
        blocked_processes: ['notepad.exe'],
      });

      expect(result.policy).toMatchObject({
        blocked_urls: ['example.com'],
        blocked_processes: ['notepad.exe'],
      });
      expect(appController.getPolicy()).toMatchObject(result.policy);
    });
  });
});
