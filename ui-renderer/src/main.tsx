import React from "react";
import { createRoot } from "react-dom/client";

const App: React.FC = () => <div style={{ padding: "20px" }}>Hermes Overlay UI – skeleton ready.</div>;

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
