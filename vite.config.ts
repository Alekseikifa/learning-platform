import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['alekseikifa1.zapto.org', 'localhost', '127.0.0.1']
  }
});
