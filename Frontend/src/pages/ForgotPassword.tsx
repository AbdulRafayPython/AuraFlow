import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useNotifications } from "@/hooks/useNotifications";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotifications();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authService.requestPasswordReset(email);

      showSuccess({
        title: "OTP Sent",
        description: response.message || "Check your email for the OTP code.",
      });

      // Navigate to OTP page with email
      navigate("/otp-verification", { state: { email } });

    } catch (err: any) {
      showError({
        title: "Error",
        description: err.message || "Failed to send reset request.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card text-card-foreground border border-border p-8 rounded-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6">Forgot Password</h2>

        <form onSubmit={handleSubmit}>
          <label className="block text-foreground mb-2">
            Enter your email address
          </label>

          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="send"
            placeholder="Email"
            className="w-full border p-3 rounded-lg bg-background border-border text-foreground mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground p-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>

        <button type="button" className="block w-full text-center mt-4 text-[hsl(var(--theme-text-accent))] cursor-pointer hover:underline" onClick={() => navigate("/login")}>Back to login</button>
      </div>
    </div>
  );
}