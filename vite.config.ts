import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// CP-SAT runs multithreaded WebAssembly, which needs a cross-origin isolated page.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  // Relative asset paths, so the build works from any folder, such as GitHub Pages' /shift-planner/.
  base: './',
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
  // Let Vite handle the package's worker and .wasm URLs itself; protobufjs is CommonJS and needs pre-bundling.
  optimizeDeps: { exclude: ['or-tools-wasm'], include: ['protobufjs'] },
  worker: { format: 'es' },
})
