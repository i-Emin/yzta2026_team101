import { useState, useEffect } from "react";
import { Search, TrendingUp, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight, Wallet, PieChart } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { getStockData, createTransaction, getPortfolio, getMe } from "../services/api";

const POPULAR_STOCKS = [
  { ticker: "THYAO.IS", name: "Türk Hava Yolları" },
  { ticker: "GARAN.IS", name: "Garanti Bankası" },
  { ticker: "AKBNK.IS", name: "Akbank" },
  { ticker: "KCHOL.IS", name: "Koç Holding" },
  { ticker: "ASELS.IS", name: "Aselsan" },
  { ticker: "BIMAS.IS", name: "BİM" },
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "NVDA", name: "Nvidia" }
];

export default function Simulation() {
  const [symbol, setSymbol] = useState("");
  const [activeSymbol, setActiveSymbol] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState(null);

  const [quantity, setQuantity] = useState(1);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState(null);

  const [portfolio, setPortfolio] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  // Sayfa yüklendiğinde portföy ve bakiye çek
  const fetchUserData = async () => {
    setLoadingPortfolio(true);
    try {
      const user = await getMe();
      setBalance(user.virtual_balance ?? 0);
      const port = await getPortfolio();
      setPortfolio(port);
    } catch (err) {
      console.error("Portföy yüklenirken hata:", err);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const performSearch = async (searchSymbol) => {
    if (!searchSymbol) return;

    setErrorSearch(null);
    setLoadingSearch(true);
    setStockData(null);
    setActiveSymbol(null);

    try {
      const data = await getStockData(searchSymbol.toUpperCase());
      setStockData(data);
      setActiveSymbol(data.symbol);
    } catch (err) {
      setErrorSearch(err.message);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    performSearch(symbol.trim());
  };

  const handleQuickSelect = (ticker) => {
    setSymbol(ticker);
    performSearch(ticker);
  };

  const handleTransaction = async (type) => {
    if (!activeSymbol || !stockData || quantity <= 0) return;

    setTxError(null);
    setLoadingTx(true);

    try {
      await createTransaction({
        symbol: activeSymbol,
        type: type,
        quantity: parseInt(quantity, 10),
        price: stockData.current_price,
      });

      // İşlem başarılı, portföyü ve bakiyeyi güncelle
      await fetchUserData();
    } catch (err) {
      setTxError(err.message);
    } finally {
      setLoadingTx(false);
    }
  };

  const formatMoney = (val) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val);

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      
      {/* Sol Panel: Arama, Grafik, İşlem */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto border-r border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Borsa Simülasyonu</h1>
        <p className="text-sm text-slate-500 mb-6">Risksiz ortamda alım-satım stratejilerinizi test edin.</p>

        {/* Arama Çubuğu */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Hisse sembolü girin (Örn: AAPL, TSLA, THYAO.IS)"
              className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-finsim-primary shadow-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loadingSearch || !symbol.trim()}
            className="bg-finsim-primary hover:bg-finsim-primaryDark text-white px-6 rounded-xl font-medium transition disabled:opacity-70 flex items-center gap-2"
          >
            {loadingSearch ? <Loader2 className="w-5 h-5 animate-spin" /> : "Ara"}
          </button>
        </form>

        {/* Hızlı Seçim Butonları */}
        <div className="mb-6">
          <span className="text-xs font-medium text-slate-400 mb-2 block">Popüler Hisseler:</span>
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-slate-200">
            {POPULAR_STOCKS.map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => handleQuickSelect(stock.ticker)}
                className="flex-shrink-0 flex flex-col items-start bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition shadow-sm min-w-[140px]"
              >
                <span className="text-sm font-bold text-slate-800">{stock.ticker}</span>
                <span className="text-xs text-slate-500 truncate w-full text-left">{stock.name}</span>
              </button>
            ))}
          </div>
        </div>

        {errorSearch && (
          <div className="flex items-center gap-2 bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorSearch}</span>
          </div>
        )}

        {/* Hisse Verisi ve İşlem Paneli */}
        {stockData && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-slate-900">{stockData.symbol}</h2>
                <p className="text-sm text-slate-500 mt-1">Anlık Fiyat: <span className="font-semibold text-slate-900">${stockData.current_price.toFixed(2)}</span></p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-finsim-primary" />
              </div>
            </div>

            {/* Grafik */}
            <div className="h-64 w-full mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockData.history}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#94a3b8" minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} stroke="#94a3b8" width={60} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val) => [`$${val.toFixed(2)}`, "Fiyat"]}
                    labelFormatter={(label) => `Tarih: ${label}`}
                  />
                  <Line type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* İşlem Kontrolleri */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">İşlem Yap</h3>
              
              {txError && (
                <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{txError}</span>
                </div>
              )}

              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Miktar (Adet)</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-finsim-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Toplam Tutar</label>
                  <div className="w-full bg-slate-200/50 border border-transparent rounded-lg py-2.5 px-3 text-slate-700 font-medium">
                    ${(quantity * stockData.current_price).toFixed(2)}
                  </div>
                </div>
                
                <button
                  onClick={() => handleTransaction("BUY")}
                  disabled={loadingTx}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg py-2.5 px-4 transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {loadingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUpRight className="w-4 h-4"/> Al</>}
                </button>
                <button
                  onClick={() => handleTransaction("SELL")}
                  disabled={loadingTx}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg py-2.5 px-4 transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {loadingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowDownRight className="w-4 h-4"/> Sat</>}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Sağ Panel: Bakiye ve Portföy */}
      <div className="w-80 bg-white p-6 flex flex-col h-full border-l border-slate-200">
        
        {/* Sanal Bakiye Kartı */}
        <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg mb-8 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-sm font-medium text-slate-300">Sanal Bakiye</h3>
            <Wallet className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-3xl font-bold tracking-tight relative z-10">
            {formatMoney(balance)}
          </p>
        </div>

        {/* Portföy Özeti */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-finsim-primary" />
              Portföy Özeti
            </h3>
            {loadingPortfolio && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {!loadingPortfolio && portfolio.length === 0 ? (
              <div className="text-center text-slate-500 text-sm mt-10">
                Portföyünüz boş. <br/> Bir hisse arayıp işlem yapın.
              </div>
            ) : (
              portfolio.map((item) => (
                <div key={item.symbol} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between hover:bg-slate-100 transition">
                  <div>
                    <h4 className="font-bold text-slate-800">{item.symbol}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{item.quantity} Adet</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">Ort: ${item.average_cost.toFixed(2)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Top: ${(item.quantity * item.average_cost).toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
