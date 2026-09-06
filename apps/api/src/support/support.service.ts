import { Inject, Injectable, Optional } from '@nestjs/common';
import { DEFAULT_LOCALE, resolveLocale, type Locale } from '@vakhta/domain';
import { EmployeesService } from '../identity/employees.service.js';
import { SHORT_TERM_STORE, type ShortTermStore } from '../infra/short-term-store.js';
import { SUPPORT_ANSWERER, type Answerer, type ChatTurn } from './answerer.js';
import { KnowledgeService } from './knowledge.service.js';
import { SUPPORT_VOICE, type VoiceEngine } from './voice.js';

export interface SupportOptions {
  /** Telegram user ids allowed without an employee link (administrators, testers). */
  readonly allowedTelegramIds: readonly number[];
  readonly rateLimitPerHour: number;
  /** Turns (question + answer) kept as context of one chat. */
  readonly historyTurns: number;
}

export const SUPPORT_OPTIONS = Symbol('SUPPORT_OPTIONS');

export interface SupportUser {
  readonly telegramUserId: number;
  readonly languageCode?: string | undefined;
}

export type AskResult =
  | { readonly ok: true; readonly answer: string; readonly locale: Locale }
  | { readonly ok: false; readonly reason: 'NO_ACCESS' | 'RATE_LIMITED' | 'UNAVAILABLE' };

const LANGUAGE_NAMES: Record<Locale, string> = { uk: 'Ukrainian', en: 'English', ru: 'Russian' };
const HISTORY_TTL_SECONDS = 3600;
const RATE_TTL_SECONDS = 3600;

/**
 * The support assistant: who may ask, how often, what the model sees. Data of shifts, scores and
 * employees never enter the prompt; only the knowledge base and the conversation do.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly employees: EmployeesService,
    private readonly knowledge: KnowledgeService,
    @Inject(SHORT_TERM_STORE) private readonly store: ShortTermStore,
    @Inject(SUPPORT_OPTIONS) private readonly options: SupportOptions,
    @Optional() @Inject(SUPPORT_ANSWERER) private readonly answerer: Answerer | null = null,
    @Optional() @Inject(SUPPORT_VOICE) private readonly voice: VoiceEngine | null = null,
  ) {}

  get voiceEnabled(): boolean {
    return this.voice !== null;
  }

  get enabled(): boolean {
    return this.answerer !== null;
  }

  /** Linked employees (active) and the allow-list; the language follows the employee's choice. */
  async access(user: SupportUser): Promise<{ allowed: boolean; locale: Locale }> {
    const fallback = resolveLocale(user.languageCode);
    if (this.options.allowedTelegramIds.includes(user.telegramUserId)) {
      return { allowed: true, locale: fallback };
    }
    const linked = await this.employees.findByTelegramUserId(user.telegramUserId);
    if (!linked || linked.employee.status !== 'ACTIVE') return { allowed: false, locale: fallback };
    return { allowed: true, locale: linked.employee.locale ?? fallback };
  }

  async ask(user: SupportUser, question: string): Promise<AskResult> {
    const { allowed, locale } = await this.access(user);
    if (!allowed) return { ok: false, reason: 'NO_ACCESS' };
    if (!this.answerer) return { ok: false, reason: 'UNAVAILABLE' };
    const used = await this.store.incr(`support:rate:${user.telegramUserId}`, RATE_TTL_SECONDS);
    if (used > this.options.rateLimitPerHour) return { ok: false, reason: 'RATE_LIMITED' };

    const history = await this.history(user.telegramUserId);
    const trimmed = question.trim().slice(0, 4000);
    const answer = await this.answerer.answer({
      system: this.systemPrompt(locale),
      knowledge: this.knowledge.current.text,
      history,
      question: trimmed,
    });
    await this.remember(user.telegramUserId, [
      ...history,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: answer },
    ]);
    return { ok: true, answer, locale };
  }

  async reset(telegramUserId: number): Promise<void> {
    await this.store.del(`support:hist:${telegramUserId}`);
  }

  transcribe(audio: Uint8Array, locale: Locale): Promise<string> {
    if (!this.voice) throw new Error('voice is not configured');
    return this.voice.transcribe(audio, locale);
  }

  speak(text: string, locale: Locale): Promise<Uint8Array> {
    if (!this.voice) throw new Error('voice is not configured');
    return this.voice.speak(text, LANGUAGE_NAMES[locale]);
  }

  /** Written for the model, not for people: role, sources, language, shape of the answer. */
  systemPrompt(locale: Locale): string {
    return [
      'You are the support assistant of "Вахта", a shift-accounting system for a 24/7 production site:',
      'a Telegram bot for employees, a web admin panel for masters and administrators, and a QR kiosk at the checkpoint.',
      'Answer questions about how to use the system, relying only on the knowledge below: the feature docs,',
      'the user guide (in Russian) and the changelog of recent versions. When a question is about a recent change,',
      'use the changelog and name the version.',
      `Answer in ${LANGUAGE_NAMES[locale]} unless the question is clearly in another language; then answer in that language.`,
      'Be brief and concrete: name the exact buttons, commands and panel sections as they appear in the interface',
      '(keep Russian labels in quotes when the guide uses them). Give steps as a short numbered list when the answer is a procedure.',
      'If the knowledge does not cover the question, say so plainly and suggest asking the shift master or the administrator.',
      'Never invent features, numbers or settings. Never ask for passwords, codes or personal data.',
      'Plain text only: no Markdown headers, no tables, no bold markers; "•" bullets and "1." lists are fine.',
      'Keep answers under 1200 characters unless a step list needs more.',
    ].join(' ');
  }

  private async history(telegramUserId: number): Promise<ChatTurn[]> {
    const raw = await this.store.get(`support:hist:${telegramUserId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as ChatTurn[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async remember(telegramUserId: number, turns: ChatTurn[]): Promise<void> {
    const keep = turns.slice(-2 * this.options.historyTurns);
    await this.store.set(
      `support:hist:${telegramUserId}`,
      JSON.stringify(keep),
      HISTORY_TTL_SECONDS,
    );
  }
}

export { DEFAULT_LOCALE };
