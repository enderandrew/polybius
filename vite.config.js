import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],

  base: process.env.NODE_ENV === 'production' ? './' : '/',

  resolve: {
    alias: {
      '@': '/src',
    },
  },

  esbuild: {
    target: 'es2022',
    // 43 console.log calls were shipping into the production bundle,
    // including per-level logs that serialise whole objects. `pure` marks
    // ONLY console.log as side-effect-free so esbuild drops bare statement
    // calls to it — deliberately NOT `drop: ['console']`, which removes every
    // console method. console.error/warn throughout this codebase carry real
    // diagnostics (missing audio buffers, failed model loads, blocked BGM
    // autoplay, malformed surface data) that are worth keeping in production;
    // only .log was ever the noise the review flagged. Applied in production
    // only (matching the NODE_ENV check `base` above already relies on), so
    // `npm run serve` during development keeps every console.log call intact.
    //
    // This alone gets 38 of the 43. The other 5 sit inside a comma-expression
    // shape esbuild's own minifier produces when it folds adjacent statements
    // together (confirmed by reproducing the exact source structure in
    // isolation — `pure` correctly eliminates it there, but not once Vite's
    // full build pipeline has run its own statement-folding pass first).
    // Those 5 are individually wrapped in `if (import.meta.env.DEV)` at the
    // source instead — Vite's own documented dev/prod flag, statically
    // replaced with a literal boolean and dead-code-eliminated by Rollup,
    // independent of this esbuild option entirely.
    pure: process.env.NODE_ENV === 'production' ? ['console.log'] : [],
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
        },
      },
    },
  },
});
