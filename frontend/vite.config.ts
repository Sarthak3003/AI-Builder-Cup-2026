import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'react-vendor', test: /node_modules\/(react|react-dom|scheduler)\// }] } },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: 'http://127.0.0.1:8000', secure: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    // Real CSS text is needed only to check the design tokens; other styles stay stubbed.
    css: { include: [/theme\.css(\?raw)?$/] },
  },
})
