// src/socket.ts
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
export const socket = io(API_BASE, {
  auth: {
    token: localStorage.getItem('token')
  },
  autoConnect: true
});