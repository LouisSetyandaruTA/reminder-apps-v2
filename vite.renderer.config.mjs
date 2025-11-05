import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            input: {
                main_window: path.resolve(__dirname, 'index.html'),
                reminder_window: path.resolve(__dirname, 'reminder.html'),
            },
        },
    },
});
