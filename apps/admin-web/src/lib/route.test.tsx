import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readRoute, restoreLegacyRoute, useRoute, writeRoute } from './route';
import { clearPersistentState, setUiState, uiState } from './ui-store';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '#/');
  clearPersistentState();
});

it('opens retired knowledge-base bookmarks with the selected incident and full history', () => {
  setUiState({ 'incidents.scope': 'open', 'incidents.period': 'day', 'incidents.siteId': 'other' });
  history.replaceState(null, '', '#/incidentKnowledge/incident-id');
  restoreLegacyRoute();
  expect(readRoute()).toEqual({ section: 'incidents', sub: 'incident-id' });
  expect(uiState('incidents.scope')).toBe('all');
  expect(uiState('incidents.period')).toBe('all');
  expect(uiState('incidents.siteId')).toBe('');
  expect(uiState('incidents.openId')).toBe('incident-id');
  setUiState({ 'incidents.scope': 'open' });
  restoreLegacyRoute();
  expect(uiState('incidents.scope')).toBe('open');
});

it('normalizes old links during navigation without leaving a stale selected row', () => {
  function Reader() {
    const route = useRoute();
    return (
      <output>
        {route.section}/{route.sub}
      </output>
    );
  }
  history.replaceState(null, '', '#/incidents');
  setUiState({ 'incidents.openId': 'previous' });
  render(<Reader />);
  act(() => {
    history.replaceState(null, '', '#/incidentKnowledge');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(screen.getByText('incidents/')).toBeTruthy();
  expect(location.hash).toBe('#/incidents');
  expect(uiState('incidents.openId')).toBeNull();
  act(() => writeRoute('incidentKnowledge', 'next'));
  expect(screen.getByText('incidents/next')).toBeTruthy();
});

it('pushes a history entry when the section changes and replaces it within a section', () => {
  history.replaceState(null, '', '#/schedule');
  const before = history.length;
  writeRoute('operations', 'session-1');
  expect(location.hash).toBe('#/operations/session-1');
  expect(history.length).toBe(before + 1);
  writeRoute('operations', 'session-2');
  expect(location.hash).toBe('#/operations/session-2');
  expect(history.length).toBe(before + 1);
  writeRoute('operations');
  expect(location.hash).toBe('#/operations');
  expect(history.length).toBe(before + 1);
});
