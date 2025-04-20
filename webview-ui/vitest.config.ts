import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        css: true,
        globals: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@common-types': resolve(__dirname, '../src/common-types'),
            '@shared/types': resolve(__dirname, '../src/types')
        },
    },
}); 
