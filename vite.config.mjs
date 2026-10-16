/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';
import replace from '@rollup/plugin-replace';
import files from './build/plugins/files.mjs';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/office': { target: 'http://documents:3000', changeOrigin: true },
      '/browser': { target: 'http://collabora:9980' },
      '/hosting': { target: 'http://collabora:9980' },
      '/cool': { target: 'http://collabora:9980', ws: true },
    },
  },
  plugins: [
    vue(),
    files(),
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src/C:/Windows/system'),
    },
  },
});
