import { QueryFeedback } from '@/components/app/query-feedback';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Skeleton } from '@/components/ui/skeleton';
import { keys } from '@/lib/query';

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
  const code = useQuery({
    queryKey: keys.qr(value, size),
    queryFn: () => QRCode.toDataURL(value, { margin: 1, width: size }),
    retry: false,
  });
  const src = code.data ?? null;
  if (code.isError) return <QueryFeedback query={code} />;
  if (!src) return <Skeleton style={{ width: size, height: size }} className="rounded-md" />;
  return (
    <img src={src} alt={label} width={size} height={size} className="rounded-md border bg-white" />
  );
}
