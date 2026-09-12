import { useState } from 'react';
import { BookOpenIcon, CircleHelpIcon, CirclePlayIcon, ClipboardListIcon } from 'lucide-react';
import { format, messages, type GuideKey } from '@vakhta/i18n';
import { IconButton } from '@/shared/ui/icon-button';
import { DetailSheet } from '@/components/app/detail-sheet';
import { usePersistentState } from '@/lib/ui-store';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

/** The printable guide is served by the panel itself (apps/admin-web/public). */
const GUIDE_URL = '/user-guide.pdf';

function sectionTitle(guide: GuideKey): string {
  const t = messages(currentLocale()).admin;
  const sections = t.sections as Readonly<Record<string, string>>;
  const tabs = t.administration.tabs as Readonly<Record<string, string>>;
  return messages(currentLocale()).ui.guide[guide].title ?? sections[guide] ?? tabs[guide] ?? guide;
}

/**
 * "How it works": the purpose of the section and the normal steps, collapsible and remembered per
 * section, with a button to the questions and answers. Starts collapsed; explicit user choices
 * remain remembered so help stays available without crowding the workspace.
 */
export function HowItWorks({
  guide,
  compact = false,
  className,
}: {
  readonly guide: GuideKey;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const t = messages(currentLocale());
  const g = t.ui.guide[guide];
  const [open, setOpen] = usePersistentState(`guide.${guide}.open`, false);
  const [faq, setFaq] = useState(false);
  return (
    <div
      className={cn('rounded-lg border', compact ? 'bg-muted/40 p-3' : 'p-4', className)}
      data-testid={`guide-${guide}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          icon={ClipboardListIcon}
          label={t.ui.common.howItWorks}
          tooltip={t.ui.common.howItWorksHint}
          variant="ghost"
          type="button"
          className="h-auto min-w-0 flex-1 justify-start gap-2 text-left text-sm font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t.ui.common.howItWorks}
          <span className="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline">
            {open ? t.ui.common.hide : t.ui.common.details}
          </span>
        </IconButton>
        <IconButton
          icon={CircleHelpIcon}
          label={t.ui.common.faq}
          tooltip={t.ui.common.faqHint}
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setFaq(true)}
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{g.purpose}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {g.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {g.video && <GuideVideoLink video={g.video} />}
        </div>
      )}
      <FaqSheet guide={guide} open={faq} onOpenChange={setFaq} />
    </div>
  );
}

/** The "?" in the page header: opens the same questions and answers for the current section. */
export function FaqButton({ guide }: { readonly guide: GuideKey }) {
  const t = messages(currentLocale());
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={CircleHelpIcon}
        label={format(t.ui.common.helpFor, { section: sectionTitle(guide) })}
        tooltip={t.ui.common.faqHint}
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
      />
      <FaqSheet guide={guide} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Purpose, steps and the questions of one section, plus the link to the printable guide. */
function FaqSheet({
  guide,
  open,
  onOpenChange,
}: {
  readonly guide: GuideKey;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = messages(currentLocale());
  const g = t.ui.guide[guide];
  if (!open) return null;
  return (
    <DetailSheet
      open
      onOpenChange={onOpenChange}
      title={format(t.ui.common.helpFor, { section: sectionTitle(guide) })}
      description={g.purpose}
      footer={
        <IconButton
          icon={BookOpenIcon}
          label={g.document?.label ?? t.ui.common.openGuide}
          tooltip={t.ui.common.openGuideHint}
          asChild
          variant="outline"
        >
          <a href={g.document?.url ?? GUIDE_URL} target="_blank" rel="noreferrer">
            {g.document?.label ?? t.ui.common.openGuide}
          </a>
        </IconButton>
      }
    >
      {g.video && <GuideVideoLink video={g.video} />}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.ui.common.howItWorks}</h3>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {g.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.ui.common.faq}</h3>
        <div className="flex flex-col gap-1">
          {g.faq.map((item) => (
            <details key={item.q} className="group rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium select-none">{item.q}</summary>
              <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </DetailSheet>
  );
}

function GuideVideoLink({
  video,
}: {
  video: { readonly url: string; readonly label: string; readonly description?: string };
}) {
  return (
    <div className="flex flex-col gap-1">
      <a
        href={video.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CirclePlayIcon className="size-4 shrink-0" aria-hidden="true" />
        {video.label}
      </a>
      {video.description && <p className="text-xs text-muted-foreground">{video.description}</p>}
    </div>
  );
}
