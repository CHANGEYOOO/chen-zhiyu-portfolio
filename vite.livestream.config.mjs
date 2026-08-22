import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    emptyOutDir: false,
    outDir: "assets/react",
    lib: {
      entry: "livestream-react/main.jsx",
      name: "JoekuniLivestreamReact",
      formats: ["iife"],
    fileName: () => "livestream-circular-gallery.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
});
