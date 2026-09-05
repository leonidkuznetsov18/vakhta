import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Змінні VITE_* читаються з кореневого .env монорепо, а не з теки застосунку.
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
