import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/layout.jsx";
import Home from "./pages/home.jsx";
import Onboarding from "./pages/onboarding.jsx";
import ChatScreen from "./pages/ChatScreen.jsx";
import UserProvider from "./context/UserContext.jsx";
import ChatProvider from "./context/ChatContext.jsx";

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
