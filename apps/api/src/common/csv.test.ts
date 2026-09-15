import { describe, expect, it } from 'vitest';
import { serializeCsv } from './csv.js';

describe('CSV export dialect', () => {
  it('preserves semicolons, LF, BOM choice and no final newline', () => {
    const rows = [
      ['number', 'name'],
      ['0001', 'Анна Коваль'],
    ];
    const plain = 'number;name\n0001;Анна Коваль';
    expect(serializeCsv(rows, { bom: false })).toBe(plain);
    expect(serializeCsv(rows, { bom: true })).toBe(`\uFEFF${plain}`);
  });
  it('quotes delimiters, CR/LF and quotes without corrupting text', () => {
    expect(serializeCsv([['a;b', 'say "yes"', 'a\nb', 'a\rb', '', null]], { bom: false })).toBe(
      '"a;b";"say ""yes""";"a\nb";"a\rb";;',
    );
  });
  it.each([
    '=1+1',
    '+SUM(A1)',
    '-1',
    '@value',
    '\tvalue',
    '\rvalue',
    '＝1+1',
    '＋1',
    '－1',
    '＠value',
  ])('neutralizes formula-like text %j', (text) => {
    const csv = serializeCsv([[text]], { bom: false });
    expect(csv.startsWith(text.startsWith('\r') ? '"\'' : "'")).toBe(true);
  });
  it('retains negative/fractional numbers and protects numeric-looking strings separately', () => {
    expect(serializeCsv([[-12.5, 0, 42, '-12.5', '0001']], { bom: false })).toBe(
      "-12.5;0;42;'-12.5;0001",
    );
  });
});
