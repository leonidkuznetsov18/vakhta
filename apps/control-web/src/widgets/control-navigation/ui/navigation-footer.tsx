import { useMutation } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { messages } from '@vakhta/i18n';
import { LogOut, Monitor, Moon, Sun, Info } from 'lucide-react';
import { cn } from 'cn';
import { toast } from 'sonner';
import { controlApi, type Operator } from '@/shared/api';
import { currentLocale, t } from '@/shared/i18n';
import {
  CompactLanguageSwitcher,
  LanguageSwitcher,
  SELECTED_TOGGLE,
} from '@/shared/ui/language-switcher';
import { UserAvatar } from '@/shared/ui/user-avatar';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';

const THEMES = [
  { key: 'light', icon: Sun },
  { key: 'dark', icon: Moon },
  { key: 'system', icon: Monitor },
] as const;

export function NavigationFooter({ operator }: { operator: Operator }) {
  const m = messages(currentLocale());
  const signOut = useMutation({
    mutationFn: controlApi.signOut,
    onSuccess: () => location.reload(),
    onError: () => toast.error(t().common.error),
  });
  const version: unknown = import.meta.env['VITE_APP_VERSION'];
  return (
    <Sheet>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SheetTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="h-16 gap-3 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                tooltip={m.admin.auth.profile}
                aria-label={m.admin.auth.profile}
              >
                <UserAvatar
                  name={operator.name}
                  email={operator.email}
                  image={operator.image ?? null}
                  className="size-12! shrink-0 group-data-[collapsible=icon]:size-8!"
                />
                <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-base font-medium">
                    {operator.name || operator.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.control.operators.roles[operator.role]}
                  </span>
                </span>
              </SidebarMenuButton>
            </SheetTrigger>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={m.control.nav.signOut}
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              <LogOut aria-hidden="true" />
              <span>{m.control.nav.signOut}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <Preferences />
        {typeof version === 'string' && version ? (
          <div className="px-2 text-xs text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden">
            {m.ui.common.version} {version}
          </div>
        ) : null}
      </SidebarFooter>
      <ProfileDetails operator={operator} />
    </Sheet>
  );
}

function Preferences() {
  const locale = currentLocale();
  const m = messages(locale);
  const { theme = 'system', setTheme } = useTheme();
  const selected = THEMES.find((item) => item.key === theme) ?? THEMES[2];
  const CurrentIcon = selected.icon;
  const nextTheme = THEMES[(THEMES.indexOf(selected) + 1) % THEMES.length] ?? THEMES[0];
  return (
    <>
      <LanguagePreferences />
      <div
        role="group"
        aria-label={m.ui.common.theme}
        className="flex gap-1 group-data-[collapsible=icon]:hidden"
      >
        {THEMES.map(({ key, icon: Icon }) => (
          <Button
            key={key}
            size="sm"
            variant="outline"
            aria-pressed={theme === key}
            aria-label={m.ui.common.themes[key]}
            title={m.ui.common.themes[key]}
            className={cn('flex-1', theme === key && SELECTED_TOGGLE)}
            onClick={() => setTheme(key)}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </div>
      <div className="hidden flex-col items-center gap-1 group-data-[collapsible=icon]:flex">
        <CompactLanguageSwitcher />
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={`${m.ui.common.theme}: ${m.ui.common.themes[selected.key]}`}
          title={m.ui.common.themes[nextTheme.key]}
          onClick={() => setTheme(nextTheme.key)}
        >
          <CurrentIcon aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

function ProfileDetails({ operator }: { operator: Operator }) {
  const m = messages(currentLocale());
  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{m.admin.auth.profile}</SheetTitle>
        <SheetDescription>{m.control.operators.roles[operator.role]}</SheetDescription>
      </SheetHeader>
      <div className="flex min-w-0 items-center gap-3 px-4">
        <UserAvatar
          name={operator.name}
          email={operator.email}
          image={operator.image ?? null}
          className="size-12"
        />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="font-medium">{operator.name || operator.email}</p>
          <p className="text-sm text-muted-foreground">{operator.email}</p>
        </div>
      </div>
    </SheetContent>
  );
}

function LanguagePreferences() {
  const locale = currentLocale();
  const m = messages(locale);
  return (
    <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
      <LanguageSwitcher className="flex-1" />
      <InfoTooltip
        className="size-5 rounded-full text-muted-foreground max-md:size-5"
        label={m.admin.language}
        text={m.ui.hints.language}
      >
        <Info className="size-3.5" />
      </InfoTooltip>
    </div>
  );
}
