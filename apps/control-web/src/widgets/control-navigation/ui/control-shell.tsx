import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Building2, ShieldCheck } from 'lucide-react';
import { MobileNavigation, MobileNavigationClose } from '@/features/mobile-navigation';
import type { Operator } from '@/shared/api';
import { t } from '@/shared/i18n';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavigationFooter } from './navigation-footer';

/** Match the main panel shell, keeping Control's own routes and operator identity. */
export function ControlShell({ operator, children }: { operator: Operator; children: ReactNode }) {
  const m = t();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sections = [
    { to: '/' as const, label: m.nav.tenants, icon: Building2, active: pathname !== '/operators' },
    {
      to: '/operators' as const,
      label: m.nav.operators,
      icon: ShieldCheck,
      active: pathname === '/operators',
    },
  ];
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <MobileNavigation>
          <Sidebar collapsible="icon">
            <nav
              aria-label={m.productName}
              data-navigation-swipe=""
              className="flex h-full min-h-0 flex-col max-md:touch-pan-y max-md:touch-pinch-zoom"
            >
              <SidebarHeader className="flex-row items-center">
                <MobileNavigationClose />
                <Link
                  to="/"
                  aria-label={m.productName}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-base font-semibold hover:bg-sidebar-accent active:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                >
                  <img
                    src="/favicon.svg"
                    alt=""
                    className="size-9 group-data-[collapsible=icon]:size-8"
                  />
                  <span className="truncate group-data-[collapsible=icon]:hidden">
                    {m.productName}
                  </span>
                </Link>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu aria-label={m.nav.menu}>
                      {sections.map(({ to, label, icon: Icon, active }) => (
                        <SidebarMenuItem key={to}>
                          <SidebarMenuButton asChild isActive={active} tooltip={label}>
                            <Link to={to} aria-current={active ? 'page' : undefined}>
                              <Icon aria-hidden="true" />
                              <span>{label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <NavigationFooter operator={operator} />
            </nav>
          </Sidebar>
          <SidebarInset>
            <header
              data-navigation-swipe=""
              className="flex h-14 shrink-0 items-center gap-2 border-b px-4 max-md:touch-pan-y max-md:touch-pinch-zoom"
            >
              <SidebarTrigger aria-label={m.nav.menu} />
              <span className="text-sm font-medium">
                {pathname === '/operators' ? m.nav.operators : m.nav.tenants}
              </span>
            </header>
            <div className="min-w-0 flex-1 p-4 [overflow-wrap:anywhere] sm:p-6 lg:p-8">
              {children}
            </div>
          </SidebarInset>
        </MobileNavigation>
      </SidebarProvider>
    </TooltipProvider>
  );
}
