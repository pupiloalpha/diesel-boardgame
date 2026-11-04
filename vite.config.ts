import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: 'https://pupiloalpha.github.io/diesel-boardgame/',
  plugins: [react()],
});
