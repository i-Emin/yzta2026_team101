import { useState } from "react";
import { UserPlus, Eye, EyeOff, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { registerUser, loginUser } from "../services/api";

const RISK_OPTIONS = ["Düşük", "Orta", "Yüksek"];

export default function RegisterPage({ onLogin, onGoLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", risk_profile: "Orta" });
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerUser(form.name, form.email, form.password, form.risk_profile);
      setSuccess(true);
      await new Promise((r) => setTimeout(r, 900));
      const data = await loginUser(form.email, form.password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30 mb-4">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Fin101</h1>
          <p className="text-slate-400 mt-1 text-sm">Finansal yolculuğuna başlamak için kayıt ol</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">Hesap Oluştur</h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 mb-5 text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Kayıt başarılı! Giriş yapılıyor…</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Ad Soyad</label>
              <input
                type="text"
                value={form.name}
                onChange={update("name")}
                required
                placeholder="Adın Soyadın"
                className="w-full bg-white/5 border border-white/10 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">E-posta</label>
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                required
                placeholder="ornek@email.com"
                className="w-full bg-white/5 border border-white/10 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Şifre</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={update("password")}
                  required
                  minLength={6}
                  placeholder="En az 6 karakter"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Risk Profili</label>
              <div className="grid grid-cols-3 gap-2">
                {RISK_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, risk_profile: opt }))}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${
                      form.risk_profile === opt
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Kayıt Ol
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            Zaten hesabın var mı?{" "}
            <button onClick={onGoLogin} className="text-blue-400 hover:text-blue-300 font-medium transition">
              Giriş Yap
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
