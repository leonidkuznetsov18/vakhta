import { useState } from 'react';
import { UserAvatar } from '@/shared/ui/user-avatar';

export function TenantUserAvatar({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (!image || failed)
    return <UserAvatar name={name} email={email} image={null} className="size-10" />;
  return (
    <img
      src={image}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-10 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
