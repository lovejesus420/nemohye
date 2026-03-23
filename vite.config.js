import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.VITE_ANTHROPIC_KEY || ''

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    server: {
      proxy: {
        '/api/claude': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/claude/, '/v1/messages'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // 서버 측에서 API 키 주입 (CORS·ISO-8859-1 문제 없음)
              proxyReq.setHeader('x-api-key', apiKey)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
              // 브라우저에서 보낸 x-api-key 헤더는 제거 (중복 방지)
              proxyReq.removeHeader('anthropic-dangerous-direct-browser-access')
            })
          },
        },
      },
    },
  }
})
