import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    // Segredo descartável, só de teste. Os testes que precisam de outro valor usam vi.stubEnv.
    env: { JWT_SECRET: 'segredo-de-teste-descartavel-com-mais-de-32-caracteres' },
    include: ['**/*.e2e-spec.ts'],
  },
});
