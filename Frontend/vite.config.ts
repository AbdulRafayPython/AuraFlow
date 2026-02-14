import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  // basicSsl is only needed for local HTTPS dev (LAN WebRTC),
  // skip it in production builds to avoid peer-dep conflicts.
  let sslPlugin: any = null;
  if (mode === "development") {
    try {
      const { default: basicSsl } = await import("@vitejs/plugin-basic-ssl");
      sslPlugin = basicSsl();
    } catch {
      // plugin not installed — fine for production
    }
  }

  return {
    server: {
      host: "0.0.0.0",
      port: 5173,
      // Proxy backend requests so the browser only talks HTTPS to Vite.
      // This avoids mixed-content blocks AND makes getUserMedia work on LAN
      // because the page is served over a secure context (HTTPS).
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
      sslPlugin,
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
