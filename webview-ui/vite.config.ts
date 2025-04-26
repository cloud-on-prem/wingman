/// <reference types="vitest" />
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
// Remove viteStaticCopy import as it's no longer used
// import { viteStaticCopy } from 'vite-plugin-static-copy'; 

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        // Remove the static copy plugin configuration
    ],
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js'],
        alias: {
            // Define aliases for shared types
            '@shared/types': resolve(__dirname, '../src/types'),
            '@common-types': resolve(__dirname, '../src/common-types')
        }
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                // Configure output asset names
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
            },
        },
        emptyOutDir: true, // Clean output directory before build
        sourcemap: process.env.NODE_ENV !== 'production', // Enable sourcemaps for non-production builds
    },
    // Correctly integrate Vitest config using the reference type
    test: { 
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'], // Path to setup file for tests
        css: true, // Enable CSS processing for tests
        coverage: {
            provider: 'v8', // Use v8 for coverage
            reporter: ['text', 'html'], // Output formats for coverage report
            exclude: [ // Files/patterns to exclude from coverage
                'node_modules/',
                'src/test/',
                '**/*.d.ts',
                '**/*.test.{ts,tsx}',
                'src/vscode.ts',
                // Exclude JavaScript config files from coverage
                '**/*.js', 
                'postcss.config.js',
                'tailwind.config.js',
                'vite.config.ts', // Exclude the config file itself
                'dist/**',
                'coverage/**'
            ],
            include: [ // Files/patterns to include in coverage
                'src/**/*.tsx',
                'src/**/*.ts'
            ],
            all: true // Report coverage for all included files, even untested ones
        }
    }
});
