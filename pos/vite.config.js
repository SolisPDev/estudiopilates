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
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
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
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          // iOS no admite SVG: sin un PNG "maskable"/"any" la app instalada
          // mostraba un icono generico (H-019).
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
    host: true,
    // Solo para desarrollo local. En produccion la PWA se publica en el mismo
    // dominio que la API (https://dominio/pos/ + https://dominio/api/), de modo
    // que fetch('/api/...') es same-origin y no hay CORS que resolver. Cuando la
    // API corre en otro host (p. ej. un arnés de pruebas) se fija
    // VITE_API_PROXY para que el dev server la reenvie bajo la misma ruta /api,
    // que es exactamente el esquema de produccion.
    proxy: process.env.VITE_API_PROXY
      ? { '/api': { target: process.env.VITE_API_PROXY, changeOrigin: true } }
      : undefined
  }
})