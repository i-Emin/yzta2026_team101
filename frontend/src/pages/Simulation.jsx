import { useState, useEffect, useMemo } from "react";
import { Search, TrendingUp, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight, Wallet, PieChart, Briefcase, Award, TrendingDown } from "lucide-react";
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

const getCompanyName = (sym) => {
  const stock = POPULAR_STOCKS.find(s => s.ticker === sym);
  return stock ? stock.name : "Hisse Senedi";
};

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

  const portfolioValue = useMemo(() => {
    return portfolio.reduce((acc, item) => acc + (item.quantity * item.average_cost), 0);
  }, [portfolio]);

  const totalValue = balance + portfolioValue;
  const initialValue = 10000;
  const profitLoss = totalValue - initialValue;
  const isProfit = profitLoss >= 0;

  return (
    <div className="flex-1 overflow-y-auto p-8 pb-20 max-w-7xl mx-auto w-full min-h-screen">
      
      {/* Header & Mission */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Borsa Simülasyonu</h1>
          <p className="text-slate-500 mt-1">Pratik yapın, risk almadan öğrenin</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Bugünün Görevi</p>
            <p className="text-sm font-semibold text-slate-800">İlk hisse senedi işlemini yap</p>
          </div>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <p className="font-semibold text-slate-500">Sanal Bakiye</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatMoney(balance)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="font-semibold text-slate-500">Portföy Değeri</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatMoney(portfolioValue)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isProfit ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {isProfit ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <p className="font-semibold text-slate-500">Toplam Kâr / Zarar</p>
          </div>
          <p className={`text-3xl font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
            {isProfit ? "+" : ""}{formatMoney(profitLoss)}
          </p>
        </div>
      </div>

      {/* Main Screen Layout (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Market Screen */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Piyasa Ekranı</h2>
            
            <form onSubmit={handleSearch} className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="Hisse sembolü girin (Örn: AAPL, THYAO.IS)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:bg-white transition"
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

            <div className="mb-6">
              <span className="text-xs font-semibold text-slate-400 uppercase mb-3 block">Hızlı Seçim</span>
              <div className="flex gap-2 flex-wrap">
                {POPULAR_STOCKS.slice(0, 8).map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => handleQuickSelect(stock.ticker)}
                    className="flex flex-col items-start gap-0.5 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition"
                  >
                    <span className="font-bold text-slate-700 text-sm">{stock.ticker}</span>
                    <span className="text-xs text-slate-500">{stock.name}</span>
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

            {stockData && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">{stockData.symbol}</h3>
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                      Anlık Fiyat: <span className="font-bold text-slate-900 text-lg">${stockData.current_price.toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-sm font-bold rounded-lg border border-emerald-100">
                    Açık
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stockData.history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} stroke="#cbd5e1" minTickGap={30} />
                      <YAxis domain={['auto', 'auto']} tick={{fontSize: 12, fill: '#64748b'}} stroke="#cbd5e1" width={60} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(val) => [`$${val.toFixed(2)}`, "Fiyat"]}
                        labelFormatter={(label) => `Tarih: ${label}`}
                      />
                      <Line type="monotone" dataKey="close" stroke="#0ea5e9" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Trade Form & Portfolio */}
        <div className="space-y-6">
          
          {/* Trade Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">İşlem Yap</h2>
            
            {!stockData ? (
              <div className="text-center py-8 text-slate-400">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">İşlem yapmak için önce bir hisse arayın.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {txError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{txError}</span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Hisse</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 flex flex-col">
                    <div className="font-bold text-slate-800">
                      {stockData.symbol} <span className="text-slate-400 font-medium ml-2">(${stockData.current_price.toFixed(2)})</span>
                    </div>
                    <span className="text-xs text-slate-500">{getCompanyName(stockData.symbol)}</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Miktar (Adet)</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-finsim-primary"
                  />
                </div>

                <div className="pt-2">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-semibold text-slate-500">Toplam Tutar</span>
                    <span className="text-xl font-bold text-slate-900">${(quantity * stockData.current_price).toFixed(2)}</span>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleTransaction("BUY")}
                      disabled={loadingTx}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl py-3.5 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
                    >
                      {loadingTx ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowUpRight className="w-5 h-5"/> Satın Al</>}
                    </button>
                    <button
                      onClick={() => handleTransaction("SELL")}
                      disabled={loadingTx}
                      className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl py-3.5 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
                    >
                      {loadingTx ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowDownRight className="w-5 h-5"/> Sat</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current Portfolio */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-finsim-primary" /> Mevcut Portföyüm
              </h2>
              {loadingPortfolio && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
              {!loadingPortfolio && portfolio.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-6">
                  Portföyünüz boş. <br/> Bir hisse arayıp işlem yapın.
                </div>
              ) : (
                portfolio.map((item) => (
                  <div key={item.symbol} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between hover:bg-slate-100 transition">
                    <div>
                      <h4 className="font-bold text-slate-800">{item.symbol}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{getCompanyName(item.symbol)}</p>
                      <p className="text-xs font-medium text-slate-400 mt-1">{item.quantity} Adet</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-700">${item.average_cost.toFixed(2)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Top: ${(item.quantity * item.average_cost).toFixed(2)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
