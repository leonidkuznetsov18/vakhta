import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DomainError } from './domain-error.js';
import { isUnexpected } from './unexpected-error.filter.js';

describe('що вважається несподіваною помилкою для Sentry', () => {
  it('доменні і клієнтські помилки очікувані', () => {
    expect(isUnexpected(new DomainError('X', 409, 'конфлікт'))).toBe(false);
    expect(isUnexpected(new BadRequestException())).toBe(false);
  });

  it('500 і невідомі винятки несподівані', () => {
    expect(isUnexpected(new InternalServerErrorException())).toBe(true);
    expect(isUnexpected(new TypeError('boom'))).toBe(true);
    expect(isUnexpected('рядок')).toBe(true);
  });
});
