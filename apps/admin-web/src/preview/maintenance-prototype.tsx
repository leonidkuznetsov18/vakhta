import { useState, type ReactNode } from 'react';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HistoryIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  OctagonXIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SirenIcon,
  TimerIcon,
  TriangleAlertIcon,
  UploadIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { InfoTip } from '@/components/app/info-tip';
import { LogoMark } from '@/components/app/logo';
import { Section, StatusPill, type PillTone } from '@/components/app/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from 'cn';

/*
 * Design prototype for spec 014 (equipment maintenance), opened with
 * `preview.html?prototype=maintenance&screen=…`. Preview-only, never built into the panel:
 * the texts are Ukrainian literals and the data are fixtures of the three pilot NEWTOP machines.
 * Screens: equipment, card, plan, calendar, work, review, emergency, bot.
 */

const EquipmentState = {
  AVAILABLE: 'AVAILABLE',
  RESTRICTED: 'RESTRICTED',
  STOPPED: 'STOPPED',
  UNKNOWN: 'UNKNOWN',
} as const;
type EquipmentState = (typeof EquipmentState)[keyof typeof EquipmentState];

const Readiness = { UNKNOWN: 'UNKNOWN', READY: 'READY', MISSING: 'MISSING' } as const;
type Readiness = (typeof Readiness)[keyof typeof Readiness];

const STATE_VIEW: Record<EquipmentState, { label: string; tone: PillTone; icon: ReactNode }> = {
  AVAILABLE: { label: 'Працює', tone: 'success', icon: <CircleCheckIcon /> },
  RESTRICTED: { label: 'Обмежено', tone: 'warning', icon: <TriangleAlertIcon /> },
  STOPPED: { label: 'Зупинено', tone: 'danger', icon: <OctagonXIcon /> },
  UNKNOWN: { label: 'Невідомо', tone: 'neutral', icon: <CircleHelpIcon /> },
};

const READINESS_VIEW: Record<Readiness, { label: string; tone: PillTone; icon: ReactNode }> = {
  READY: { label: 'Все є', tone: 'success', icon: <PackageIcon /> },
  MISSING: { label: 'Бракує', tone: 'accent', icon: <PackageIcon /> },
  UNKNOWN: { label: 'Не підтверджено', tone: 'neutral', icon: <CircleDashedIcon /> },
};

interface Machine {
  readonly id: string;
  readonly code: string;
  readonly model: string;
  readonly kind: string;
  readonly line: string;
  readonly state: EquipmentState;
  readonly mechanic: string;
  readonly backup: string;
  readonly nextPlan: string;
  readonly nextDate: string;
  readonly overdue: boolean;
  readonly readiness: Readiness;
  readonly criticality: string;
  readonly activeWork: string | null;
  readonly power: string;
  readonly air: string;
  readonly weight: string;
}

const STOPPED_MACHINE: Machine = {
  id: 'm2',
  code: 'M-02',
  model: 'NEWTOP-FB158SV1',
  kind: 'Сервоприводна машина для стаканів',
  line: 'Цех стаканів · Лінія 2',
  state: EquipmentState.STOPPED,
  mechanic: 'Коваль Олег',
  backup: 'Петренко Іван',
  nextPlan: 'Щомісячне ТО',
  nextDate: '30.09',
  overdue: false,
  readiness: Readiness.MISSING,
  criticality: 'Висока',
  activeWork: 'Аварія №1043',
  power: '380 В, 22 кВт',
  air: '0,5–0,7 МПа, 0,3 м³/хв',
  weight: '2500 кг',
};

const MACHINES: readonly Machine[] = [
  {
    id: 'm1',
    code: 'M-01',
    model: 'NEWTOP-FB100S',
    kind: 'Сервоприводна машина для стаканів',
    line: 'Цех стаканів · Лінія 1',
    state: EquipmentState.AVAILABLE,
    mechanic: 'Петренко Іван',
    backup: 'Коваль Олег',
    nextPlan: 'Щотижневе ТО',
    nextDate: '29.09',
    overdue: false,
    readiness: Readiness.READY,
    criticality: 'Висока',
    activeWork: null,
    power: '380 В, 22 кВт',
    air: '0,5–0,7 МПа, 0,3 м³/хв',
    weight: '2400 кг',
  },
  STOPPED_MACHINE,
  {
    id: 'm3',
    code: 'M-03',
    model: 'NEWTOP-118DT',
    kind: 'Машина для зовнішньої стінки стаканів',
    line: 'Цех стаканів · Лінія 2',
    state: EquipmentState.AVAILABLE,
    mechanic: 'Петренко Іван',
    backup: 'Коваль Олег',
    nextPlan: 'Щотижневе ТО',
    nextDate: '22.09',
    overdue: true,
    readiness: Readiness.UNKNOWN,
    criticality: 'Середня',
    activeWork: null,
    power: '380 В, 5 кВт',
    air: '0,6–0,8 МПа, 0,4 м³/хв',
    weight: '2600 кг',
  },
];

interface PlanRow {
  readonly title: string;
  readonly interval: string;
  readonly last: string;
  readonly next: string;
  readonly readiness: Readiness;
  readonly source: string;
}

const M2_PLANS: readonly PlanRow[] = [
  {
    title: 'Очищення оптичних датчиків',
    interval: 'кожні 3 дні',
    last: '23.09',
    next: '26.09',
    readiness: Readiness.READY,
    source: 'Сайт виробника «Щоденне обслуговування»',
  },
  {
    title: 'Щотижневе ТО',
    interval: 'кожен тиждень',
    last: '24.09',
    next: '01.10',
    readiness: Readiness.READY,
    source: 'Сайт виробника + блог виробника',
  },
  {
    title: 'Фільтр масляного насоса',
    interval: 'кожні 2 тижні',
    last: '23.09',
    next: '07.10',
    readiness: Readiness.UNKNOWN,
    source: 'Сайт виробника «Щоденне обслуговування»',
  },
  {
    title: 'Щомісячне ТО',
    interval: 'кожен місяць',
    last: '30.08',
    next: '30.09',
    readiness: Readiness.MISSING,
    source: 'Сайт виробника «Часті питання», блог',
  },
  {
    title: 'Заміна масла в масляній ванні',
    interval: 'кожні 4 місяці',
    last: '15.09',
    next: '15.01.2027',
    readiness: Readiness.UNKNOWN,
    source: 'Сторінка моделі FB158S: «кожні 4–6 місяців»',
  },
];

