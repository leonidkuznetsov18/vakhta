import { createContext, useContext, type ReactNode } from 'react';
import type { Messages } from '@vakhta/i18n';

export type SectionKey = keyof Messages['admin']['sections'];

interface Navigation {
  /** Switch the panel to a section; pages use it for "go and fix this first" shortcuts. */
  readonly go: (section: SectionKey) => void;
  /** Roles of the signed-in user (scope ignored: the API enforces it); pages hide what a role cannot do. */
  readonly roles: readonly string[];
}

const NavigationContext = createContext<Navigation>({ go: () => undefined, roles: [] });

export function NavigationProvider({
  go,
  roles = [],
  children,
}: {
  readonly go: (section: SectionKey) => void;
  readonly roles?: readonly string[];
  readonly children: ReactNode;
}) {
  return <NavigationContext.Provider value={{ go, roles }}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  return useContext(NavigationContext);
}
