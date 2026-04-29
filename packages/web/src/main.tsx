import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/global.css";
import "./styles/grid-paper.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
