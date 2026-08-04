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
      entry: resolve(process.cwd(), 'src/main.jsx'),
      name: 'ReactCursorBundle',
      fileName: () => 'cursor-bundle.js',
      formats: ['iife']
    }
  }
});
