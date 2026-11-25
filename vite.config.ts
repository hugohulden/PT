/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH sätts till /pt/ vid deploy till GitHub Pages
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Nellies träning',
        short_name: 'Träning',
        description: 'Vägen till Göteborgsvarvet, första pull-upen och starka ben',
        lang: 'sv',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFE3EE',
        theme_color: '#FF3D8B',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { environment: 'node', setupFiles: ['src/test/setup.ts'] },
});
