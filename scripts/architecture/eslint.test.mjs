import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
const eslint = new ESLint();
async function rules(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}
test('blocks upward imports and private feature imports, including relative paths', async () => {
  assert.ok(
    (
      await rules(
        "import { ImportDialog } from '@/features/employee-import';",
        'apps/admin-web/src/shared/api/index.ts',
      )
    ).includes('boundaries/dependencies'),
  );
  assert.ok(
    (
      await rules(
        "import { profileDraft } from '../../../features/employee-profile/model/editor';",
        'apps/admin-web/src/entities/employee/api/directory.ts',
      )
    ).includes('boundaries/dependencies'),
  );
  assert.ok(
    (
      await rules(
        "import { profileDraft } from '@/features/employee-profile/model/editor';",
        'apps/admin-web/src/features/audit-filters/index.ts',
      )
    ).includes('boundaries/dependencies'),
  );
});
test('allows the public entity API from a feature', async () => {
  assert.ok(
    !(
      await rules(
        "import { readEmployeePage } from '@/entities/employee';",
        'apps/admin-web/src/features/employee-profile/model/directory.ts',
      )
    ).includes('boundaries/dependencies'),
  );
});
test('blocks aliased and namespace lifecycle hooks', async () => {
  assert.ok(
    (
      await rules(
        "import { useEffect as run } from 'react';",
        'apps/admin-web/src/features/audit-filters/index.ts',
      )
    ).includes('no-restricted-imports'),
  );
  assert.ok(
    (
      await rules(
        "import * as React from 'react'; const effect = React.useEffect;",
        'apps/admin-web/src/features/audit-filters/index.ts',
      )
    ).includes('no-restricted-syntax'),
  );
});
