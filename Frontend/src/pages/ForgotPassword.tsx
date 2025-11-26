import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService"; // Adjust path as needed

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authService.requestPasswordReset(email);

      alert(response.message || "OTP sent successfully!");

      // Navigate to OTP page with email
      navigate("/verify-otp", { state: { email } });

    } catch (err: any) {
      alert(err.message || "Error sending reset request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6">Forgot Password</h2>

        <form onSubmit={handleSubmit}>
          <label className="block text-gray-700 mb-2">
            Enter your email address
          </label>

          <input
            type="email"
            placeholder="Email"
            className="w-full border p-3 rounded-lg mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>

        <p
          className="text-center mt-4 text-blue-600 cursor-pointer hover:underline"
          onClick={() => navigate("/login")}
        >
          Back to login
        </p>
      </div>
    </div>
  );
}