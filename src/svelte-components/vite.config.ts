import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte()
  ],
  resolve: {
    alias: {
      $lib: resolve('./src/lib'),
      $dialogs: resolve('./src/dialogs'),
      $components: resolve('./src/components')
    }
  },
  build: {
    target: "chrome60",
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'SvelteComponents',
      formats: ['iife'],
      fileName: () => "index.js"
    }
  }
})
