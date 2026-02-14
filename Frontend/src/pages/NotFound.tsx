import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex items-center justify-center h-full w-full bg-[hsl(var(--theme-bg-primary))]">
      <div className="text-center max-w-md px-6">
        <div className="text-8xl font-bold mb-4 bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] bg-clip-text text-transparent">
          404
        </div>
        <h1 className="text-2xl font-bold mb-2 text-[hsl(var(--theme-text-primary))]">
          Page Not Found
        </h1>
        <p className="text-[hsl(var(--theme-text-secondary))] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] text-[hsl(var(--theme-text-primary))] border border-[hsl(var(--theme-border-default))]"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-gradient-to-r from-[hsl(var(--theme-accent-primary))] to-[hsl(var(--theme-accent-secondary))] text-white shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
