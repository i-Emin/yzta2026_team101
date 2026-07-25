import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, PieChart as PieChartIcon } from "lucide-react";
import { getMarketPrice, getPortfolio } from "../services/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const WATCHLIST = [
  { ticker: "XU100.IS", label: "BIST 100" },
  { ticker: "THYAO.IS", label: "Türk Hava Yolları" },
  { ticker: "GARAN.IS", label: "Garanti Bankası" },
  { ticker: "AAPL",     label: "Apple" },
];

function PriceCard({ ticker, label }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMarketPrice(ticker)
      .then(setData)
      .catch(() => setError("Veri alınamadı"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const change = data?.price && data?.previous_close
    ? ((data.price - data.previous_close) / data.previous_close) * 100
    : null;
  const isUp = change !== null && change >= 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{ticker}</span>
        {!loading && !error && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
            {change !== null ? `${isUp ? "+" : ""}${change.toFixed(2)}%` : "—"}
          </span>
        )}
      </div>

      <p className="font-semibold text-slate-800 text-sm">{label}</p>

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Yükleniyor…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-1.5 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && data && (
        <div className="flex items-center gap-2 mt-1">
          {isUp
            ? <TrendingUp className="w-4 h-4 text-emerald-500" />
            : <TrendingDown className="w-4 h-4 text-red-500" />
          }
          <span className={`text-xl font-bold ${isUp ? "text-emerald-600" : "text-red-500"}`}>
            {data.price != null ? data.price.toFixed(2) : "—"}
          </span>
          <span className="text-xs text-slate-400">{data.currency ?? ""}</span>
        </div>
      )}
    </div>
  );
}

const COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#64748b'];

function PortfolioSummary() {
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPortfolio()
      .then(setPortfolio)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 bg-white rounded-2xl border border-slate-200">
        <RefreshCw className="w-6 h-6 animate-spin text-finsim-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 bg-white rounded-2xl border border-slate-200 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (portfolio.length === 0) {
    return (
      <div className="p-10 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <PieChartIcon className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Henüz portföyünüzde hisse bulunmuyor</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Simülasyon sayfasından ilk işleminizi yaparak piyasaları keşfetmeye başlayın ve sanal bakiyenizi değerlendirin!
        </p>
      </div>
    );
  }

  const chartData = portfolio.map((item) => ({
    name: item.symbol,
    value: item.quantity * item.average_cost,
    quantity: item.quantity,
    cost: item.average_cost
  })).sort((a, b) => b.value - a.value);

  const totalValue = chartData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Portföy Dağılımı</h3>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase font-semibold">Toplam Yatırım Maliyeti</p>
          <p className="text-2xl font-bold text-finsim-primary">{totalValue.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row items-center gap-8">
        <div className="w-full md:w-1/2 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="w-full md:w-1/2">
          <div className="space-y-3">
            {chartData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.quantity} adet</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-700 text-sm">{item.value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p>
                  <p className="text-xs text-slate-400">% {((item.value / totalValue) * 100).toFixed(1)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardMock() {
  return (
    <div className="p-10 max-w-5xl mx-auto pb-20">
      <h1 className="text-3xl font-bold text-slate-900">Merhaba, hoş geldin 👋</h1>
      <p className="text-slate-500 mt-1">Piyasaları keşfetmeye ve öğrenmeye hazır mısın?</p>

      <h2 className="text-lg font-semibold text-slate-700 mt-10 mb-4">Anlık Piyasa Verileri</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {WATCHLIST.map((item) => (
          <PriceCard key={item.ticker} ticker={item.ticker} label={item.label} />
        ))}
      </div>

      <h2 className="text-lg font-semibold text-slate-700 mt-12 mb-4">Portföy Durumu</h2>
      <PortfolioSummary />
    </div>
  );
}
