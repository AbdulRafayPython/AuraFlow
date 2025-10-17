import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthPage from "./AuthPage";

// Helper function to decode JWT and extract username
function decodeJWT(token: string): string | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return payload.sub || null; // JWT identity is stored in 'sub' claim
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return null;
  }
}

export default function AuthPageWrapper() {
  const { setAuthenticatedUser } = useAuth();

  const handleAuth = () => {
    // After successful login, token is stored by authService
    // Extract username from the JWT token
    const token = localStorage.getItem("token");
    if (token) {
      const username = decodeJWT(token);
      if (username) {
        setAuthenticatedUser(username);
      }
    }
  };

  return <AuthPage onAuth={handleAuth} />;
}