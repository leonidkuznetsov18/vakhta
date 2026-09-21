import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { t } from '@/shared/i18n';
import type { BrandingFormModel } from '../model/use-branding-form';
import { FieldError } from './field-error';

export function BrandingFields({ form }: { form: BrandingFormModel }) {
  const m = t().branding;
  return (
    <fieldset disabled={form.disabled} className="flex min-w-0 flex-col gap-5">
      <div className="grid gap-2">
        <label htmlFor="brand-name" className="text-sm font-medium">
          {m.name}
        </label>
        <Input
          id="brand-name"
          value={form.draft.displayName}
          maxLength={120}
          aria-invalid={Boolean(form.nameError)}
          aria-describedby={form.nameError ? 'brand-name-error' : undefined}
          onChange={(event) => form.update({ displayName: event.target.value })}
        />
        {form.nameError ? <FieldError id="brand-name-error" message={m.nameError} /> : null}
      </div>
      <LogoField form={form} />
      <ColorField form={form} />
    </fieldset>
  );
}
function LogoField({ form }: { form: BrandingFormModel }) {
  const m = t().branding;
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor="brand-logo" className="text-sm font-medium">
        {m.logo}
      </label>
      <Input
        key={form.draft.logoUrl}
        id="brand-logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-describedby="brand-logo-hint"
        className="min-w-0 max-w-full"
        onChange={(event) => form.chooseLogo(event.target.files?.[0])}
      />
      <p id="brand-logo-hint" className="text-xs text-muted-foreground">
        {m.logoHint}
      </p>
      {form.fileError ? <FieldError message={form.fileError} /> : null}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={form.disabled || !form.draft.logoUrl}
        onClick={form.removeLogo}
      >
        {m.removeLogo}
      </Button>
    </div>
  );
}
function ColorField({ form }: { form: BrandingFormModel }) {
  const m = t().branding;
  return (
    <div className="grid gap-2">
      <label htmlFor="brand-color" className="text-sm font-medium">
        {m.color}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          type="color"
          aria-label={m.color}
          className="w-12 shrink-0 cursor-pointer p-1"
          value={form.colorValue}
          onChange={(event) => form.update({ accentColor: event.target.value })}
        />
        <Input
          id="brand-color"
          className="min-w-0 flex-1 font-mono"
          value={form.draft.accentColor}
          placeholder="#2563eb"
          maxLength={7}
          aria-invalid={Boolean(form.colorError)}
          aria-describedby={form.colorError ? 'brand-color-error' : undefined}
          onChange={(event) => form.update({ accentColor: event.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          disabled={form.disabled || !form.draft.accentColor}
          onClick={() => form.update({ accentColor: '' })}
        >
          {m.defaultColor}
        </Button>
      </div>
      {form.colorError ? <FieldError id="brand-color-error" message={m.colorError} /> : null}
    </div>
  );
}
