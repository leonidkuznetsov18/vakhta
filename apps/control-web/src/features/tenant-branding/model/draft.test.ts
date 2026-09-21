import { describe, expect, it } from 'vitest';
import { brandingCommand, brandingDirty, brandingDraft } from './draft';
const view = {
  displayName: 'Alpha',
  accentColor: '#2563eb',
  logoUrl: 'https://control.example.test/logo',
  updatedAt: '2026-09-21T10:00:00.000Z',
};
describe('branding drafts', () => {
  it('disables no-op saves, including reverted edits and colour case', () => {
    expect(brandingDirty(brandingDraft(view), view)).toBe(false);
    expect(
      brandingDirty(
        { ...brandingDraft(view), accentColor: '#2563EB', displayName: ' Alpha ' },
        view,
      ),
    ).toBe(false);
    expect(brandingDirty({ ...brandingDraft(view), displayName: 'Beta' }, view)).toBe(true);
  });
  it('distinguishes retaining, replacing and removing the logo', () => {
    const draft = brandingDraft(view);
    expect(brandingCommand(draft).data).not.toHaveProperty('logo');
    expect(brandingCommand({ ...draft, logo: null }).data?.logo).toBeNull();
    expect(brandingDirty({ ...draft, logo: null }, view)).toBe(true);
    expect(brandingDirty({ ...draft, logo: null, logoUrl: null }, { ...view, logoUrl: null })).toBe(
      false,
    );
  });
  it('validates name and colour and preserves the version seen when editing started', () => {
    expect(
      brandingCommand({ ...brandingDraft(view), displayName: ' ', accentColor: 'red' }).success,
    ).toBe(false);
    expect(brandingCommand({ ...brandingDraft(view), accentColor: '#ABCDEF' }).data).toMatchObject({
      accentColor: '#abcdef',
      expectedVersion: view.updatedAt,
    });
    expect(
      brandingCommand({ ...brandingDraft(view), accentColor: '' }).data?.accentColor,
    ).toBeNull();
  });
});
