import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

// Plugin: copy public dir manually, skipping unreadable files
function safeCopyPublicPlugin() {
  return {
    name: 'safe-copy-public',
    apply: 'build' as const,
    closeBundle() {
      const publicDir = resolve(__dirname, 'public');
      const distDir = resolve(__dirname, 'dist');
      function copyDir(src: string, dest: string) {
        let entries: string[] = [];
        try { entries = fs.readdirSync(src); } catch { return; }
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry);
          const destPath = path.join(dest, entry);
          let stat: fs.Stats | null = null;
          try { stat = fs.statSync(srcPath); } catch { continue; }
          if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            try { fs.copyFileSync(srcPath, destPath); } catch { /* skip locked files */ }
          }
        }
      }
      copyDir(publicDir, distDir);
    },
  };
}

export default defineConfig({
  plugins: [react(), safeCopyPublicPlugin()],
  appType: 'mpa',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    copyPublicDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        painel: resolve(__dirname, 'painel.html'),
      },
    },
  },
});
