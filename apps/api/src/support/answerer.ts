import Anthropic from '@anthropic-ai/sdk';

export interface ChatTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AnswerInput {
  /** Instructions for the assistant: role, tone, language, limits. */
  readonly system: string;
  /** The knowledge base; large and stable, so it is cached on the provider side. */
  readonly knowledge: string;
  readonly history: readonly ChatTurn[];
  readonly question: string;
}

/** Port for the language model; tests use an in-memory implementation. */
export interface Answerer {
  answer(input: AnswerInput): Promise<string>;
}

export const SUPPORT_ANSWERER = Symbol('SUPPORT_ANSWERER');

/**
 * Claude through the official SDK. The knowledge block carries `cache_control`, so a busy hour of
 * questions pays for the docs once every few minutes instead of on every message.
 */
export class AnthropicAnswerer implements Answerer {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly maxTokens = 1024,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async answer(input: AnswerInput): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: [
        { type: 'text', text: input.system },
        { type: 'text', text: input.knowledge, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        ...input.history.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: input.question },
      ],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return text;
  }
}
