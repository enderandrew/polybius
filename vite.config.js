import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
  ],
  
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  
  esbuild: {
    target: 'es2022'
  },
  
  build: {
    // Increase limit to prevent warnings
    chunkSizeWarningLimit: 1600, 
    rollupOptions: {
      output: {
        // Tell Rollup to separate 'three' into its own chunk
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three-vendor';
          }
        }
      }
    }
  }
})