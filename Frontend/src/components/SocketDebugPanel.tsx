// Debug panel to show socket connection status
import { useState, useEffect } from 'react';
import { socketService } from '@/services/socketService';
import { useTheme } from '@/contexts/ThemeContext';
import { Wifi, WifiOff } from 'lucide-react';

export function SocketDebugPanel() {
  const { isDarkMode } = useTheme();
  const [isConnected, setIsConnected] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(socketService.isConnected());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const testFriendRequest = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/debug/test-friend-request/2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      console.log('[DEBUG] Test emission result:', data);
      alert('Test event sent! Check console.');
    } catch (error) {
      console.error('[DEBUG] Test emission failed:', error);
      alert('Test failed! Check console.');
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg border ${
      isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'
    } shadow-lg z-50`}>
      <div className="flex items-center gap-2 mb-2">
        {isConnected ? (
          <Wifi className="w-5 h-5 text-green-500" />
        ) : (
          <WifiOff className="w-5 h-5 text-red-500" />
        )}
        <span className={`text-sm font-medium ${
          isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          Socket: {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs px-2 py-1 rounded bg-blue-500 text-white"
        >
          {showDetails ? 'Hide' : 'Debug'}
        </button>
      </div>
      
      {showDetails && (
        <div className="space-y-2 mt-2">
          <button
            onClick={testFriendRequest}
            className="w-full text-xs px-2 py-1 rounded bg-purple-500 text-white hover:bg-purple-600"
          >
            Test Friend Request Event
          </button>
          <button
            onClick={() => {
              console.log('[DEBUG] Socket service state:', {
                connected: socketService.isConnected(),
                currentChannel: socketService.getCurrentChannel()
              });
            }}
            className="w-full text-xs px-2 py-1 rounded bg-orange-500 text-white hover:bg-orange-600"
          >
            Log Socket State
          </button>
        </div>
      )}
    </div>
  );
}
