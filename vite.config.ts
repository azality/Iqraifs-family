import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Optimize Capacitor dependencies
  optimizeDeps: {
    include: ['@capacitor/core', '@capacitor/preferences', '@capacitor/push-notifications']
  },

  build: {
    // Don't fail on Capacitor plugin warnings - they're loaded at runtime on native platforms
    rollupOptions: {
      external: [],
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
})