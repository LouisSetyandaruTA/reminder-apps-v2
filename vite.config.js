// Di dalam file: vite.main.config.mjs

import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            // Beritahu Vite untuk tidak mem-bundle library Node.js ini
            external: ['google-spreadsheet', 'google-auth-library'],
        },
    },
});