import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

export default defineConfig({
  build: {
    outDir: '../../public/build-crm',
    emptyOutDir: true,
    manifest: true,
  },
  plugins: [
    laravel({
      publicDirectory: '../../public',
      buildDirectory: 'build-crm',
      input: [
        __dirname + '/resources/assets/sass/app.scss',
        __dirname + '/resources/assets/js/app.js',
      ],
      refresh: true,
    }),
  ],
  resolve: {
    alias: {
      '@': __dirname + '/resources/js',
    },
  },
});
