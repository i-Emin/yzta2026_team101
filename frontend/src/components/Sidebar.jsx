import {
  LayoutDashboard,
  TrendingUp,
  Newspaper,
  Bot,
  User,
  LogOut,
} from "lucide-react";

const MENU_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "simulation", label: "Simülasyon", icon: TrendingUp },
  { id: "news", label: "Haber", icon: Newspaper },
  { id: "chatbot", label: "Chatbot", icon: Bot },
];

export default function Sidebar({ activePage, onNavigate, user, onLogout }) {
  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col justify-between px-4 py-6 shrink-0">
      {/* Logo */}
      <div>
        <div className="flex items-center gap-2 px-2 mb-10">
          <div className="w-9 h-9 rounded-lg bg-finsim-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-finsim-primary tracking-tight">
            FinSim
          </span>
        </div>

        {/* Menü */}
        <nav className="flex flex-col gap-1">
          {MENU_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activePage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-finsim-primary text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onNavigate("profile")}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === "profile"
              ? "bg-finsim-primary text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-slate-600" />
          </div>
          <span className="truncate">{user?.name ?? "Profil"}</span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </aside>
  );
}