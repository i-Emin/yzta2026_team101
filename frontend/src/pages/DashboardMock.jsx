import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, PieChart as PieChartIcon, PlayCircle, BookOpen, Shield, ArrowRight, Wallet, Briefcase } from "lucide-react";
import { getMarketPrice, getPortfolio, getMe } from "../services/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const WATCHLIST = [
  { ticker: "XU100.IS", label: "BIST 100" },
  { ticker: "THYAO.IS", label: "Türk Hava Yolları" },
  { ticker: "GARAN.IS", label: "Garanti Bankası" },
  { ticker: "AAPL",     label: "Apple" },
];

function PriceRow({ ticker, label }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    getMarketPrice(ticker)
      .then(setData)
      .catch(() => setError("Hata"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const change = data?.price && data?.previous_close
    ? ((data.price - data.previous_close) / data.previous_close) * 100
    : null;
  const isUp = change !== null && change >= 0;

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
      <div>
        <p className="font-bold text-slate-800 text-sm">{ticker}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <div className="text-right">
        {loading ? (
          <RefreshCw className="w-4 h-4 animate-spin text-slate-400 inline-block" />
        ) : error ? (
          <span className="text-xs text-red-500">{error}</span>
        ) : (
          <>
            <p className="font-semibold text-slate-800 text-sm">{data.price ? data.price.toFixed(2) : "—"}</p>
            <p className={`text-xs font-medium flex items-center justify-end gap-1 ${isUp ? "text-emerald-600" : "text-red-500"}`}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {change !== null ? `${Math.abs(change).toFixed(2)}%` : "—"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardMock() {
  const [profile, setProfile] = useState({});
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getMe().then(res => setProfile(res || {})).catch(e => console.error("Profile error:", e)),
      getPortfolio().then(items => {
        const list = items || [];
        const val = list.reduce((acc, item) => acc + (item.quantity * item.average_cost), 0);
        setPortfolioValue(val);
      }).catch(e => console.error("Portfolio error:", e))
    ]).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <RefreshCw className="w-10 h-10 animate-spin text-finsim-primary" />
      </div>
    );
  }

  const balance = profile?.virtual_balance ?? 10000;
  const riskProfile = profile?.risk_profile ?? "Dengeli";

  return (
    <div className="p-10 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Merhaba{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''} 👋</h1>
          <p className="text-slate-500 mt-1">Piyasaları keşfetmeye ve öğrenmeye hazır mısın?</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition shadow-sm">
            Haberleri Oku
          </button>
          <button className="px-5 py-2.5 bg-finsim-primary text-white font-medium rounded-xl hover:bg-finsim-primaryDark transition shadow-sm flex items-center gap-2">
            Simülasyona Başla <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4-Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Sanal Bakiye</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">₺{balance.toLocaleString("tr-TR")}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Portföy Değeri</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">₺{portfolioValue.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Eğitimler</p>
            </div>
            <span className="text-xs font-bold text-purple-600">%60</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-4">
            <div className="bg-purple-600 h-2 rounded-full" style={{ width: "60%" }}></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Risk Profili</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{riskProfile}</p>
          <p className="text-xs text-slate-400 mt-1">Orta Seviye Okuryazar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Area: Learning */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-finsim-primary" /> Öğrenme Alanı
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Course Card 1 */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
              <div className="h-32 bg-slate-800 relative flex items-center justify-center group cursor-pointer">
                <PlayCircle className="w-12 h-12 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
              </div>
              <div className="p-5">
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md">Bölüm 1</span>
                <h3 className="font-bold text-slate-900 mt-3 mb-1">Borsaya Giriş 101</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">Hisse senedi nedir? Piyasalar nasıl işler? Temel kavramları öğrenin.</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-400">12 Dk Video</span>
                  <span className="font-bold text-purple-600">Tamamlandı ✓</span>
                </div>
              </div>
            </div>

            {/* Course Card 2 */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
              <div className="h-32 bg-slate-800 relative flex items-center justify-center group cursor-pointer">
                <div className="absolute inset-0 bg-gradient-to-tr from-finsim-primary/80 to-blue-900/80"></div>
                <PlayCircle className="w-12 h-12 text-white/80 group-hover:text-white group-hover:scale-110 transition-all relative z-10" />
              </div>
              <div className="p-5">
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Bölüm 2</span>
                <h3 className="font-bold text-slate-900 mt-3 mb-1">Temel Analiz</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">Şirket bilançoları ve finansal raporlar nasıl okunur? Değer yatırımı nedir?</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-400">18 Dk Video</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{width: '30%'}}></div>
                    </div>
                    <span className="font-bold text-slate-600">%30</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Area: Market Overview */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-finsim-primary" /> Piyasa Özeti
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            {WATCHLIST.map((item) => (
              <PriceRow key={item.ticker} ticker={item.ticker} label={item.label} />
            ))}
            <button className="block w-full text-center py-3 mt-4 text-sm font-semibold text-finsim-primary bg-blue-50 hover:bg-blue-100 rounded-xl transition">
              Tüm Piyasayı Gör
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
