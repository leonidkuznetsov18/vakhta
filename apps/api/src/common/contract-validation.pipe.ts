import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

/** Maintained Nest/Zod integration with the existing public validation envelope. */
export const ContractValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown) =>
    new BadRequestException({
      message: 'Некоректний запит',
      issues:
        error instanceof z.ZodError
          ? error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
          : [],
    }),
});
