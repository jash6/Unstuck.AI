import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { GoogleOAuthProvider } from "@react-oauth/google";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="168446558011-2fqrd9mp3fqm837fo0vq92bkc13slujj.apps.googleusercontent.com">
      <App />
      <ToastContainer />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
