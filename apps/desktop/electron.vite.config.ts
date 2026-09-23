import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@motor/contracts', '@motor/database', '@motor/nfe-parser'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@motor/contracts'] })],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [vue()],
  },
})
