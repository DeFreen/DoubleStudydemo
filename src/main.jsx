import React from "react";
import ReactDOM from "react-dom/client";
import AppShell from "./AppShell";
import "./app.css";

ReactDOM.createRoot(document.querySelector("#root")).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
