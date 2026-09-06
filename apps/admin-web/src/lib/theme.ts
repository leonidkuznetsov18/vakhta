import { usePersistentState } from '@/lib/persistent-state';

export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

const THEME_KEY = 'theme';
const DENSITY_KEY = 'density';

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the choice to the document: shadcn tokens switch on `.dark`, tables on `data-density`. */
export function applyAppearance(theme: Theme, density: Density): void {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset['density'] = density;
}

/** Reads the stored appearance before React renders, so the first paint is already right. */
export function applyStoredAppearance(): void {
  try {
    const theme = JSON.parse(localStorage.getItem(`vakhta.ui.${THEME_KEY}`) ?? '"system"') as Theme;
    const density = JSON.parse(
      localStorage.getItem(`vakhta.ui.${DENSITY_KEY}`) ?? '"comfortable"',
    ) as Density;
    applyAppearance(theme, density);
  } catch {
    applyAppearance('system', 'comfortable');
  }
}

export function useAppearance() {
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, 'system');
  const [density, setDensity] = usePersistentState<Density>(DENSITY_KEY, 'comfortable');
  const set = (next: { theme?: Theme; density?: Density }) => {
    const t = next.theme ?? theme;
    const d = next.density ?? density;
    setTheme(t);
    setDensity(d);
    applyAppearance(t, d);
  };
  return { theme, density, set };
}
