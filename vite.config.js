import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'

export default defineConfig({
  plugins: [
    vue(),
    babel() // Automatically loads your root babel.config.js settings
  ],
  
  base: process.env.NODE_ENV === 'production' ? '/polybius/' : '/',
  
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