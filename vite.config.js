import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sessionsApiPlugin } from './scripts/vite-sessions-api.mjs';
import { validationApiPlugin } from './scripts/vite-validation-api.mjs';

export default defineConfig({
  appType: 'spa',
  plugins: [react(), validationApiPlugin(), sessionsApiPlugin()],
});
