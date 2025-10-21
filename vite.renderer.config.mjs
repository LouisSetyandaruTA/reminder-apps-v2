import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    base: './',

    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main_window: path.resolve(__dirname, 'index.html'),
                reminder_window: path.resolve(__dirname, 'reminder.html'),
            },
        },
    },
});