const WorkKind = { PLANNED: 'PLANNED', EMERGENCY: 'EMERGENCY' } as const;
type WorkKind = (typeof WorkKind)[keyof typeof WorkKind];

interface WorkRow {
  readonly number: number;
  readonly kind: WorkKind;
  readonly machine: string;
  readonly title: string;
  readonly mechanic: string;
  readonly status: string;
  readonly statusTone: PillTone;
  readonly due: string;
  readonly readiness: Readiness | null;
  readonly opens: 'review' | 'emergency' | null;
}

const WORK: readonly WorkRow[] = [
  {
    number: 1043,
    kind: WorkKind.EMERGENCY,
    machine: 'M-02 NEWTOP-FB158SV1',
    title: 'Не формується дно, заїдає подача паперу',
    mechanic: 'Коваль Олег',
    status: 'Не прийнято · 03:12',
    statusTone: 'danger',
    due: 'Прийняти до 10:46',
    readiness: null,
    opens: 'emergency',
  },
  {
    number: 1038,
    kind: WorkKind.PLANNED,
    machine: 'M-03 NEWTOP-118DT',
    title: 'Щотижневе ТО',
    mechanic: 'Петренко Іван',
    status: 'Прострочено 2 дні',
    statusTone: 'caution',
    due: '22.09',
    readiness: Readiness.UNKNOWN,
    opens: null,
  },
  {
    number: 1036,
    kind: WorkKind.PLANNED,
    machine: 'M-01 NEWTOP-FB100S',
    title: 'Щотижневе ТО',
    mechanic: 'Петренко Іван',
    status: 'Призначено',
    statusTone: 'neutral',
    due: '29.09',
    readiness: Readiness.READY,
    opens: null,
  },
  {
    number: 1031,
    kind: WorkKind.PLANNED,
    machine: 'M-02 NEWTOP-FB158SV1',
    title: 'Щомісячне ТО',
    mechanic: 'Коваль Олег',
    status: 'Призначено',
    statusTone: 'neutral',
    due: '30.09',
    readiness: Readiness.MISSING,
    opens: null,
  },
  {
    number: 1029,
    kind: WorkKind.PLANNED,
    machine: 'M-01 NEWTOP-FB100S',
    title: 'Щотижневе ТО',
    mechanic: 'Петренко Іван',
    status: 'На перевірці',
    statusTone: 'teal',
    due: '22.09',
    readiness: Readiness.READY,
    opens: 'review',
  },
];

const CalendarTone = {
  PLANNED: 'PLANNED',
  MISSING: 'MISSING',
  FORECAST: 'FORECAST',
} as const;
type CalendarTone = (typeof CalendarTone)[keyof typeof CalendarTone];

interface CalendarEntry {
  readonly day: number;
  readonly machine: string;
  readonly title: string;
  readonly tone: CalendarTone;
}

/** October 2026; the grid starts on Monday 28 September. */
const CALENDAR: readonly CalendarEntry[] = [
  { day: -2, machine: 'M-01', title: 'Щотижневе ТО', tone: CalendarTone.PLANNED },
  { day: -1, machine: 'M-02', title: 'Щомісячне ТО', tone: CalendarTone.MISSING },
  { day: 1, machine: 'M-02', title: 'Щотижневе ТО', tone: CalendarTone.PLANNED },
  { day: 5, machine: 'M-01', title: 'Фільтр насоса', tone: CalendarTone.PLANNED },
  { day: 6, machine: 'M-01', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 7, machine: 'M-02', title: 'Фільтр насоса', tone: CalendarTone.PLANNED },
  { day: 8, machine: 'M-02', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 12, machine: 'M-01', title: 'Заміна масла', tone: CalendarTone.PLANNED },
  { day: 13, machine: 'M-01', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 14, machine: 'M-01', title: 'Щомісячне ТО', tone: CalendarTone.PLANNED },
  { day: 15, machine: 'M-02', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 19, machine: 'M-01', title: 'Фільтр насоса', tone: CalendarTone.FORECAST },
  { day: 20, machine: 'M-03', title: 'Щомісячне ТО', tone: CalendarTone.PLANNED },
  { day: 20, machine: 'M-01', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 21, machine: 'M-02', title: 'Фільтр насоса', tone: CalendarTone.FORECAST },
  { day: 22, machine: 'M-02', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 27, machine: 'M-01', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 29, machine: 'M-02', title: 'Щотижневе ТО', tone: CalendarTone.FORECAST },
  { day: 30, machine: 'M-02', title: 'Щомісячне ТО', tone: CalendarTone.FORECAST },
];

const CALENDAR_TONE: Record<CalendarTone, string> = {
  PLANNED:
    'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-100',
  MISSING:
    'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100',
  FORECAST: 'border-dotted border-muted-foreground/50 bg-transparent text-muted-foreground',
};

const CALENDAR_ICON: Record<CalendarTone, ReactNode> = {
  PLANNED: <WrenchIcon className="size-3 shrink-0" />,
  MISSING: <PackageIcon className="size-3 shrink-0" />,
  FORECAST: <CircleDashedIcon className="size-3 shrink-0" />,
};

const Screen = {
  EQUIPMENT: 'equipment',
  CALENDAR: 'calendar',
  WORK: 'work',
  BOT: 'bot',
} as const;
type Screen = (typeof Screen)[keyof typeof Screen];

