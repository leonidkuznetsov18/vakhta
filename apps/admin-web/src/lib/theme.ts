import { usePersistentState } from '@/lib/persistent-state';

export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the choice to the document: shadcn tokens switch on `.dark`. */
export function applyAppearance(theme: Theme): void {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/** Reads the stored theme before React renders, so the first paint is already right. */
export function applyStoredAppearance(): void {
  try {
    const theme = JSON.parse(localStorage.getItem(`vakhta.ui.${THEME_KEY}`) ?? '"system"') as Theme;
    applyAppearance(theme);
  } catch {
    applyAppearance('system');
  }
}

export function useAppearance() {
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, 'system');
  const set = (next: { theme?: Theme }) => {
    const t = next.theme ?? theme;
    setTheme(t);
    applyAppearance(t);
  };
  return { theme, set };
}
