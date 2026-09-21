import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env['CONTROL_DATABASE_URL'] ??
      'postgres://vakhta:vakhta@localhost:5432/vakhta_control',
  },
  strict: true,
  verbose: true,
});
