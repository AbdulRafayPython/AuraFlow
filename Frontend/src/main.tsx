import { createRoot } from "react-dom/client";
import axios from "axios";
import App from "./App.tsx";
import "./index.css";
import "./styles/themes.css";

// Skip ngrok browser warning for all axios requests
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

createRoot(document.getElementById("root")!).render(<App />);
