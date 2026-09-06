import { fireEvent, screen } from '@testing-library/react';

/**
 * Activates an entry of the n-th row menu. The test setup replaces the Radix dropdown with a
 * plain list of `menuitem` buttons, so the entry is clickable without opening anything.
 */
export async function clickRowAction(label: string, index = 0): Promise<void> {
  const items = await screen.findAllByRole('menuitem', { name: label });
  const item = items[index];
  if (!item) throw new Error(`Row action "${label}" #${index} not found`);
  fireEvent.click(item);
}
