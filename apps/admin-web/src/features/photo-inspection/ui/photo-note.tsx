import { useStore } from 'zustand';
import { ChevronDownIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { FormField } from '@/components/app/fields';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { InspectionEditor } from '../model/editor';

const t = messages(currentLocale()).photoInspection;
export function PhotoNote({ editor, busy }: { editor: InspectionEditor; busy: boolean }) {
  const review = useStore(editor.store, (state) => state.review);
  const required = review.status === 'NOT_ASSESSABLE';
  const field = (
    <FormField
      label={required ? t.assessmentReason : t.reviewComment}
      hint={t.reviewCommentHelp}
      optional={!required}
    >
      {(id) => (
        <Textarea
          id={id}
          value={review.comment}
          maxLength={4000}
          rows={2}
          required={required}
          placeholder={t.reviewCommentPlaceholder}
          onChange={(event) => editor.change({ comment: event.target.value })}
        />
      )}
    </FormField>
  );
  if (required) return field;
  return (
    <Collapsible defaultOpen={Boolean(review.comment)}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          disabled={busy}
          variant="ghost"
          size="sm"
          className="max-w-full whitespace-normal text-left"
        >
          <ChevronDownIcon aria-hidden="true" />
          {review.comment ? t.noteAdded : t.addNote}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{field}</CollapsibleContent>
    </Collapsible>
  );
}
