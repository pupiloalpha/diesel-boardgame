import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/diesel/', // ajuste para o nome do seu repositório
  plugins: [react()],
});