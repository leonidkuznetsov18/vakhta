import { Uuid } from '@vakhta/contracts';

/** An embeddable questionnaire address must never fall back to the admin application. */
export function questionnaireEntry(location: {
  pathname: string;
  search: string;
}): { kind: 'admin' } | { kind: 'questionnaire'; id: string } {
  const parsed = Uuid.safeParse(new URLSearchParams(location.search).get('questionnaire'));
  if (location.pathname !== '/questionnaire' && !parsed.success) return { kind: 'admin' };
  return { kind: 'questionnaire', id: parsed.success ? parsed.data : '' };
}
