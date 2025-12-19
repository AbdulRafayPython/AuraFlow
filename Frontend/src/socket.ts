// src/socket.ts
import { io } from 'socket.io-client';

// Frontend is HTTPS, but backend API is HTTP (local network)
const hostname = window.location.hostname;
const API_BASE = `http://${hostname}:5000`;

console.log('[SOCKET] Initializing socket connection to:', API_BASE);

const token = localStorage.getItem('token');
console.log('[SOCKET] Token exists:', !!token, 'Length:', token?.length || 0);

// Remove "Bearer " prefix if it exists
let cleanToken = token;
if (token && token.startsWith('Bearer ')) {
  cleanToken = token.replace('Bearer ', '');
  console.log('[SOCKET] Cleaned token (removed Bearer prefix)');
}

// Socket.IO 4.x uses auth, but the server might look in query params
export const socket = io(API_BASE, {
  auth: {
    token: cleanToken || ''
  },
  query: {
    token: cleanToken || ''
  },
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 15,
  transports: ['websocket', 'polling'],
  forceNew: false,
  rejectUnauthorized: false,
  timeout: 20000 // 20 second initial connection timeout
});

// Debug events
socket.on('connect', () => {
  console.log('[SOCKET] ✅ Connected to server, ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('[SOCKET] ❌ Connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.warn('[SOCKET] ⚠️  Disconnected:', reason);
});

socket.on('error', (error) => {
  console.error('[SOCKET] 🔴 Socket error:', error);
});