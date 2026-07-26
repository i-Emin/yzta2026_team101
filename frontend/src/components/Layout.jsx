
import { useState } from "react";
import Sidebar from "./Sidebar";
import ChatView from "../pages/ChatView";
import DashboardMock from "../pages/DashboardMock";
import Simulation from "../pages/Simulation";
import NewsMock from "../pages/NewsMock";
import ProfileMock from "../pages/ProfileMock";

export default function Layout({ user, setUser, onLogout }) {
  const [activePage, setActivePage] = useState("chatbot");

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":  return <DashboardMock />;
      case "simulation": return <Simulation />;
      case "news":       return <NewsMock />;
      case "profile":    return <ProfileMock setUser={setUser} />;
      case "chatbot":
      default:           return <ChatView />;
    }
  };

  return (
    <div className="flex h-screen bg-finsim-bg">
      <Sidebar activePage={activePage} onNavigate={setActivePage} user={user} onLogout={onLogout} />
      <main className="flex-1 h-screen overflow-y-auto">{renderPage()}</main>
    </div>
  );
}
