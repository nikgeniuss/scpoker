import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Tunnel-режим включается через client/.env: VITE_TUNNEL_HOST=poker-hub.city
// Без него Vite работает в обычном локальном dev-режиме (HMR через ws на 5173).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnelHost = env.VITE_TUNNEL_HOST?.trim() || ''

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@poker-room/shared': path.resolve(__dirname, '../shared/index.ts'),
      },
    },
    server: {
      port: 5173,
      host: true,
      // В tunnel-режиме разрешаем хост tunnel'я (Vite 5+ блокирует чужие Host header'ы).
      // В обычном dev оставляем дефолт (localhost + LAN-IP уже разрешены).
      allowedHosts: tunnelHost
        ? ['localhost', tunnelHost, '.' + tunnelHost.replace(/^\./, '')]
        : undefined,
      // HMR через tunnel идёт по WSS на 443 (5173 наружу не выставлен).
      // В обычном dev — дефолтный HMR на ws://localhost:5173.
      hmr: tunnelHost
        ? { host: tunnelHost, protocol: 'wss', clientPort: 443 }
        : undefined,
    },
  }
})
