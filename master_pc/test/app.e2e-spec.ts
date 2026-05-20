import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/admin/policy (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin/policy')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          blocked_urls: string[];
          blocked_processes: string[];
        };

        expect(body).toMatchObject({
          blocked_urls: [],
          blocked_processes: [],
        });
      });
  });

  it('/admin/policy (POST)', () => {
    return request(app.getHttpServer())
      .post('/admin/policy')
      .send({
        blocked_urls: ['example.com'],
        blocked_processes: ['notepad.exe'],
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as {
          policy: {
            blocked_urls: string[];
            blocked_processes: string[];
          };
        };

        expect(body.policy).toMatchObject({
          blocked_urls: ['example.com'],
          blocked_processes: ['notepad.exe'],
        });
      });
  });
});
