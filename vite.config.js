import { defineConfig } from 'vite';
import { captureSink } from './scripts/capture-plugin.mjs';

export default defineConfig( {
	base: './',
	plugins: [ captureSink() ],
	server: { port: 5173, open: true },
	build: { target: 'esnext', chunkSizeWarningLimit: 2000 }
} );
