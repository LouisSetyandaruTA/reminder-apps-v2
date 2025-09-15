import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // Pastikan plugin react ada jika Anda menggunakannya
import path from 'node:path';

export default defineConfig({
    base: './',

    plugins: [react()],
    build: {
        rollupOptions: {
            // Daftarkan kedua file HTML Anda sebagai input
            input: {
                main_window: path.resolve(__dirname, 'index.html'),      // Sesuaikan path jika perlu
                reminder_window: path.resolve(__dirname, 'reminder.html'), // Sesuaikan path jika perlu
            },
        },
    },
});