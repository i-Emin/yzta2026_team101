import { useState, useEffect } from "react";
import { User, BookOpen, Target, BarChart2, Edit3, X, Save, AlertCircle, Loader2, Send, PlayCircle, ShieldCheck, Lock, Globe, LogOut, Award, CheckCircle } from "lucide-react";
import { getMe, updateMe, testTelegramBriefing, updateStoredUser } from "../services/api";

const RISK_OPTIONS = ["Düşük", "Orta", "Yüksek"];

const RISK_COLORS = {
  "Düşük":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Orta":   "bg-amber-50  text-amber-700  border-amber-200",
  "Yüksek": "bg-red-50    text-red-700    border-red-200",
};

function TestButton() {
  const [status, setStatus] = useState("idle");
  const handleTest = async () => {
    setStatus("loading");
    try {
      await testTelegramBriefing();
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };
  return (
    <button
      onClick={handleTest}
      disabled={status === "loading"}
      className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl transition disabled:opacity-60 shadow-sm shadow-blue-500/20 mt-3"
    >
      {status === "loading" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <PlayCircle className="w-4 h-4" />
      )}
      {status === "sent" ? "Gönderildi ✓" : status === "error" ? "Hata!" : "Test Bildirimi Gönder"}
    </button>
  );
}

function EditModal({ user, onClose, onSave }) {
  const [form, setForm]   = useState({
    name:         user.name,
    risk_profile: user.risk_profile,
    interests:    (user.interests ?? []).join(", "),
    telegram_chat_id: user.telegram_chat_id || "",
    briefing_time:    user.briefing_time || "09:00",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const interestList = form.interests
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateMe({
        name:         form.name.trim() || undefined,
        risk_profile: form.risk_profile,
        interests:    interestList,
        telegram_chat_id: form.telegram_chat_id.trim() || null,
        briefing_time:    form.briefing_time,
      });
      onSave(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Profili Düzenle</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 mb-5 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Ad Soyad</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Risk Profili</label>
            <div className="grid grid-cols-3 gap-2">
              {RISK_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, risk_profile: opt }))}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                    form.risk_profile === opt
                      ? "bg-finsim-primary border-finsim-primary text-white shadow-md shadow-blue-500/20"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
              İlgi Alanları <span className="text-slate-400 font-normal lowercase">(virgülle ayır)</span>
            </label>
            <input
              type="text"
              value={form.interests}
              onChange={(e) => setForm((f) => ({ ...f, interests: e.target.value }))}
              placeholder="Örn: Hisse Senetleri, ETF, Kripto"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Telegram Chat ID</label>
              <input
                type="text"
                value={form.telegram_chat_id}
                onChange={(e) => setForm((f) => ({ ...f, telegram_chat_id: e.target.value }))}
                placeholder="Örn: 123456789"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Bildirim Saati</label>
              <input
                type="time"
                value={form.briefing_time}
                onChange={(e) => setForm((f) => ({ ...f, briefing_time: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-finsim-primary hover:bg-finsim-primaryDark disabled:opacity-60 text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 transition shadow-md mt-2"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Değişiklikleri Kaydet
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ProfileMock({ setUser }) {
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [editing, setEditing]   = useState(false);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = (updated) => {
    setProfile(updated);
    if (setUser) setUser(updated);
    updateStoredUser(updated);
    setEditing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-10 h-10 animate-spin text-finsim-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-red-500">
          <AlertCircle className="w-10 h-10" />
          <span className="font-medium text-lg">{error}</span>
        </div>
      </div>
    );
  }

  const calculateLevelProgress = (xp, level) => {
    let minXp = 0;
    let maxXp = 500;
    
    if (level === 2) {
      minXp = 500;
      maxXp = 1200;
    } else if (level === 3) {
      minXp = 1200;
      maxXp = 2500;
    } else if (level >= 4) {
      minXp = 2500;
      maxXp = 2500;
    }
    
    if (level >= 4) return { percent: 100, currentStr: xp, maxStr: 'Maks' };
    
    const range = maxXp - minXp;
    const currentProgress = xp - minXp;
    const percent = Math.min(Math.max((currentProgress / range) * 100, 0), 100);
    
    return { percent, currentStr: xp, maxStr: maxXp };
  };

  const levelProgress = calculateLevelProgress(profile.xp_score ?? 0, profile.level ?? 1);
  const joinDate  = profile.created_at ? new Date(profile.created_at).getFullYear() : "2024";

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Profilim</h1>
        <p className="text-slate-500 mt-1">Hesap ayarlarınızı ve ilerlemenizi buradan yönetin.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: User Info, Financial Profile, Achievements */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* User Header Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50 pointer-events-none"></div>
            
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-finsim-primary to-blue-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : <User />}
                </div>
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-full border-4 border-white">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-slate-900">{profile.name}</h2>
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-100">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Onaylı Profil
                  </span>
                </div>
                <p className="text-slate-500 mb-1">{profile.email}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-4">
                  <div className="text-sm">
                    <span className="text-slate-400">Üyelik:</span> <span className="font-semibold text-slate-700">{joinDate}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-400">Yaş:</span> <span className="font-semibold text-slate-700">28</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Profile */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-finsim-primary" /> Finansal Profil
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Risk Toleransı</p>
                <p className={`inline-flex px-3 py-1 rounded-lg text-sm font-bold border ${RISK_COLORS[profile.risk_profile] ?? RISK_COLORS["Orta"]}`}>
                  {profile.risk_profile ?? "Belirtilmedi"}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Aylık Gelir (Tahmini)</p>
                <p className="text-lg font-bold text-slate-800">₺40.000+</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Yatırım Deneyimi</p>
                <p className="text-lg font-bold text-slate-800">Orta Seviye</p>
              </div>
            </div>
          </div>

          {/* Achievements & Progress */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" /> Başarılar & İlerleme
            </h3>
            
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase">Mevcut Unvan</p>
                  <p className="text-xl font-bold text-slate-900">Çaylak Yatırımcı</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-500 uppercase">Seviye {profile.level ?? 1}</p>
                  <p className="text-xl font-bold text-finsim-primary">{profile.xp_score ?? 0} XP</p>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between text-xs font-bold text-slate-400 mb-2">
                  <span>İlerleme</span>
                  <span>{levelProgress.currentStr} / {levelProgress.maxStr} XP</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-1000 shadow-sm"
                    style={{ width: `${levelProgress.percent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800 text-sm">İlk Kâr</p>
                <p className="text-xs text-slate-500">Kazanıldı</p>
              </div>
              
              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-2">
                  <span className="font-bold text-lg">7</span>
                </div>
                <p className="font-bold text-slate-800 text-sm">7 Gün Seri</p>
                <p className="text-xs text-slate-500">Kazanıldı</p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center opacity-60">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800 text-sm">Usta Borsacı</p>
                <p className="text-xs text-slate-400">Kilitli</p>
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center opacity-60">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="font-bold text-slate-800 text-sm">Temettü Kralı</p>
                <p className="text-xs text-slate-400">Kilitli</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Settings */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sticky top-6">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Ayarlar</h3>
            
            <div className="space-y-2">
              <button onClick={() => setEditing(true)} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition text-left group">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">Profili Düzenle</p>
                  <p className="text-xs text-slate-500">Kişisel bilgilerinizi güncelleyin</p>
                </div>
              </button>

              <button onClick={() => alert('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition text-left group">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-200 transition">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">Şifre Değiştir</p>
                  <p className="text-xs text-slate-500">Güvenlik ayarlarınız</p>
                </div>
              </button>

              <button onClick={() => alert('Şu an sadece Türkçe dil desteği sunulmaktadır.')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition text-left group">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-200 transition">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">Dil</p>
                  <p className="text-xs text-slate-500">Türkçe</p>
                </div>
              </button>
            </div>

            <hr className="my-6 border-slate-100" />

            <div className="mb-6">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">Telegram Bot</p>
                  {profile.telegram_chat_id ? (
                    <p className="text-xs text-slate-500 mt-0.5">Bağlı. Her gün <strong>{profile.briefing_time}</strong>'da bülten.</p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">Bülten için Profili Düzenle'den ID ekleyin.</p>
                  )}
                </div>
              </div>
              {profile.telegram_chat_id && <TestButton />}
            </div>

            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3.5 rounded-xl transition">
              <LogOut className="w-5 h-5" />
              Çıkış Yap
            </button>
          </div>
        </div>

      </div>

      {editing && (
        <EditModal user={profile} onClose={() => setEditing(false)} onSave={handleSave} />
      )}
    </div>
  );
}
