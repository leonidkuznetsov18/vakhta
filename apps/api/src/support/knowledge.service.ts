import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { createLogger } from '../logger.js';

export interface Knowledge {
  /** Everything the assistant may rely on, as one text with section headers. */
  readonly text: string;
  readonly files: readonly string[];
  readonly loadedAt: Date;
}

/** How much of the changelog travels with every question: the latest releases are what matters. */
const CHANGELOG_CHARS = 8000;

/**
 * Knowledge base of the support assistant (docs/features/README.md): the feature docs, the user
 * guide and the changelog of the running build. In the Docker image they live under
 * SUPPORT_KNOWLEDGE_DIR; in development the repository `docs` folder is found from the cwd.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private knowledge: Knowledge = { text: '', files: [], loadedAt: new Date(0) };
  private readonly logger;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.logger = createLogger({
      LOG_LEVEL: this.config.get('LOG_LEVEL', { infer: true }),
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
    });
  }

  onModuleInit(): void {
    const dir = this.locate();
    if (!dir) {
      this.logger.warn('support knowledge: no docs folder found, the assistant answers without it');
      return;
    }
    this.knowledge = loadKnowledge(dir);
    this.logger.info(
      { dir, files: this.knowledge.files.length, chars: this.knowledge.text.length },
      'support knowledge loaded',
    );
  }

  get current(): Knowledge {
    return this.knowledge;
  }

  private locate(): string | null {
    const configured = this.config.get('SUPPORT_KNOWLEDGE_DIR', { infer: true });
    const candidates = [
      configured,
      resolve(process.cwd(), 'docs'),
      resolve(process.cwd(), '../../docs'),
    ].filter((c): c is string => Boolean(c));
    return candidates.find((c) => existsSync(join(c, 'features'))) ?? null;
  }
}

/** Reads the folder layout of the image or of the repository `docs` folder. */
export function loadKnowledge(dir: string): Knowledge {
  const parts: string[] = [];
  const files: string[] = [];
  const featuresDir = join(dir, 'features');
  for (const name of readdirSync(featuresDir).sort()) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    parts.push(`# FEATURE DOC: ${name}\n\n${readFileSync(join(featuresDir, name), 'utf8').trim()}`);
    files.push(`features/${name}`);
  }
  const guide = [
    join(dir, 'vakhta-user-guide.ru.html'),
    join(dir, 'user-guide/vakhta-user-guide.ru.html'),
  ].find((p) => existsSync(p));
  if (guide) {
    parts.push(
      `# USER GUIDE (Russian, the text the employees have)\n\n${htmlToText(readFileSync(guide, 'utf8'))}`,
    );
    files.push('user-guide');
  }
  const changelog = [join(dir, 'CHANGELOG.md'), join(dir, '../CHANGELOG.md')].find((p) =>
    existsSync(p),
  );
  if (changelog) {
    parts.push(
      `# CHANGELOG (latest releases first)\n\n${readFileSync(changelog, 'utf8').slice(0, CHANGELOG_CHARS)}`,
    );
    files.push('CHANGELOG.md');
  }
  return { text: parts.join('\n\n---\n\n'), files, loadedAt: new Date() };
}

/** The guide is print HTML; the assistant needs its words, one paragraph per line. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const withBreaks = withoutBlocks
    .replace(/<\/(p|li|h[1-6]|tr|div|figcaption)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ');
  const text = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)));
}
