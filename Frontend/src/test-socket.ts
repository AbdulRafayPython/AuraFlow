/**
 * Quick test script to verify socket connection
 */

import { socket } from '@/socket';

export function testSocketConnection(): boolean | Promise<boolean> {
  console.log('=== SOCKET CONNECTION TEST ===');
  console.log('Socket connected:', socket.connected);
  console.log('Socket ID:', socket.id);
  console.log('Socket disconnected:', socket.disconnected);
  
  // Try to emit a test event
  if (socket.connected) {
    console.log('[TEST] Socket is connected, ready for voice events');
    return Promise.resolve(true);
  } else {
    console.log('[TEST] Socket NOT connected, waiting...');
    
    // Wait for connection
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[TEST] Connection timeout');
        resolve(false);
      }, 5000);
      
      socket.once('connect', () => {
        clearTimeout(timeout);
        console.log('[TEST] Socket connected successfully');
        resolve(true);
      });
      
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('[TEST] Connection error:', error);
        resolve(false);
      });
    });
  }
}

// Run test immediately
Promise.resolve(testSocketConnection()).then(result => {
  console.log('[TEST] Result:', result ? 'SUCCESS' : 'FAILED');
});
