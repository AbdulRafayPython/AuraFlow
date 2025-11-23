import { useEffect, useCallback } from "react";
import authService from "@/services/authService";
import { useAuth } from "@/contexts/AuthContext";
import AuthPage from "./AuthPage";

// Define the expected shape from /api/me (matches backend response)
interface MeResponse {
  username: string;
  email: string;
  display_name?: string;
  bio?: string;
  is_first_login: boolean;
  // Add other optional fields if returned (e.g., avatar: string)
}

// Type guard to safely assert the response matches MeResponse
function isMeResponse(data: unknown): data is MeResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'username' in data &&
    typeof (data as any).username === 'string' &&
    'email' in data &&
    typeof (data as any).email === 'string' &&
    'is_first_login' in data &&
    typeof (data as any).is_first_login === 'boolean'
    // Add checks for other required fields if needed
  );
}

export default function AuthPageWrapper() {
  const { setUser, setIsAuthenticated } = useAuth();

  const syncUserFromServer = useCallback(async () => {
    try {
      const data: unknown = await authService.getMe();  // Use 'unknown' – safe default for untyped API

      if (isMeResponse(data)) {
        // Safe to cast and use now
        setUser({
          username: data.username,
          email: data.email,
          display_name: data.display_name,
          bio: data.bio,
          is_first_login: data.is_first_login,
          // Map other fields if needed
        });
        setIsAuthenticated(true);
      } else {
        throw new Error('Invalid user data format from server');
      }
    } catch (err) {
      console.error('Failed to fetch user from server:', err);
      localStorage.removeItem('token');  // Invalid token or bad response – clear it
      setUser(null);
      setIsAuthenticated(false);
    }
  }, [setUser, setIsAuthenticated]);

  // On mount: If token exists, sync from server
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      syncUserFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserFromServer]);

  const handleAuth = () => {
    // After login/signup, sync fresh data
    syncUserFromServer();
  };

  return <AuthPage onAuth={handleAuth} />;
}