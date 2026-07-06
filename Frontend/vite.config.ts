import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Vite's dev WS-proxy (used for /socket.io) attaches an error listener
// directly on the raw browser<->Vite socket and unconditionally logs
// "ws proxy socket error: ... ECONNRESET" every time that connection drops —
// which happens on completely normal events (page refresh, HMR full reload,
// tab close, backend auto-reload) and isn't actionable; socket.io's own
// client-side reconnection (see socketService.ts) already handles it. Filter
// just this one benign, expected message via Vite's official customLogger
// hook so real proxy errors still surface.
const _logger = createLogger();
const _rawLoggerError = _logger.error;
_logger.error = (msg, options) => {
  if (msg.includes("ws proxy socket error") && msg.includes("ECONNRESET")) return;
  _rawLoggerError(msg, options);
};

// ─── Local "hosted-looking" demo mode ───────────────────────────────────
// For defense/demo days: run everything (frontend, backend, DB) on this one
// laptop, but have the browser show a real-looking domain instead of
// localhost:5173, with a valid HTTPS padlock. Purely local — no networking,
// no internet round trip, same speed as plain localhost.
//
// Activated automatically IF AND ONLY IF certs exist at Frontend/certs/ —
// generate them once with mkcert (https://github.com/FiloSottile/mkcert):
//   mkcert -install                  (installs a local CA, one-time)
//   mkdir certs
//   mkcert -cert-file certs/demo.pem -key-file certs/demo-key.pem auraflow.app
// Then map the domain to this machine in the OS hosts file
// (C:\Windows\System32\drivers\etc\hosts, needs Administrator):
//   127.0.0.1   auraflow.app
// Visit https://auraflow.app:5173 — everyday `npm run dev` (no certs
// present) is completely unaffected and keeps using plain http://localhost.
const _demoCertDir = path.resolve(__dirname, "certs");
const _demoKeyPath = path.join(_demoCertDir, "demo-key.pem");
const _demoCertPath = path.join(_demoCertDir, "demo.pem");
const _hasDemoCert = fs.existsSync(_demoKeyPath) && fs.existsSync(_demoCertPath);
const _demoHost = process.env.DEMO_HOST || "auraflow.app";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  return {
    customLogger: _logger,
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
      ...(_hasDemoCert ? {
        // 0.0.0.0 binds every local IPv4 interface at once — loopback
        // (127.0.0.1, so this laptop's own auraflow.app hosts-file entry
        // still works) AND the LAN/WiFi adapter (so a second laptop on the
        // same network, with its OWN hosts entry pointing auraflow.app at
        // this machine's LAN IP, can reach it too). Only takes effect in
        // demo mode — everyday `npm run dev` with no certs present is
        // unaffected and keeps the default above.
        host: "0.0.0.0",
        // 443 is HTTPS' default port, so the browser hides it from the
        // address bar entirely — https://auraflow.app instead of
        // https://auraflow.app:5173. Confirmed nothing else on this machine
        // is listening on 443 and Windows has no reserved-range conflict.
        port: 443,
        https: {
          key: fs.readFileSync(_demoKeyPath),
          cert: fs.readFileSync(_demoCertPath),
        },
        // Vite rejects requests whose Host header isn't localhost/an IP by
        // default — this is what lets the browser hit https://auraflow.app
        // instead of only https://localhost.
        allowedHosts: [_demoHost],
      } : {}),
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
