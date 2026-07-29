
import { useState } from "react";
import { getStoredUser, logoutUser } from "./services/api";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

export default function App() {
  const [user, setUser]     = useState(() => getStoredUser());
  const [authPage, setAuthPage] = useState("login");

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    logoutUser();
    setUser(null);
  };

  if (!user) {
    if (authPage === "register") {
      return (
        <RegisterPage
          onLogin={handleLogin}
          onGoLogin={() => setAuthPage("login")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onGoRegister={() => setAuthPage("register")}
      />
    );
  }

  return <Layout user={user} setUser={setUser} onLogout={handleLogout} />;
}