const Overlay = {
  NONE: 'none',
  CARD: 'card',
  PLAN: 'plan',
  REVIEW: 'review',
  EMERGENCY: 'emergency',
} as const;
type Overlay = (typeof Overlay)[keyof typeof Overlay];

const START: Record<string, { screen: Screen; overlay: Overlay }> = {
  equipment: { screen: Screen.EQUIPMENT, overlay: Overlay.NONE },
  card: { screen: Screen.EQUIPMENT, overlay: Overlay.CARD },
  plan: { screen: Screen.EQUIPMENT, overlay: Overlay.PLAN },
  calendar: { screen: Screen.CALENDAR, overlay: Overlay.NONE },
  work: { screen: Screen.WORK, overlay: Overlay.NONE },
  review: { screen: Screen.WORK, overlay: Overlay.REVIEW },
  emergency: { screen: Screen.WORK, overlay: Overlay.EMERGENCY },
  bot: { screen: Screen.BOT, overlay: Overlay.NONE },
};

const NAV = [
  { label: 'Огляд', icon: LayoutDashboardIcon },
  { label: 'Операції', icon: ActivityIcon },
  { label: 'Графік', icon: CalendarDaysIcon },
  { label: 'Інциденти', icon: AlertTriangleIcon, badge: 1 },
  { label: 'Передача змін', icon: ClipboardCheckIcon },
  { label: 'Запити', icon: InboxIcon },
  { label: 'Обслуговування', icon: WrenchIcon, badge: 2, active: true },
  { label: 'Звіти', icon: BarChart3Icon },
  { label: 'Адміністрування', icon: SettingsIcon },
] as const;

export function MaintenancePrototype() {
  const start = START[new URLSearchParams(location.search).get('screen') ?? 'equipment'];
  const [screen, setScreen] = useState<Screen>(start?.screen ?? Screen.EQUIPMENT);
  const [overlay, setOverlay] = useState<Overlay>(start?.overlay ?? Overlay.NONE);
  const close = () => setOverlay(Overlay.NONE);

  return (
    <SidebarProvider>
      <PrototypeSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b bg-background px-3 md:px-4">
          <SidebarTrigger aria-label="Меню" />
          <h1 className="text-lg font-semibold max-md:text-base">Обслуговування обладнання</h1>
        </header>
        <main className="flex flex-col gap-4 p-3 pb-12 md:p-6">
          <Tabs value={screen} onValueChange={(value) => setScreen(value as Screen)}>
            <TabsList className="max-md:w-full max-md:overflow-x-auto">
              <TabsTrigger value={Screen.EQUIPMENT}>
                <WrenchIcon /> Обладнання
              </TabsTrigger>
              <TabsTrigger value={Screen.CALENDAR}>
                <CalendarDaysIcon /> Календар ТО
              </TabsTrigger>
              <TabsTrigger value={Screen.WORK}>
                <ClipboardListIcon /> Роботи
                <StatusPill tone="danger" className="ml-1 h-4 px-1.5">
                  1
                </StatusPill>
              </TabsTrigger>
              <TabsTrigger value={Screen.BOT}>
                <span aria-hidden="true">✈️</span> Бот механіка
              </TabsTrigger>
            </TabsList>
            <TabsContent value={Screen.EQUIPMENT} className="mt-4">
              <EquipmentScreen onOpen={() => setOverlay(Overlay.CARD)} />
            </TabsContent>
            <TabsContent value={Screen.CALENDAR} className="mt-4">
              <CalendarScreen />
            </TabsContent>
            <TabsContent value={Screen.WORK} className="mt-4">
              <WorkScreen onOpen={setOverlay} />
            </TabsContent>
            <TabsContent value={Screen.BOT} className="mt-4">
              <BotScreen />
            </TabsContent>
          </Tabs>
        </main>
      </SidebarInset>
      <EquipmentSheet
        open={overlay === Overlay.CARD}
        onClose={close}
        onPlan={() => setOverlay(Overlay.PLAN)}
      />
      <PlanSheet open={overlay === Overlay.PLAN} onClose={close} />
      <ReviewSheet open={overlay === Overlay.REVIEW} onClose={close} />
      <EmergencySheet open={overlay === Overlay.EMERGENCY} onClose={close} />
    </SidebarProvider>
  );
}

function PrototypeSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center gap-2 px-3 py-3 text-base font-semibold">
        <LogoMark className="size-9" />
        <span className="truncate group-data-[collapsible=icon]:hidden">Вахта</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    data-active={'active' in item ? true : undefined}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {'badge' in item ? (
                    <SidebarMenuBadge className="tabular-nums">{item.badge}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function StatePill({ state }: { readonly state: EquipmentState }) {
  const view = STATE_VIEW[state];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {view.label}
    </StatusPill>
  );
}

function ReadinessPill({ readiness }: { readonly readiness: Readiness }) {
  const view = READINESS_VIEW[readiness];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {view.label}
    </StatusPill>
  );
}

function NextMaintenance({ machine }: { readonly machine: Machine }) {
  return (
    <span className="flex flex-col leading-tight">
      <span>{machine.nextPlan}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {machine.nextDate}
        {machine.overdue ? (
          <StatusPill tone="caution" className="h-4 px-1.5">
            <ClockIcon /> Прострочено
          </StatusPill>
        ) : null}
      </span>
    </span>
  );
}

