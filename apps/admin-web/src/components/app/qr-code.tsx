import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Skeleton } from '@/components/ui/skeleton';

/** QR of a link (activation deep link, pairing link) rendered on the client, nothing leaves the page. */
export function QrCode({
  value,
  size = 160,
  label,
}: {
  readonly value: string;
  readonly size?: number;
  readonly label: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <Skeleton style={{ width: size, height: size }} className="rounded-md" />;
  return (
    <img src={src} alt={label} width={size} height={size} className="rounded-md border bg-white" />
  );
}
