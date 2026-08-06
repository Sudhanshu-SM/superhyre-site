import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(process.cwd(), 'src/talent-hero.tsx'),
      name: 'TalentHero',
      formats: ['iife'],
      fileName: () => 'talent-hero-bundle.js'
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100000000
  }
});