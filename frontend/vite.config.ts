import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'react-vendor', test: /node_modules\/(react|react-dom|scheduler)\// }] } },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    // Real CSS text is needed only to check the design tokens; other styles stay stubbed.
    css: { include: [/theme\.css(\?raw)?$/] },
  },
})
