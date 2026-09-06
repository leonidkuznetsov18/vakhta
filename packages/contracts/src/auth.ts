import { z } from 'zod';
import { SCOPE_TYPES, WEB_ROLES } from '@vakhta/domain';
import { IsoDateTime, Uuid } from './common.js';

export const WebRoleSchema = z.enum(WEB_ROLES);
export const ScopeTypeSchema = z.enum(SCOPE_TYPES);

export const RoleGrantView = z.object({
  id: Uuid,
  role: WebRoleSchema,
  scopeType: ScopeTypeSchema,
  scopeId: Uuid.nullable(),
  grantedAt: IsoDateTime,
});
export type RoleGrantView = z.infer<typeof RoleGrantView>;

/** Область обовʼязкова для всіх типів, крім ENTERPRISE. */
export const GrantRoleCommand = z
  .object({
    role: WebRoleSchema,
    scopeType: ScopeTypeSchema.default('ENTERPRISE'),
    scopeId: Uuid.optional(),
  })
  .refine(
    (v) => (v.scopeType === 'ENTERPRISE' ? v.scopeId === undefined : v.scopeId !== undefined),
    {
      message:
        'scopeId обовʼязковий для області, відмінної від ENTERPRISE, і заборонений для ENTERPRISE',
      path: ['scopeId'],
    },
  );
export type GrantRoleCommand = z.infer<typeof GrantRoleCommand>;

/** Мінімум 12 символів: панель має MFA, але пароль лишається першим фактором. */
export const Password = z.string().min(12).max(128);

export const CreateWebUserCommand = z.object({
  email: z.email(),
  name: z.string().trim().min(2).max(200),
  password: Password,
  roles: z.array(GrantRoleCommand).default([]),
});
export type CreateWebUserCommand = z.infer<typeof CreateWebUserCommand>;

export const UpdateWebUserCommand = z.object({ name: z.string().trim().min(2).max(200) });
export type UpdateWebUserCommand = z.infer<typeof UpdateWebUserCommand>;

/**
 * Own profile: the display name and the avatar as a small data URL (the panel resizes the photo
 * to 256×256 before sending, so the whole picture fits into the user row). `null` removes it.
 */
export const AvatarDataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
  .max(300_000);
export const UpdateMeCommand = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  image: AvatarDataUrl.nullable().optional(),
});
export type UpdateMeCommand = z.infer<typeof UpdateMeCommand>;

export const WebUserView = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  twoFactorEnabled: z.boolean(),
  /** Avatar as a data URL, or null for the generated placeholder. */
  image: z.string().nullable(),
  roles: z.array(RoleGrantView),
  createdAt: IsoDateTime,
});
export type WebUserView = z.infer<typeof WebUserView>;

/** Що панель показує про поточного користувача. */
export const MeView = WebUserView;
export type MeView = z.infer<typeof MeView>;
