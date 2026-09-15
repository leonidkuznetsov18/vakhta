import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AdminEmployeesController } from '../dist/identity/admin-employees.controller.js';
import { EmployeesService } from '../dist/identity/employees.service.js';
import { PositionsService } from '../dist/identity/positions.service.js';
import { ActivationService } from '../dist/identity/activation.service.js';
import { WebAuthGuard } from '../dist/auth/web-auth.guard.js';

// Reflection only: no database, listener, credentials or callable business services.
const module = await Test.createTestingModule({
  controllers: [AdminEmployeesController],
  providers: [EmployeesService, PositionsService, ActivationService].map((provide) => ({
    provide,
    useValue: {},
  })),
})
  .overrideGuard(WebAuthGuard)
  .useValue({ canActivate: () => false })
  .compile();
const app = module.createNestApplication(new FastifyAdapter(), { logger: false });
try {
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setOpenAPIVersion('3.1.0')
        .setTitle('Vakhta employee contracts')
        .setVersion('1')
        .addCookieAuth()
        .build(),
    ),
  );
  const selected = ['/admin/employees/page', '/admin/employees/import'];
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => selected.includes(path)),
  );
  if (Object.keys(document.paths).length !== selected.length)
    throw new Error('Missing employee operation');
  await writeFile(
    new URL('../../../contracts/openapi/employees.json', import.meta.url),
    `${JSON.stringify(document, null, 2)}\n`,
  );
} finally {
  await app.close();
}
