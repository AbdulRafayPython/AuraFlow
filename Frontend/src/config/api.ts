/**
 * Central API configuration — resolves backend URL dynamically.
 *
 * In development: Vite proxies /api, /socket.io, /uploads to localhost:5000
 * so we use same-origin (empty string). This keeps the page on HTTPS
 * (required for getUserMedia / WebRTC on non-localhost devices).
 *
 * In production: uses VITE_BACKEND_URL env var (set at build time on Vercel)
 * e.g. https://auraflow-backend.onrender.com
 */

const isDev = import.meta.env.DEV;

/** Base server URL (no trailing slash, no /api) */
export const API_SERVER = isDev
  ? ''
  : (import.meta.env.VITE_BACKEND_URL || `http://${window.location.hostname}:5000`);

/** Base API URL (with /api) */
export const API_URL = `${API_SERVER}/api`;
