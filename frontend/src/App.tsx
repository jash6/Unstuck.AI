import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/layout";
import Home from "./pages/home";
import Onboarding from "./pages/onboarding.jsx";
import ChatScreen from "./pages/chatScreen";
import { UserProvider } from "./context/UserContext.jsx";
import { ChatProvider } from "./context/ChatContext";

function App() {
  return (
    <ChatProvider>
      <UserProvider>
        <Router>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
          </Routes>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/chat/:chatId" element={<ChatScreen />} />
            </Routes>
          </Layout>
        </Router>
      </UserProvider>
    </ChatProvider>
  );
}

export default App;