function EquipmentScreen({ onOpen }: { readonly onOpen: () => void }) {
  const mobile = useIsMobile();
  return (
    <Section
      title="Обладнання"
      hint="Реєстр станків цеху. Рядок відкриває картку станка з документами, планами ТО та історією."
      actions={
        <Button size="sm">
          <PlusIcon /> Додати обладнання
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Код, модель або механік" />
        </div>
        <NativeSelect className="w-44" aria-label="Підрозділ">
          <NativeSelectOption>Цех стаканів</NativeSelectOption>
        </NativeSelect>
        <NativeSelect className="w-44" aria-label="Стан">
          <NativeSelectOption>Усі стани</NativeSelectOption>
        </NativeSelect>
      </div>
      {mobile ? <EquipmentCards onOpen={onOpen} /> : <EquipmentTable onOpen={onOpen} />}
      <p className="text-sm text-muted-foreground">Усього: 3</p>
    </Section>
  );
}

function EquipmentCards({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {MACHINES.map((machine) => (
        <button
          key={machine.id}
          type="button"
          onClick={onOpen}
          className="flex flex-col gap-2 rounded-lg border p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {machine.code} · {machine.model}
            </span>
            <StatePill state={machine.state} />
          </span>
          <span className="text-xs text-muted-foreground">{machine.line}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <WrenchIcon className="size-3.5" /> {machine.nextPlan} · {machine.nextDate}
            {machine.overdue ? (
              <StatusPill tone="caution">
                <ClockIcon /> Прострочено
              </StatusPill>
            ) : null}
            <ReadinessPill readiness={machine.readiness} />
          </span>
          <span className="text-xs">Механік: {machine.mechanic}</span>
          {machine.activeWork ? (
            <StatusPill tone="danger">
              <SirenIcon /> {machine.activeWork}
            </StatusPill>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function EquipmentTable({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Станок</TableHead>
          <TableHead>Розташування</TableHead>
          <TableHead>Стан</TableHead>
          <TableHead>Наступне ТО</TableHead>
          <TableHead>Матеріали</TableHead>
          <TableHead>Відповідальний механік</TableHead>
          <TableHead>Поточна робота</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {MACHINES.map((machine) => (
          <TableRow key={machine.id} className="cursor-pointer" onClick={onOpen}>
            <TableCell>
              <span className="flex flex-col leading-tight">
                <span className="font-medium">
                  {machine.code} · {machine.model}
                </span>
                <span className="text-xs text-muted-foreground">{machine.kind}</span>
              </span>
            </TableCell>
            <TableCell>{machine.line}</TableCell>
            <TableCell>
              <StatePill state={machine.state} />
            </TableCell>
            <TableCell>
              <NextMaintenance machine={machine} />
            </TableCell>
            <TableCell>
              <ReadinessPill readiness={machine.readiness} />
            </TableCell>
            <TableCell>
              <span className="flex flex-col leading-tight">
                <span>{machine.mechanic}</span>
                <span className="text-xs text-muted-foreground">резерв: {machine.backup}</span>
              </span>
            </TableCell>
            <TableCell>
              {machine.activeWork ? (
                <StatusPill tone="danger">
                  <SirenIcon /> {machine.activeWork}
                </StatusPill>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function EquipmentSheet({
  open,
  onClose,
  onPlan,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPlan: () => void;
}) {
  const machine = STOPPED_MACHINE;
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">
            {machine.code} · {machine.model}
          </SheetTitle>
          <SheetDescription>
            {machine.kind} · {machine.line}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatePill state={machine.state} />
            <StatusPill tone="danger">
              <SirenIcon /> {machine.activeWork}
            </StatusPill>
            <StatusPill>
              <TimerIcon /> Простій 0 год 04 хв
            </StatusPill>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Відповідальний механік">{machine.mechanic}</Field>
            <Field label="Резервний механік">{machine.backup}</Field>
            <Field label="Критичність">{machine.criticality}</Field>
            <Field label="Наступне ТО">
              {machine.nextPlan}, {machine.nextDate}
            </Field>
          </div>
          <Tabs defaultValue="plans">
            <TabsList className="max-md:w-full max-md:overflow-x-auto">
              <TabsTrigger value="passport">Паспорт</TabsTrigger>
              <TabsTrigger value="docs">Документи</TabsTrigger>
              <TabsTrigger value="plans">Плани ТО</TabsTrigger>
              <TabsTrigger value="history">Історія</TabsTrigger>
            </TabsList>
            <TabsContent value="passport" className="mt-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="Виробник">Zhejiang New Debao Machinery</Field>
                <Field label="Модель">{machine.model}</Field>
                <Field label="Заводський номер">
                  <span className="text-muted-foreground">не вказано</span>
                </Field>
                <Field label="Живлення">{machine.power}</Field>
                <Field label="Стиснене повітря">{machine.air}</Field>
                <Field label="Вага">{machine.weight}</Field>
              </div>
            </TabsContent>
            <TabsContent value="docs" className="mt-3 flex flex-col gap-3">
              <DocumentsList />
            </TabsContent>
            <TabsContent value="plans" className="mt-3 flex flex-col gap-3">
              <PlansList onPlan={onPlan} />
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <EquipmentHistory />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EquipmentHistory() {
  return (
    <Timeline
      items={[
        ['24.09 10:41', 'Мельник О. повідомила про зупинку: «Не формується дно»'],
        ['24.09 09:12', 'Коваль О. провів «Щотижневе ТО» №1024, прийняв Лисенко А.'],
        ['23.09 18:30', 'Коваль О.: «Чогось бракує» для «Щомісячного ТО»: ІЧ-термометр'],
        ['15.09 14:05', 'Заміна масла №1002 прийнята. Наступна: 15.01.2027'],
      ]}
    />
  );
}

function DocumentsList() {
  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
        <span className="flex items-start gap-3">
          <FileTextIcon className="mt-0.5 size-5 text-muted-foreground" />
          <span className="flex flex-col leading-tight">
            <span className="font-medium">Каталог NEWTOP 2026-4 (с. 18–19)</span>
            <span className="text-xs text-muted-foreground">
              Інше · англ./кит. · en.debaochina.com · додав Лисенко А. 24.09
            </span>
          </span>
        </span>
        <Button size="sm" variant="outline">
          <ExternalLinkIcon /> Відкрити
        </Button>
      </div>
      <Alert className="border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200">
        <TriangleAlertIcon />
        <AlertTitle>Немає інструкції з експлуатації</AlertTitle>
        <AlertDescription>
          Виробник не публікує інструкцію. Завантажте ту, що йшла зі станком, або запросіть на
          db@debaochina.com за заводським номером.
        </AlertDescription>
      </Alert>
      <Button variant="outline" className="self-start">
        <UploadIcon /> Додати документ (PDF до 50 МБ)
      </Button>
    </>
  );
}

function PlansList({ onPlan }: { readonly onPlan: () => void }) {
  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={onPlan}>
          <PlusIcon /> Новий план ТО
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>План</TableHead>
            <TableHead>Інтервал</TableHead>
            <TableHead>Останнє</TableHead>
            <TableHead>Наступне</TableHead>
            <TableHead>Матеріали</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {M2_PLANS.map((plan) => (
            <TableRow key={plan.title} className="cursor-pointer" onClick={onPlan}>
              <TableCell>
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">{plan.title}</span>
                  <span className="text-xs text-muted-foreground">{plan.source}</span>
                </span>
              </TableCell>
              <TableCell>{plan.interval}</TableCell>
              <TableCell>{plan.last}</TableCell>
              <TableCell>{plan.next}</TableCell>
              <TableCell>
                <ReadinessPill readiness={plan.readiness} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">Усього: 5</p>
    </>
  );
}

function Timeline({ items }: { readonly items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <ol className="flex flex-col gap-3 border-l pl-4">
      {items.map(([time, text]) => (
        <li key={time} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-foreground/60" />
          <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
          <div>{text}</div>
        </li>
      ))}
    </ol>
  );
}

const OPERATIONS = [
  {
    text: 'Перевірити калібрування нагрівачів ІЧ-термометром на зварювальній голівці',
    photo: false,
  },
  { text: 'Перевірити натяг і знос ременів та ланцюгів', photo: false },
  { text: 'Знеструмити та підтягнути клеми в шафі керування', photo: true },
  { text: 'Прослухати підшипники, перевірити люфт редуктора', photo: false },
  { text: 'Перевірити вузол накатки дна (не перетискати)', photo: true },
  { text: 'Перевірити контакт і поверхні ультразвукового вузла', photo: false },
] as const;

const MATERIALS = [
  { kind: 'Інструмент', name: 'ІЧ-термометр', article: '—', qty: '1 шт', mode: 'щоразу' },
  {
    kind: 'Інструмент',
    name: 'Динамометрична викрутка',
    article: '—',
    qty: '1 шт',
    mode: 'щоразу',
  },
  {
    kind: 'Матеріал',
    name: 'Мастило для ручних точок',
    article: 'уточнити',
    qty: '0,2 л',
    mode: 'щоразу',
  },
  {
    kind: 'Запчастина',
    name: 'Приводний ремінь',
    article: 'уточнити',
    qty: '1 шт',
    mode: 'за потреби',
  },
] as const;

function PlanSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">План ТО · M-02 NEWTOP-FB158SV1</SheetTitle>
          <SheetDescription>
            Чернетка не створює робіт і нагадувань. Після публікації зміни створюють нову версію.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-4">
          <PlanSourceBlock />
          <PlanScheduleBlock />
          <PlanOperationsBlock />
          <PlanMaterialsBlock />
          <FormBlock number={5} title="Хто виконує">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Відповідальний механік</Label>
                <NativeSelect>
                  <NativeSelectOption>Коваль Олег (з картки станка)</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Нагадування в Telegram</Label>
                <div className="flex h-9 items-center gap-2 text-sm">за 7, 3 і 1 день о 09:00</div>
              </div>
            </div>
          </FormBlock>
          <Alert>
            <CalendarDaysIcon />
            <AlertTitle>Як це спрацює</AlertTitle>
            <AlertDescription>
              Перше ТО 30.09.2026 (ср). Коваль О. отримає нагадування 23.09, 27.09 і 29.09 о 09:00.
              Наступне ТО рахуватиметься від дня виконання: приблизно 30.10.2026.
            </AlertDescription>
          </Alert>
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline">Зберегти чернетку</Button>
          <Button>Опублікувати</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PlanSourceBlock() {
  return (
    <FormBlock number={1} title="Що і звідки">
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledInput label="Назва плану" value="Щомісячне ТО" />
        <div className="flex flex-col gap-1.5">
          <Label>Джерело</Label>
          <NativeSelect>
            <NativeSelectOption>Рішення підприємства (інструкції немає)</NativeSelectOption>
            <NativeSelectOption>Документ: Каталог NEWTOP 2026-4</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="md:col-span-2">
          <Label className="mb-1.5">Обґрунтування</Label>
          <Textarea
            rows={2}
            defaultValue="Сайт виробника: «Часті питання» та «Щоденне обслуговування»; блог New Debao. Замінити посиланням на інструкцію, коли її отримаємо."
          />
        </div>
      </div>
    </FormBlock>
  );
}

function PlanScheduleBlock() {
  return (
    <FormBlock number={2} title="Як часто">
      <div className="grid gap-3 md:grid-cols-4">
        <LabeledInput label="Кожні" value="1" />
        <div className="flex flex-col gap-1.5">
          <Label>Одиниця</Label>
          <NativeSelect>
            <NativeSelectOption>місяць</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="gap-1">
            Відлік{' '}
            <InfoTip text="Від виконання: наступне ТО рахується від дня фактичного виконання. Фіксований календар: дати не зсуваються." />
          </Label>
          <NativeSelect>
            <NativeSelectOption>від виконання</NativeSelectOption>
            <NativeSelectOption>фіксований календар</NativeSelectOption>
          </NativeSelect>
        </div>
        <LabeledInput label="Перше ТО" value="30.09.2026" />
        <LabeledInput label="Тривалість, хв" value="90" />
        <div className="flex items-end gap-2 pb-2 md:col-span-3">
          <Checkbox id="stop" defaultChecked />
          <Label htmlFor="stop">Потрібна зупинка станка</Label>
        </div>
      </div>
    </FormBlock>
  );
}

function PlanOperationsBlock() {
  return (
    <FormBlock number={3} title="Операції">
      <ol className="flex flex-col gap-2">
        {OPERATIONS.map((operation, index) => (
          <li key={operation.text} className="flex items-center gap-2 rounded-md border p-2">
            <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <span className="flex-1 text-sm">{operation.text}</span>
            {operation.photo ? (
              <StatusPill>
                <CameraIcon /> фото
              </StatusPill>
            ) : null}
          </li>
        ))}
      </ol>
      <Button variant="outline" size="sm" className="self-start">
        <PlusIcon /> Додати операцію
      </Button>
    </FormBlock>
  );
}

function PlanMaterialsBlock() {
  return (
    <FormBlock number={4} title="Що має бути в наявності">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Тип</TableHead>
            <TableHead>Назва</TableHead>
            <TableHead>Артикул</TableHead>
            <TableHead>Кількість</TableHead>
            <TableHead>Потрібно</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MATERIALS.map((material) => (
            <TableRow key={material.name}>
              <TableCell>{material.kind}</TableCell>
              <TableCell>{material.name}</TableCell>
              <TableCell className="text-muted-foreground">{material.article}</TableCell>
              <TableCell>{material.qty}</TableCell>
              <TableCell>{material.mode}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" className="self-start">
        <PlusIcon /> Додати позицію
      </Button>
    </FormBlock>
  );
}

function FormBlock({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function LabeledInput({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input defaultValue={value} />
    </div>
  );
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const;

function CalendarScreen() {
  const mobile = useIsMobile();
  const byDay = new Map<number, CalendarEntry[]>();
  for (const entry of CALENDAR) byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  return (
    <div className="flex flex-col gap-4">
      <Alert className="border-orange-300 text-orange-900 dark:border-orange-800 dark:text-orange-200">
        <ClockIcon />
        <AlertTitle>Прострочено: 1</AlertTitle>
        <AlertDescription>
          M-03 NEWTOP-118DT · Щотижневе ТО мало бути 22.09 · Петренко Іван
        </AlertDescription>
      </Alert>
      <Section title="Календар ТО">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Попередній місяць">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="sm">
            <CalendarDaysIcon /> Жовтень 2026
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Наступний місяць">
            <ChevronRightIcon />
          </Button>
          <NativeSelect className="w-40" aria-label="Механік">
            <NativeSelectOption>Усі механіки</NativeSelectOption>
          </NativeSelect>
          <NativeSelect className="w-40" aria-label="Станок">
            <NativeSelectOption>Усі станки</NativeSelectOption>
          </NativeSelect>
        </div>
        {mobile ? <CalendarAgenda byDay={byDay} /> : <CalendarGrid byDay={byDay} />}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend className={CALENDAR_TONE.PLANNED} icon={<WrenchIcon className="size-3" />}>
            Заплановане ТО
          </Legend>
          <Legend className={CALENDAR_TONE.MISSING} icon={<PackageIcon className="size-3" />}>
            Механік: бракує матеріалів
          </Legend>
          <Legend className={CALENDAR_TONE.FORECAST} icon={<CircleDashedIcon className="size-3" />}>
            Прогноз (ще не робота)
          </Legend>
        </div>
      </Section>
    </div>
  );
}

/** Grid index → day of month: the grid starts on 28 September (index -2) and ends on 1 November. */
function dayNumber(day: number): number {
  if (day < 1) return 30 + day;
  if (day > 31) return day - 31;
  return day;
}

function dayLabel(day: number): string {
  if (day < 1) return `${30 + day}.09`;
  return `${String(day).padStart(2, '0')}.10`;
}

type DayMap = ReadonlyMap<number, readonly CalendarEntry[]>;

function CalendarAgenda({ byDay }: { readonly byDay: DayMap }) {
  return (
    <ol className="flex flex-col gap-3">
      {[...byDay.entries()].slice(0, 8).map(([day, entries]) => (
        <li key={day} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{dayLabel(day)}</span>
          {entries.map((entry) => (
            <CalendarChip key={entry.machine + entry.title} entry={entry} />
          ))}
        </li>
      ))}
    </ol>
  );
}

function CalendarGrid({ byDay }: { readonly byDay: DayMap }) {
  const days = Array.from({ length: 35 }, (_, index) => index - 2);
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="border-b bg-muted/50 px-2 py-1 text-xs font-medium">
          {weekday}
        </div>
      ))}
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            'flex min-h-24 flex-col gap-1 border-r border-b p-1 last:border-r-0',
            day < 1 && 'bg-muted/30',
          )}
        >
          <span
            className={cn(
              'text-xs tabular-nums',
              day < 1 ? 'text-muted-foreground' : 'font-medium',
            )}
          >
            {dayNumber(day)}
          </span>
          {(byDay.get(day) ?? []).map((entry) => (
            <CalendarChip key={entry.machine + entry.title} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarChip({ entry }: { readonly entry: CalendarEntry }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-xs',
        CALENDAR_TONE[entry.tone],
      )}
    >
      {CALENDAR_ICON[entry.tone]}
      <span className="font-medium">{entry.machine}</span>
      <span className="truncate">{entry.title}</span>
    </span>
  );
}

function Legend({
  className,
  icon,
  children,
}: {
  readonly className: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('flex size-5 items-center justify-center rounded border', className)}>
        {icon}
      </span>
      {children}
    </span>
  );
}

function WorkScreen({ onOpen }: { readonly onOpen: (overlay: Overlay) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <SirenIcon />
        <AlertTitle>M-02 NEWTOP-FB158SV1 зупинено · аварійний ремонт №1043</AlertTitle>
        <AlertDescription>
          Коваль О. ще не прийняв. Через 03:12 повідомлення піде резервному механіку й майстру.
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-fit"
            onClick={() => onOpen(Overlay.EMERGENCY)}
          >
            Відкрити ремонт
          </Button>
        </AlertDescription>
      </Alert>
      <Section title="Роботи">
        <div className="flex flex-wrap gap-2">
          {['Термінові', 'Сьогодні', 'На перевірці', 'Усі'].map((label, index) => (
            <Button key={label} size="sm" variant={index === 3 ? 'secondary' : 'outline'}>
              {label}
            </Button>
          ))}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Робота</TableHead>
              <TableHead>Станок</TableHead>
              <TableHead>Механік</TableHead>
              <TableHead>Термін</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Матеріали</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WORK.map((work) => (
              <TableRow
                key={work.number}
                className={cn(
                  work.opens && 'cursor-pointer',
                  work.kind === WorkKind.EMERGENCY && 'bg-red-50/60 dark:bg-red-950/30',
                )}
                onClick={() => (work.opens ? onOpen(work.opens) : undefined)}
              >
                <TableCell className="tabular-nums">{work.number}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {work.kind === WorkKind.EMERGENCY ? (
                      <SirenIcon className="size-4 text-red-600" aria-label="Аварійний ремонт" />
                    ) : (
                      <WrenchIcon
                        className="size-4 text-muted-foreground"
                        aria-label="Планове ТО"
                      />
                    )}
                    {work.title}
                  </span>
                </TableCell>
                <TableCell>{work.machine}</TableCell>
                <TableCell>{work.mechanic}</TableCell>
                <TableCell className="tabular-nums">{work.due}</TableCell>
                <TableCell>
                  <StatusPill tone={work.statusTone}>{work.status}</StatusPill>
                </TableCell>
                <TableCell>
                  {work.readiness ? <ReadinessPill readiness={work.readiness} /> : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">Усього: 5</p>
      </Section>
    </div>
  );
}

const ANSWERS = [
  { text: 'Очистити фільтр на вході повітродувки', result: 'done', note: '', photo: true },
  { text: 'Очистити фільтр на вході масляного насоса', result: 'done', note: '', photo: true },
  { text: 'Змастити ручні точки за картою змащування', result: 'done', note: '', photo: false },
  {
    text: 'Перевірити знос ножів, пуансонів дна і захоплювачів',
    result: 'na',
    note: 'Перевірено разом з аварійним ремонтом №1040 22.09',
    photo: false,
  },
] as const;

function ReviewSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">ТО №1029 · Щотижневе ТО</SheetTitle>
          <SheetDescription>M-01 NEWTOP-FB100S · Цех стаканів · Лінія 1</SheetDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <StatusPill tone="teal">
              <ListChecksIcon /> На перевірці
            </StatusPill>
            <StatusPill>План версії 2 · термін 22.09</StatusPill>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Виконав">Петренко Іван</Field>
            <Field label="Почав">22.09 14:05</Field>
            <Field label="Здав">22.09 14:52</Field>
          </div>
          <Separator />
          <h3 className="font-medium">Операції</h3>
          <ol className="flex flex-col gap-2">
            {ANSWERS.map((answer) => (
              <li key={answer.text} className="flex flex-col gap-1 rounded-md border p-2 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>{answer.text}</span>
                  {answer.result === 'done' ? (
                    <StatusPill tone="success">
                      <CircleCheckIcon /> Виконано
                    </StatusPill>
                  ) : (
                    <StatusPill>
                      <CircleDashedIcon /> Не застосовно
                    </StatusPill>
                  )}
                </span>
                {answer.note ? (
                  <span className="text-xs text-muted-foreground">Причина: {answer.note}</span>
                ) : null}
                {answer.photo ? (
                  <span className="flex gap-2">
                    <span className="flex h-16 w-24 items-center justify-center rounded border bg-muted text-muted-foreground">
                      <CameraIcon className="size-5" />
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <h3 className="font-medium">Використано</h3>
          <p className="text-sm">Мастило для ручних точок — 0,1 л · Безворсові серветки — 4 шт</p>
          <Label htmlFor="remark">Коментар (обов’язковий, якщо повертаєте)</Label>
          <Textarea id="remark" rows={2} />
          <Alert>
            <CalendarDaysIcon />
            <AlertDescription>
              Після прийняття наступне «Щотижневе ТО» M-01 буде 29.09 (від дня виконання 22.09).
            </AlertDescription>
          </Alert>
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" disabled>
            Повернути на доопрацювання
          </Button>
          <Button variant="success">Прийняти</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EmergencySheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-lg">Аварійний ремонт №1043 · P1</SheetTitle>
          <SheetDescription>M-02 NEWTOP-FB158SV1 · Цех стаканів · Лінія 2</SheetDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <StatePill state={EquipmentState.STOPPED} />
            <StatusPill tone="danger">
              <TimerIcon /> Не прийнято · до ескалації 03:12
            </StatusPill>
            <StatusPill>
              <ClockIcon /> Простій 0 год 04 хв
            </StatusPill>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Відповідальний">Коваль Олег</Field>
            <Field label="Резерв">Петренко Іван</Field>
            <Field label="Інцидент">№412 · майстер Лисенко А.</Field>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">«Не формується дно, заїдає подача паперу»</p>
            <p className="text-xs text-muted-foreground">
              Мельник Олена, оператор · 24.09 10:41 · 1 фото · робота зупинена
            </p>
          </div>
          <h3 className="flex items-center gap-2 font-medium">
            <HistoryIcon className="size-4" /> Хід
          </h3>
          <Timeline
            items={[
              ['10:41:05', 'Оператор повідомив через бот, станок → «Зупинено», простій почався'],
              ['10:41:06', 'Коваль О. — повідомлення в Telegram доставлено'],
              ['10:41:06', 'Майстер Лисенко А. — копія доставлена'],
              [
                '10:46 (очікується)',
                <span key="e" className="text-muted-foreground">
                  Ескалація: Петренко І. (резерв) і майстер, якщо ніхто не прийме
                </span>,
              ],
              [
                '10:51 (очікується)',
                <span key="p" className="text-muted-foreground">
                  Ескалація в панелі: головний механік і начальник виробництва
                </span>,
              ],
            ]}
          />
        </div>
        <SheetFooter className="flex-row flex-wrap justify-end border-t">
          <Button variant="outline">Призначити іншого механіка</Button>
          <span className="flex items-center gap-1">
            <Button disabled>Допустити до роботи</Button>
            <InfoTip text="Доступно після того, як механік позначить ремонт виконаним." />
          </span>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function BotScreen() {
  return (
    <div className="flex flex-wrap justify-center gap-6">
      <Phone title="Нагадування за 7 днів">
        <Bubble>
          <b>🔧 ТО через 7 днів</b>
          {'\n'}M-02 NEWTOP-FB158SV1{'\n'}Цех стаканів · Лінія 2{'\n\n'}
          <b>Щомісячне ТО — ср, 30.09</b>
          {'\n'}⏱ ≈ 90 хв · ⛔ потрібна зупинка{'\n\n'}
          <b>Операції (6):</b>
          {'\n'}1. Калібрування нагрівачів{'\n'}2. Ремені та ланцюги{'\n'}3. Клеми в шафі 📷
          {'\n'}4. Підшипники, люфт{'\n'}5. Накатка дна 📷{'\n'}6. Ультразвуковий вузол{'\n\n'}
          <b>Підготуйте:</b>
          {'\n'}• ІЧ-термометр{'\n'}• Динамометрична викрутка{'\n'}• Мастило — 0,2 л{'\n'}• Ремінь —
          1 шт (за потреби)
        </Bubble>
        <Keyboard
          rows={[
            ['Відкрити', '📄 Інструкція'],
            ['✅ Все є', '⚠️ Чогось бракує'],
          ]}
        />
        <Bubble mine>⚠️ Чогось бракує</Bubble>
        <Bubble>Чого бракує? Позначте або напишіть.</Bubble>
        <Keyboard rows={[['☑️ ІЧ-термометр'], ['☐ Мастило'], ['☐ Ремінь'], ['Готово']]} />
      </Phone>
      <Phone title="Виконання ТО">
        <Bubble>
          <b>ТО №1036 · M-01 NEWTOP-FB100S</b>
          {'\n'}Щотижневе ТО · розпочато 09:02{'\n\n'}
          <b>Операція 2 з 4</b>
          {'\n'}Очистити фільтр на вході масляного насоса{'\n'}📷 Потрібне фото
        </Bubble>
        <Keyboard rows={[['✅ Виконано'], ['❌ Не виконано', '➖ Не застосовно'], ['⏸️ Пауза']]} />
        <Bubble mine>📷 фото</Bubble>
        <Bubble mine>✅ Виконано</Bubble>
        <Bubble>
          ✔️ Збережено 09:14{'\n\n'}
          <b>Операція 3 з 4</b>
          {'\n'}Змастити ручні точки за картою змащування
        </Bubble>
      </Phone>
      <Phone title="Аварія: механіку">
        <Bubble>
          <b>🚨 Аварійний ремонт №1043 · P1</b>
          {'\n'}M-02 NEWTOP-FB158SV1 <b>зупинено</b>
          {'\n'}Цех стаканів · Лінія 2{'\n\n'}«Не формується дно, заїдає подача паперу»{'\n'}—
          Мельник О., 10:41 · 📷 1 фото{'\n\n'}⏱ <b>Прийміть до 10:46</b>
        </Bubble>
        <Keyboard rows={[['✅ Прийняти', '✋ Не можу']]} />
        <Bubble mine>✅ Прийняти</Bubble>
        <Bubble>Ремонт №1043 ваш. Майстра повідомлено.{'\n'}Позначайте кроки:</Bubble>
        <Keyboard
          rows={[['📍 Прибув', '▶️ Почав'], ['⏳ Очікування', '✅ Готово'], ['📄 Інструкція']]}
        />
      </Phone>
      <Phone title="Аварія: оператор">
        <Bubble mine>🛑 Повідомити про проблему</Bubble>
        <Bubble>Що сталося?</Bubble>
        <Keyboard rows={[['Поломка обладнання'], ['Немає матеріалу'], ['Небезпека']]} />
        <Bubble mine>Поломка обладнання</Bubble>
        <Bubble>На якому обладнанні? (зона «Лінія 2»)</Bubble>
        <Keyboard rows={[['M-02 NEWTOP-FB158SV1'], ['M-03 NEWTOP-118DT'], ['Не знаю / інше']]} />
      </Phone>
    </div>
  );
}

function Phone({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <figure className="flex w-[300px] flex-col gap-2">
      <figcaption className="text-center text-sm font-medium">{title}</figcaption>
      <div className="flex h-[760px] flex-col overflow-hidden rounded-[2rem] border-8 border-neutral-900 bg-[#0e1621] shadow-lg">
        <div className="flex items-center gap-2 bg-[#17212b] px-3 py-2 text-white">
          <span className="flex size-8 items-center justify-center rounded-full bg-sky-600 text-xs font-bold">
            В
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-medium">Вахта</span>
            <span className="text-[11px] text-sky-300">бот</span>
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden p-2">
          {children}
        </div>
      </div>
    </figure>
  );
}

function Bubble({
  mine = false,
  children,
}: {
  readonly mine?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'max-w-[88%] rounded-xl px-2.5 py-1.5 text-[12.5px] leading-snug whitespace-pre-line text-white',
        mine ? 'self-end bg-[#2b5278]' : 'self-start bg-[#182533]',
      )}
    >
      {children}
    </div>
  );
}

function Keyboard({ rows }: { readonly rows: readonly (readonly string[])[] }) {
  return (
    <div className="flex max-w-[88%] flex-col gap-1 self-start">
      {rows.map((row) => (
        <div key={row.join()} className="flex gap-1">
          {row.map((label) => (
            <span
              key={label}
              className="flex-1 rounded-md bg-[#2b5278]/70 px-2 py-1 text-center text-[12px] text-white"
            >
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
