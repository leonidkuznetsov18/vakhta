/**
 * Перцептивний хеш (pHash) з DCT: вхід — квадрат у градаціях сірого 32×32 (row-major, 0..255).
 * Береться низькочастотний блок 8×8 без DC, порівнюється з медіаною; вихід 64 біти як 16 hex.
 */
export const PHASH_SIZE = 32;

function dct1d(input: readonly number[]): number[] {
  const n = input.length;
  const out = new Array<number>(n);
  for (let k = 0; k < n; k += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += input[i]! * Math.cos(((2 * i + 1) * k * Math.PI) / (2 * n));
    }
    out[k] = sum * (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n));
  }
  return out;
}

export function phashFromGray(pixels: ArrayLike<number>, size: number = PHASH_SIZE): string {
  if (pixels.length !== size * size) {
    throw new Error(`phash: очікується ${size * size} пікселів, отримано ${pixels.length}`);
  }
  // DCT по рядках, потім по стовпцях (сепарабельне 2D DCT-II).
  const rows: number[][] = [];
  for (let y = 0; y < size; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < size; x += 1) row.push(pixels[y * size + x]!);
    rows.push(dct1d(row));
  }
  const low = 8;
  const block: number[] = [];
  for (let x = 0; x < low; x += 1) {
    const column: number[] = [];
    for (let y = 0; y < size; y += 1) column.push(rows[y]![x]!);
    const col = dct1d(column);
    for (let y = 0; y < low; y += 1) block[y * low + x] = col[y]!;
  }
  const ac = block.slice(1);
  const sorted = [...ac].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let i = 0; i < block.length; i += 1) {
    const bit = i === 0 ? 0 : block[i]! > median ? 1 : 0;
    nibble = (nibble << 1) | bit;
    bits += 1;
    if (bits === 4) {
      hex += nibble.toString(16);
      nibble = 0;
      bits = 0;
    }
  }
  return hex;
}
