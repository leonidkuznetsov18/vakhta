import { cn } from 'cn';

const HUES = [14, 32, 48, 96, 152, 190, 214, 250, 286, 330];

function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? email).slice(0, 2);
  return letters.toUpperCase();
}

function hueOf(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

/**
 * A user's picture: the uploaded photo, otherwise a generated circle with the initials on a
 * colour derived from the e-mail, so the same person always gets the same placeholder.
 */
export function UserAvatar({
  name,
  email,
  image,
  className,
}: {
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
  readonly className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className={cn('size-8 shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  const hue = hueOf(email.toLowerCase());
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={name}
      className={cn('size-8 shrink-0 rounded-full', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="20" fill={`hsl(${hue} 55% 42%)`} />
      <text
        x="20"
        y="25.5"
        textAnchor="middle"
        fontSize="16"
        fontWeight="600"
        fontFamily="inherit"
        fill="#ffffff"
      >
        {initialsOf(name, email)}
      </text>
    </svg>
  );
}

/** Shrinks a chosen photo to a square data URL small enough to live in the user row. */
export async function photoToDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
