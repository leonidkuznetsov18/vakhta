import { linkOptions } from '@tanstack/react-router';
import type { SectionKey } from '@/navigation';

/** Translate the existing cross-feature navigation intent into typed route parameters. */
export function navigationOptions(section: SectionKey | 'profile', sub?: string) {
  switch (section) {
    case 'operations':
    case 'handover':
    case 'requests':
    case 'incidents':
    case 'bonus':
      return linkOptions({ to: `/${section}/{-$id}`, params: { id: sub } });
    case 'administration': {
      const [tab, detail] = sub?.split('/') ?? [];
      return linkOptions({ to: '/administration/{-$tab}/{-$detail}', params: { tab, detail } });
    }
    case 'audit':
      return linkOptions({ to: '/audit/{-$tab}', params: { tab: sub } });
    default:
      return linkOptions({ to: `/${section}` });
  }
}
