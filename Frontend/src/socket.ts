// src/socket.ts
import { io, Socket } from 'socket.io-client';

// Frontend is HTTPS, but backend API is HTTP (local network)
const hostname = window.location.hostname;
const API_BASE = `http://${hostname}:5000`;

console.log('[SOCKET] Socket module loaded, API base:', API_BASE);

// Create socket instance but don't auto-connect
export const socket: Socket = io(API_BASE, {
  autoConnect: false,  // Don't connect until we have a token
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 15,
  transports: ['websocket', 'polling'],
  forceNew: false,
  rejectUnauthorized: false,
  timeout: 20000
});

// Function to connect with token
export function connectSocket() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.warn('[SOCKET] ⚠️  No token available, skipping connection');
    return;
  }

  console.log('[SOCKET] Connecting with token...');

  // Remove "Bearer " prefix if it exists
  let cleanToken = token;
  if (token.startsWith('Bearer ')) {
    cleanToken = token.substring(7); // Remove "Bearer " (7 chars)
  }

  // Update auth before connecting
  socket.auth = { token: cleanToken };
  socket.io.opts.query = { token: `Bearer ${cleanToken}` };
  
  // Connect if not already connected
  if (!socket.connected) {
    socket.connect();
  }
}

// Function to disconnect socket
export function disconnectSocket() {
  if (socket.connected) {
    console.log('[SOCKET] Disconnecting...');
    socket.disconnect();
  }
}

// Debug events
socket.on('connect', () => {
  console.log('[SOCKET] ✅ Connected to server, ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('[SOCKET] ❌ Connection error:', error);
  
  // If it's a token error, try to reconnect with fresh token
  if (error.message?.includes('token') || error.message?.includes('401')) {
    console.warn('[SOCKET] Token may be expired, will retry on next attempt');
    
    // Update token from localStorage in case it was refreshed
    setTimeout(() => {
      const freshToken = localStorage.getItem('token');
      if (freshToken) {
        console.log('[SOCKET] Retrying with fresh token');
        disconnectSocket();
        setTimeout(() => connectSocket(), 1000);
      }
    }, 2000);
  }
});

socket.on('disconnect', (reason) => {
  console.warn('[SOCKET] ⚠️  Disconnected:', reason);
  
  // Auto-reconnect if it was a transport error or server disconnect
  if (reason === 'io server disconnect' || reason === 'transport close') {
    console.log('[SOCKET] Will attempt automatic reconnection...');
    setTimeout(() => {
      const token = localStorage.getItem('token');
      if (token) {
        connectSocket();
      }
    }, 2000);
  }
});

socket.on('error', (error) => {
  console.error('[SOCKET] 🔴 Socket error:', error);
});