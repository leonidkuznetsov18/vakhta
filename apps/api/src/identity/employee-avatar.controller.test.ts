import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service.js';
import { RolesService } from '../auth/roles.service.js';
import { EmployeeAvatarController } from './employee-avatar.controller.js';
import { EmployeeAvatarService } from './employee-avatar.service.js';

const imageUrl = 'https://media.example.test/synthetic-avatar.webp';
@Module({
  controllers: [EmployeeAvatarController],
  providers: [
    { provide: EmployeeAvatarService, useValue: { get: async () => imageUrl } },
    { provide: AuthService, useValue: { sessionUser: async () => ({ id: 'synthetic-reader' }) } },
    { provide: RolesService, useValue: { grantsOf: async () => [] } },
  ],
})
class AvatarHttpModule {}

describe('employee avatar HTTP delivery', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AvatarHttpModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  it('redirects the image request instead of returning an empty successful image', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/employees/11111111-1111-4111-8111-111111111111/avatar',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(imageUrl);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
});
