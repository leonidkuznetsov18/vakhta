import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RichText, linkSegments } from './rich-text';

afterEach(cleanup);

it('keeps the sentence punctuation out of a link', () => {
  expect(linkSegments('Каталог (https://example.com/a.pdf): див. с. 20.')).toEqual([
    { text: 'Каталог (' },
    { text: 'https://example.com/a.pdf', href: 'https://example.com/a.pdf' },
    { text: '): див. с. 20.' },
  ]);
});

it('renders paragraphs, line breaks, lists and links that open in a new tab', () => {
  const { container } = render(
    <RichText
      text={
        'Каталог: https://example.com/catalogue.pdf\nс. 20–21.\n\nПідготувати:\n- Масло EP2\n- Серветки\n\n1. Перевірити\n2. Записати'
      }
    />,
  );
  expect(container.querySelectorAll('p')).toHaveLength(2);
  expect(container.querySelectorAll('p br')).toHaveLength(1);
  expect(container.querySelector('p + ul')?.textContent).toBe('Масло EP2Серветки');
  expect(container.querySelectorAll('ul li')).toHaveLength(2);
  expect(container.querySelectorAll('ol li')).toHaveLength(2);
  const link = screen.getByRole('link', { name: 'https://example.com/catalogue.pdf' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
});
