import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  return {
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            // React core
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            // UI primitives (Radix + shadcn)
            "vendor-ui": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-tabs",
              "@radix-ui/react-select",
              "@radix-ui/react-popover",
              "@radix-ui/react-avatar",
              "@radix-ui/react-scroll-area",
            ],
            // Charts (recharts is large — only needed in admin)
            "vendor-charts": ["recharts"],
            // Real-time / WebRTC
            "vendor-realtime": ["socket.io-client"],
            // Utilities
            "vendor-utils": ["axios", "date-fns", "clsx", "class-variance-authority", "tailwind-merge"],
            // Admin pages (large, not on critical path)
            "chunk-admin": ["./src/pages/admin/index.ts"],
            // System admin pages
            "chunk-system-admin": ["./src/pages/system-admin/index.ts"],
          },
        },
      },
    },
    server: {
      host: "localhost",
      port: 5173,
      // Proxy backend requests so the browser talks to Vite,
      // which forwards to the Flask backend on localhost:5000.
      proxy: {
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: "http://localhost:5000",
          changeOrigin: true,
          ws: true,
          secure: false,
        },
        "/uploads": {
          target: "http://localhost:5000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
