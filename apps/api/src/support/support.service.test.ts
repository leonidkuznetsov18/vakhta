import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryShortTermStore } from '../infra/short-term-store.js';
import type { EmployeesService } from '../identity/employees.service.js';
import type { AnswerInput } from './answerer.js';
import { htmlToText, loadKnowledge, type KnowledgeService } from './knowledge.service.js';
import { SupportService } from './support.service.js';

const LINKED = 111;
const STRANGER = 222;
const ADMIN = 333;

function employees(): EmployeesService {
  return {
    findByTelegramUserId: async (id: number) =>
      id === LINKED
        ? { employee: { id: 'e1', status: 'ACTIVE', locale: 'uk' }, link: { telegramUserId: id } }
        : null,
  } as unknown as EmployeesService;
}

function knowledge(text = 'FEATURE DOC: the shift starts with "Начать смену".'): KnowledgeService {
  return {
    current: { text, files: ['features/x.md'], loadedAt: new Date() },
  } as unknown as KnowledgeService;
}

describe('SupportService', () => {
  it('answers linked employees in their language, keeps the context and forwards the knowledge', async () => {
    const seen: AnswerInput[] = [];
    const answerer = {
      answer: async (input: AnswerInput) => {
        seen.push(input);
        return `answer #${seen.length}`;
      },
    };
    const store = new InMemoryShortTermStore();
    const service = new SupportService(
      employees(),
      knowledge(),
      store,
      { allowedTelegramIds: [ADMIN], rateLimitPerHour: 40, historyTurns: 2 },
      answerer,
      null,
    );
    const first = await service.ask(
      { telegramUserId: LINKED, languageCode: 'en' },
      'How to start?',
    );
    expect(first).toEqual({ ok: true, answer: 'answer #1', locale: 'uk' });
    expect(seen[0]?.system).toContain('Answer in Ukrainian');
    expect(seen[0]?.knowledge).toContain('Начать смену');
    expect(seen[0]?.history).toEqual([]);

    await service.ask({ telegramUserId: LINKED }, 'And then?');
    await service.ask({ telegramUserId: LINKED }, 'And after that?');
    // historyTurns = 2: the model sees the last two exchanges only
    expect(seen[2]?.history).toEqual([
      { role: 'user', content: 'How to start?' },
      { role: 'assistant', content: 'answer #1' },
      { role: 'user', content: 'And then?' },
      { role: 'assistant', content: 'answer #2' },
    ]);
    await service.reset(LINKED);
    await service.ask({ telegramUserId: LINKED }, 'Fresh start');
    expect(seen[3]?.history).toEqual([]);
    expect(service.voiceEnabled).toBe(false);
  });

  it('refuses strangers, admits the allow-list, and stops at the hourly limit', async () => {
    const answerer = { answer: async () => 'ok' };
    const service = new SupportService(
      employees(),
      knowledge(),
      new InMemoryShortTermStore(),
      { allowedTelegramIds: [ADMIN], rateLimitPerHour: 2, historyTurns: 2 },
      answerer,
      null,
    );
    expect(await service.ask({ telegramUserId: STRANGER }, 'hi')).toEqual({
      ok: false,
      reason: 'NO_ACCESS',
    });
    expect((await service.ask({ telegramUserId: ADMIN, languageCode: 'ru' }, 'q1')).ok).toBe(true);
    expect((await service.ask({ telegramUserId: ADMIN }, 'q2')).ok).toBe(true);
    expect(await service.ask({ telegramUserId: ADMIN }, 'q3')).toEqual({
      ok: false,
      reason: 'RATE_LIMITED',
    });
  });

  it('reports the assistant as unavailable without a model', async () => {
    const service = new SupportService(
      employees(),
      knowledge(),
      new InMemoryShortTermStore(),
      { allowedTelegramIds: [], rateLimitPerHour: 40, historyTurns: 2 },
      null,
      null,
    );
    expect(service.enabled).toBe(false);
    expect(await service.ask({ telegramUserId: LINKED }, 'q')).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
    });
  });
});

describe('knowledge base', () => {
  it('loads the feature docs, the guide as text and the head of the changelog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vakhta-knowledge-'));
    mkdirSync(join(dir, 'features'));
    writeFileSync(join(dir, 'features', 'README.md'), '# not for the model');
    writeFileSync(join(dir, 'features', '02-b.md'), '# B\n\nSecond.');
    writeFileSync(join(dir, 'features', '01-a.md'), '# A\n\nFirst.');
    writeFileSync(
      join(dir, 'vakhta-user-guide.ru.html'),
      '<html><style>p{}</style><body><h1>Руководство</h1><p>Нажмите <kbd>Начать смену</kbd> &amp; ждите.</p><svg><text>x</text></svg></body></html>',
    );
    writeFileSync(join(dir, 'CHANGELOG.md'), '## 0.12.0\n\n* feat: x\n');
    const k = loadKnowledge(dir);
    expect(k.files).toEqual(['features/01-a.md', 'features/02-b.md', 'user-guide', 'CHANGELOG.md']);
    expect(k.text.indexOf('First.')).toBeLessThan(k.text.indexOf('Second.'));
    expect(k.text).not.toContain('not for the model');
    expect(k.text).toContain('Нажмите Начать смену & ждите.');
    expect(k.text).not.toContain('<svg');
    expect(k.text).toContain('## 0.12.0');
  });

  it('turns print HTML into lines', () => {
    expect(htmlToText('<p>One&nbsp;two</p><table><tr><td>a</td><td>b</td></tr></table>')).toBe(
      'One two\na | b |',
    );
  });
});
