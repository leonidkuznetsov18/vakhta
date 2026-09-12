import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { InspectionPhotoNavigation } from './photo-navigation';

afterEach(cleanup);
it('navigates between photos and disables unavailable first and last neighbors', () => {
  const t = messages(currentLocale()).photoInspection;
  const previous = vi.fn();
  const next = vi.fn();
  const { rerender } = render(
    <InspectionPhotoNavigation navigation={{ index: 0, count: 3, previous, next }} />,
  );
  expect(screen.getByRole('button', { name: t.previous }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t.previous }));
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  expect(previous).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
  rerender(<InspectionPhotoNavigation navigation={{ index: 2, count: 3, previous, next }} />);
  expect(screen.getByRole('button', { name: t.next }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t.previous }));
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  expect(previous).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledTimes(1);
});
