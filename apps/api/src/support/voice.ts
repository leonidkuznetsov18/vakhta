/** Port for speech: a Telegram voice note in, a voice answer out. Tests use an in-memory one. */
export interface VoiceEngine {
  /** Text of an OGG/Opus voice note; `language` is an ISO 639-1 hint. */
  transcribe(audio: Uint8Array, language?: string): Promise<string>;
  /** OGG/Opus audio of the text, ready for `sendVoice`. */
  speak(text: string, language: string): Promise<Uint8Array>;
}

export const SUPPORT_VOICE = Symbol('SUPPORT_VOICE');

/** Telegram voice notes are Opus; the TTS input limit of the provider is 4096 characters. */
const TTS_INPUT_LIMIT = 4000;

/**
 * OpenAI audio endpoints over plain fetch: transcription (speech to text) and speech (text to
 * speech). No SDK: two requests are not worth a dependency.
 */
export class OpenAiVoice implements VoiceEngine {
  constructor(
    private readonly apiKey: string,
    private readonly options: {
      readonly transcribeModel?: string;
      readonly speechModel?: string;
      readonly voice?: string;
      readonly baseUrl?: string;
    } = {},
  ) {}

  private get base(): string {
    return this.options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async transcribe(audio: Uint8Array, language?: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/ogg' }), 'voice.ogg');
    form.append('model', this.options.transcribeModel ?? 'gpt-4o-mini-transcribe');
    if (language) form.append('language', language);
    const res = await fetch(`${this.base}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`transcription failed: ${res.status}`);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  }

  async speak(text: string, language: string): Promise<Uint8Array> {
    const res = await fetch(`${this.base}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.options.speechModel ?? 'gpt-4o-mini-tts',
        voice: this.options.voice ?? 'alloy',
        input: text.slice(0, TTS_INPUT_LIMIT),
        response_format: 'opus',
        instructions: `Speak clearly, calmly and friendly, in ${language}.`,
      }),
    });
    if (!res.ok) throw new Error(`speech synthesis failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
