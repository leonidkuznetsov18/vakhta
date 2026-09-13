import { expect, it } from 'vitest';
import { questionnaireEntry } from './entry';

it('keeps malformed and absent questionnaire IDs outside the administrative application', () => {
  for (const search of ['', '?questionnaire=invalid']) {
    expect(questionnaireEntry({ pathname: '/questionnaire', search })).toEqual({
      kind: 'questionnaire',
      id: '',
    });
  }
  expect(questionnaireEntry({ pathname: '/', search: '' })).toEqual({ kind: 'admin' });
});

it('accepts dedicated and legacy invitations without changing their identity', () => {
  const id = 'de8513c1-3469-48eb-b4d1-21295d63698e';
  for (const pathname of ['/', '/questionnaire']) {
    expect(questionnaireEntry({ pathname, search: `?questionnaire=${id}` })).toEqual({
      kind: 'questionnaire',
      id,
    });
  }
});
