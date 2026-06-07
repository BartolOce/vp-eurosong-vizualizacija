import { defineConfig } from 'vite';

// base: './' koristi relativne putanje pa radi na bilo kojem GitHub Pages
// URL-u (i na korisnik.github.io/repo/ i na korijenu) bez izmjena. Ne treba
// ga mijenjati nakon kreiranja repozitorija.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
});
