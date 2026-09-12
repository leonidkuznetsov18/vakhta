import { createContext, useContext, type ReactNode } from 'react';
import type { RoleGrant } from '@vakhta/domain';
import type { Messages } from '@vakhta/i18n';

export type SectionKey = keyof Messages['admin']['sections'];

interface Navigation {
  readonly actorId: string | null;
  /** Switch the panel to a section; pages use it for "go and fix this first" shortcuts. */
  readonly go: (section: SectionKey) => void;
  /** Roles of the signed-in user (scope ignored: the API enforces it); pages hide what a role cannot do. */
  readonly roles: readonly string[];
  readonly grants: readonly RoleGrant[];
}

const NavigationContext = createContext<Navigation>({
  go: () => undefined,
  roles: [],
  grants: [],
  actorId: null,
});

export function NavigationProvider({
  go,
  actorId = null,
  roles = [],
  grants = [],
  children,
}: {
  readonly go: (section: SectionKey) => void;
  readonly actorId?: string | null;
  readonly roles?: readonly string[];
  readonly grants?: readonly RoleGrant[];
  readonly children: ReactNode;
}) {
  return (
    <NavigationContext.Provider value={{ go, roles, grants, actorId }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): Navigation {
  return useContext(NavigationContext);
}
