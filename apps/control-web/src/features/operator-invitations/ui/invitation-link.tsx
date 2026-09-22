import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { OperatorInvitationView } from '@vakhta/contracts';
import { Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FailureState, IconButton } from '@/shared/ui';
import { fill, t } from '@/shared/i18n';

export function InvitationLink({ invitation }: { invitation: OperatorInvitationView }) {
  const m = t().operatorInvitations;
  const router = useRouter();
  const location = router.buildLocation({ to: '/invite', search: { token: invitation.token } });
  const url = new URL(`/#${location.href}`, window.location.origin).href;
  const copy = useMutation({
    mutationFn: () => navigator.clipboard.writeText(url),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p role="status" className="font-medium">
        {m.ready}
      </p>
      <p className="text-sm text-muted-foreground">{m.shareHint}</p>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          aria-label={m.link}
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
          className="min-w-0"
        />
        <IconButton
          icon={Copy}
          size="icon"
          tooltip={copy.isSuccess ? m.copied : m.copy}
          label={copy.isSuccess ? m.copied : m.copy}
          onClick={() => copy.mutate()}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {fill(m.expires, { date: new Date(invitation.expiresAt).toLocaleString() })}
      </p>
      {copy.isError ? <FailureState message={m.copyFailed} /> : null}
    </div>
  );
}
