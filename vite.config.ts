import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // woff2 fica fora do glob padrão do workbox, e sem isto o nome da casa cai
      // em serifa toda vez que o app abre offline.
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
      manifest: {
        name: 'Casa Compartilhada',
        short_name: 'Casa',
        description: 'Compras e tarefas da casa, para todo mundo que mora nela.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8f5ef',
        theme_color: '#f8f5ef',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
