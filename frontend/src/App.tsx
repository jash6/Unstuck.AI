import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/layout";
import Home from "./pages/home";
import Profile from "./pages/profile";
import Onboarding from "./pages/onboarding.jsx";
import { UserProvider } from "./context/UserContext.jsx";

function App() {
  return (
    <UserProvider>
      <Router>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
        </Routes>
        <Layout>
          <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<Home />} />
          </Routes>
        </Layout>
      </Router>
    </UserProvider>
  );
}

export default App;
