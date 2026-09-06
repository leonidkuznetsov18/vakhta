import { describe, expect, it } from 'vitest';
import {
  ArriveCommand,
  CreateEmployeeCommand,
  TransitionCommand,
  TransitionResponse,
} from './index.js';

const session = {
  id: '3f8c1a5e-6b7d-4c2e-9a1b-0d2e3f4a5b6c',
  employeeId: '3f8c1a5e-6b7d-4c2e-9a1b-0d2e3f4a5b6d',
  assignmentId: '3f8c1a5e-6b7d-4c2e-9a1b-0d2e3f4a5b6e',
  businessDate: '2026-09-05',
  state: 'WORKING',
  resumeState: null,
  version: 3,
  startedAt: '2026-09-05T05:01:12.000Z',
  endedAt: null,
  stateSince: '2026-09-05T05:01:12.000Z',
  planStartAt: '2026-09-05T05:00:00.000Z',
  planEndAt: '2026-09-05T17:00:00.000Z',
  zoneId: null,
  zoneName: null,
  zoneAccepted: true,
  needsClarification: false,
  clarificationReason: null,
};

describe('employee contacts', () => {
  it('normalizes the phone and the Telegram username, treats blanks as absent', () => {
    const ok = CreateEmployeeCommand.parse({
      personnelNumber: '0042',
      fullName: 'Іваненко Іван',
      email: ' Ivan@Example.com ',
      phone: '067 123-45-67',
      telegramUsername: '@Ivan_Ivanenko',
    });
    expect(ok).toMatchObject({
      email: 'ivan@example.com',
      phone: '+380671234567',
      telegramUsername: 'Ivan_Ivanenko',
      status: 'ACTIVE',
    });
    const blank = CreateEmployeeCommand.parse({
      personnelNumber: '0043',
      fullName: 'Петренко Петро',
      email: '',
      phone: '  ',
      telegramUsername: '',
    });
    expect(blank.email).toBeUndefined();
    expect(blank.phone).toBeUndefined();
    expect(blank.telegramUsername).toBeUndefined();
    expect(
      CreateEmployeeCommand.safeParse({ personnelNumber: '1', fullName: 'Abc Def', phone: '12345' })
        .success,
    ).toBe(false);
    expect(
      CreateEmployeeCommand.safeParse({
        personnelNumber: '1',
        fullName: 'Abc Def',
        telegramUsername: 'ab',
      }).success,
    ).toBe(false);
  });
});

describe('контракти', () => {
  it('команда переходу приймає лише відомі дії й коди причин', () => {
    expect(
      TransitionCommand.safeParse({
        shiftSessionId: session.id,
        action: 'START_DOWNTIME',
        expectedVersion: 3,
        idempotencyKey: 'cbq:1234567890',
        reasonCode: 'NO_MATERIAL',
      }).success,
    ).toBe(true);
    expect(
      TransitionCommand.safeParse({
        shiftSessionId: session.id,
        action: 'TELEPORT',
        expectedVersion: 3,
        idempotencyKey: 'cbq:1234567890',
      }).success,
    ).toBe(false);
    expect(
      TransitionCommand.safeParse({
        shiftSessionId: session.id,
        action: 'START_DOWNTIME',
        expectedVersion: 3,
        idempotencyKey: 'cbq:1',
        reasonCode: 'lower case',
      }).success,
    ).toBe(false);
  });

  it('відповідь на команду завжди несе актуальний стан', () => {
    expect(
      TransitionResponse.safeParse({
        ok: true,
        session,
        summary: null,
        replayed: false,
        serverTime: '2026-09-05T05:02:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      TransitionResponse.safeParse({
        ok: false,
        error: 'TEMPORARY_STATE_OPEN',
        session,
        serverTime: '2026-09-05T05:02:00.000Z',
      }).success,
    ).toBe(true);
    expect(TransitionResponse.safeParse({ ok: false, error: 'X' }).success).toBe(false);
  });

  it('QR-токен обмежений 64 base64url-символами (FR-QR-02)', () => {
    expect(
      ArriveCommand.safeParse({ challengeToken: 'A'.repeat(64), idempotencyKey: 'upd:1001' })
        .success,
    ).toBe(true);
    expect(
      ArriveCommand.safeParse({ challengeToken: 'A'.repeat(65), idempotencyKey: 'upd:1001' })
        .success,
    ).toBe(false);
    expect(
      ArriveCommand.safeParse({ challengeToken: 'a b', idempotencyKey: 'upd:1001' }).success,
    ).toBe(false);
  });
});
