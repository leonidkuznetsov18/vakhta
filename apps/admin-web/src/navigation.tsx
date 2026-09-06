import { createContext, useContext, type ReactNode } from 'react';
import type { Messages } from '@vakhta/i18n';

export type SectionKey = keyof Messages['admin']['sections'];

interface Navigation {
  /** Switch the panel to a section; pages use it for "go and fix this first" shortcuts. */
  readonly go: (section: SectionKey) => void;
}

const NavigationContext = createContext<Navigation>({ go: () => undefined });

export function NavigationProvider({
  go,
  children,
}: {
  readonly go: (section: SectionKey) => void;
  readonly children: ReactNode;
}) {
  return <NavigationContext.Provider value={{ go }}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  return useContext(NavigationContext);
}
