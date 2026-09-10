import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    // The React Compiler memoizes for us: no useMemo, no useCallback, no React.memo in this app.
    react({ babel: { plugins: [['babel-plugin-react-compiler', { target: '19' }]] } }),
    tailwindcss(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // VITE_* variables are read from the monorepo root .env, not from the app folder.
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
