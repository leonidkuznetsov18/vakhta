import { UserAvatar } from '@/components/app/avatar';
import { avatarUrl } from '../api/avatar';

export function EmployeeProfileLink({
  id,
  name,
  avatarVersion,
}: {
  readonly id: string;
  readonly name: string;
  readonly avatarVersion?: string | null;
}) {
  return (
    <a
      href={`#/administration/employees/${id}`}
      className="flex min-w-0 items-center gap-2 rounded-md font-semibold hover:text-primary hover:underline active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className="shrink-0">
        <UserAvatar name={name} email={id} image={avatarUrl(id, avatarVersion)} />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
    </a>
  );
}
