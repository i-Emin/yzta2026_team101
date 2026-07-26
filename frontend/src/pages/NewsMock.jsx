import { useEffect, useState } from "react";
import { Newspaper, ExternalLink, RefreshCw, AlertCircle, TrendingUp, Lightbulb, ChevronRight } from "lucide-react";
import { getMarketNews } from "../services/api";

const CATEGORY_LABELS = {
  general: "Genel",
  forex:   "Döviz",
  crypto:  "Kripto",
  merger:  "Birleşmeler",
};

function timeAgo(unixTimestamp) {
  if (!unixTimestamp) return "";
  const diff = Math.floor((Date.now() / 1000) - unixTimestamp);
  if (diff < 60)   return `${diff} sn önce`;
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}

function NewsCard({ article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-finsim-primary transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
          {article.source ?? "Kaynak"}
        </span>
        <span className="text-xs font-medium text-slate-400 shrink-0">{timeAgo(article.datetime)}</span>
      </div>

      <p className="text-base font-bold text-slate-900 leading-snug group-hover:text-finsim-primary transition-colors line-clamp-3">
        {article.headline}
      </p>

      {article.summary && (
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 mt-1">
          {article.summary}
        </p>
      )}

      <div className="flex items-center gap-1 text-xs text-finsim-primary font-bold mt-auto pt-3 border-t border-slate-100">
        <span>Devamını Oku</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </div>
    </a>
  );
}

export default function NewsMock() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [category, setCategory] = useState("general");

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMarketNews(category)
      .then((res) => setArticles(res.articles ?? []))
      .catch(() => setError("Haberler yüklenirken bir hata oluştu."))
      .finally(() => setLoading(false));
  }, [category]);

  const featuredArticle = articles.length > 0 ? articles[0] : null;
  const regularArticles = articles.length > 1 ? articles.slice(1, 13) : [];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Piyasa Haberleri</h1>
          <p className="text-slate-500 mt-1">Piyasaları etkileyen en son gelişmeleri takip edin.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                category === key
                  ? "bg-finsim-primary text-white shadow-md shadow-blue-500/20"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: News List */}
        <div className="lg:col-span-2 space-y-6">
          
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200">
              <RefreshCw className="w-8 h-8 animate-spin text-finsim-primary mb-3" />
              <span className="font-medium text-slate-500">Haberler yükleniyor…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 bg-red-50 rounded-3xl border border-red-100 text-red-500">
              <AlertCircle className="w-8 h-8 mb-3" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {!loading && !error && articles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 text-slate-400">
              <Newspaper className="w-10 h-10 mb-3 opacity-50" />
              <span className="font-medium">Bu kategoride haber bulunamadı.</span>
            </div>
          )}

          {!loading && !error && featuredArticle && (
            <a 
              href={featuredArticle.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative rounded-3xl overflow-hidden group shadow-lg border border-slate-200"
            >
              <div className="h-80 bg-slate-800 relative w-full">
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent z-10"></div>
                {/* Fallback pattern for featured image */}
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              </div>
              
              <div className="absolute bottom-0 left-0 w-full p-8 z-20">
                <div className="flex items-center gap-3 mb-4">
                  <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-lg">Öne Çıkan</span>
                  <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-lg">Ekonomi / Yükseliş</span>
                  <span className="text-white/70 text-xs font-medium flex items-center gap-1">
                    {timeAgo(featuredArticle.datetime)}
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight group-hover:text-blue-300 transition-colors">
                  {featuredArticle.headline}
                </h2>
                <p className="text-white/80 line-clamp-2 md:text-lg">
                  {featuredArticle.summary}
                </p>
              </div>
            </a>
          )}

          {!loading && !error && regularArticles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {regularArticles.map((article, idx) => (
                <NewsCard key={idx} article={article} />
              ))}
            </div>
          )}

        </div>

        {/* Right Column: Educational Assistant & Market Summary */}
        <div className="space-y-6">
          
          {/* AI Educational Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-6 border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Lightbulb className="w-24 h-24 text-blue-500" />
            </div>
            
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Bu haber ne anlama geliyor?</h3>
            </div>
            
            <p className="text-slate-600 text-sm leading-relaxed mb-5 relative z-10">
              Haber başlıkları bazen karmaşık olabilir. Fin101 asistanı sizin için haberleri analiz eder ve piyasaya olan potansiyel etkilerini basitleştirerek açıklar.
            </p>
            
            <button className="w-full bg-white border border-blue-200 text-blue-700 font-bold py-3 px-4 rounded-xl hover:bg-blue-600 hover:text-white transition shadow-sm flex items-center justify-between group relative z-10">
              <span>Haber Analizini Aç</span>
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Small Market Summary */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm sticky top-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-finsim-primary" />
                Kısa Piyasa Özeti
              </h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">BIST 100</p>
                  <p className="text-xs text-slate-500">Türkiye</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">9.120,50</p>
                  <p className="text-xs font-bold text-emerald-600">+1.24%</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">S&P 500</p>
                  <p className="text-xs text-slate-500">ABD</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">5.088,80</p>
                  <p className="text-xs font-bold text-emerald-600">+0.85%</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">USD/TRY</p>
                  <p className="text-xs text-slate-500">Döviz</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">32.15</p>
                  <p className="text-xs font-bold text-red-500">-0.12%</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
