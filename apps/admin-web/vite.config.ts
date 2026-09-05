import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Змінні VITE_* читаються з кореневого .env монорепо, а не з теки застосунку.
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
