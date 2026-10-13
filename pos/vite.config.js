import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base '/pos/': la PWA se publica en cPanel bajo https://dominio/pos/
export default defineConfig({
  base: '/pos/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'POS Estudio Pilates & Barre',
        short_name: 'POS Pilates',
        description: 'Punto de venta offline para recepción',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/pos/',
        scope: '/pos/',
        theme_color: '#1d2d44',
        background_color: '#fffef5',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/pos/index.html'
      }
    })
  ],
  server: {
    port: 5137,
    host: true
  }
})