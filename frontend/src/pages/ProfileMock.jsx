import { useState, useEffect } from "react";
import { User, BookOpen, Target, BarChart2, Edit3, X, Save, AlertCircle, Loader2, Send, PlayCircle } from "lucide-react";
import { getMe, updateMe, testTelegramBriefing, updateStoredUser } from "../services/api";

const RISK_OPTIONS = ["Düşük", "Orta", "Yüksek"];

const RISK_COLORS = {
  "Düşük":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Orta":   "bg-amber-50  text-amber-700  border-amber-200",
  "Yüksek": "bg-red-50    text-red-700    border-red-200",
};


function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
      <p className="text-2xl font-bold text-finsim-primary">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

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
      className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-full transition disabled:opacity-60"
    >
      {status === "loading" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <PlayCircle className="w-3.5 h-3.5" />
      )}
      {status === "sent" ? "Gönderildi ✓" : status === "error" ? "Hata!" : "Test Et (Şimdi Gönder)"}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Profili Düzenle</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 mb-5 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Ad Soyad</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Risk Profili</label>
            <div className="grid grid-cols-3 gap-2">
              {RISK_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, risk_profile: opt }))}
                  className={`py-2 rounded-xl text-sm font-medium border transition ${
                    form.risk_profile === opt
                      ? "bg-finsim-primary border-finsim-primary text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              İlgi Alanları <span className="text-slate-400">(virgülle ayır)</span>
            </label>
            <input
              type="text"
              value={form.interests}
              onChange={(e) => setForm((f) => ({ ...f, interests: e.target.value }))}
              placeholder="Hisse Senetleri, ETF, Kripto"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Telegram Chat ID</label>
              <input
                type="text"
                value={form.telegram_chat_id}
                onChange={(e) => setForm((f) => ({ ...f, telegram_chat_id: e.target.value }))}
                placeholder="Örn: 123456789"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Bildirim Saati</label>
              <input
                type="time"
                value={form.briefing_time}
                onChange={(e) => setForm((f) => ({ ...f, briefing_time: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-finsim-primary hover:bg-finsim-primaryDark disabled:opacity-60 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                Kaydet
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-finsim-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
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

  const joinDate  = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("tr-TR", { year: "numeric", month: "long" })
    : "—";

  const interests = profile.interests ?? [];

  const stats = [
    { label: "XP Puanı",     value: profile.xp_score ?? 0 },
    { label: "Seviye",        value: profile.level ?? 1 },
    { label: "Sanal Bakiye",  value: `₺${(profile.virtual_balance ?? 10000).toLocaleString("tr-TR")}` },
  ];

  return (
    <div className="p-10 max-w-3xl mx-auto overflow-y-auto h-full">
      <h1 className="text-3xl font-bold text-slate-900">Profil</h1>
      <p className="text-slate-500 mt-1">Hesap bilgileriniz ve öğrenme istatistikleriniz.</p>

      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-finsim-primary flex items-center justify-center shrink-0">
          <User className="w-10 h-10 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 truncate">{profile.name}</h2>
          <p className="text-sm text-slate-500 truncate">{profile.email}</p>
          <p className="text-xs text-slate-400 mt-0.5">Üyelik: {joinDate}</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-sm text-finsim-primary font-medium hover:underline shrink-0"
        >
          <Edit3 className="w-4 h-4" />
          Düzenle
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <BarChart2 className="w-4 h-4 text-finsim-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-slate-800">Seviye İlerlemesi</p>
              <span className="text-xs font-medium text-finsim-primary">Seviye {profile.level ?? 1}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-finsim-primary h-2 rounded-full transition-all duration-700"
                style={{ width: `${levelProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">{levelProgress.currentStr} / {levelProgress.maxStr} XP</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-1">Risk Profili</p>
            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${RISK_COLORS[profile.risk_profile] ?? RISK_COLORS["Orta"]}`}>
              {profile.risk_profile}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">İlgi Alanları</p>
            {interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {interests.map((interest) => (
                  <span
                    key={interest}
                    className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-medium"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Henüz ilgi alanı eklenmedi. Profili düzenle!</p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-1">Telegram Akıllı Bildirim</p>
            {profile.telegram_chat_id ? (
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  Bağlı (ID: {profile.telegram_chat_id}). Her sabah <strong>{profile.briefing_time}</strong>'da bildirim alacaksınız.
                </p>
                <TestButton />
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Bağlı değil. Bot bildirimleri (Morning Briefing) almak için Profili Düzenle'den Chat ID ekleyin.
              </p>
            )}
          </div>
        </div>

      </div>

      {editing && (
        <EditModal user={profile} onClose={() => setEditing(false)} onSave={handleSave} />
      )}
    </div>
  );
}
