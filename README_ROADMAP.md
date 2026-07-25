# Fin101 — Proje Yol Haritası & Eksik Görevler

> **Son Güncelleme:** 2026-07-15
> **Aktif Dal:** `main`
> **Durum Özeti:** Backend MVP + RAG + Sohbet Hafızası + Temel Frontend tamamlandı. Proje Sprint 3 ile sonlanıyor.

---

## ✅ Tamamlanan Özellikler

### Backend
| Modül | Durum | Açıklama |
|---|---|---|
| FastAPI + Motor | ✅ | Async MongoDB bağlantısı, lifespan yönetimi |
| Pydantic Modelleri | ✅ | `UserCreate`, `UserInDB`, `UserResponse`, `ChatMessage`, `ConversationCreate`, `MessageCreate`, `ChatResponse` |
| `POST /users/` | ✅ | Kullanıcı kaydı, duplicate e-posta koruması |
| `POST /chat/` | ✅ | Hafızalı RAG endpoint'i (`session_id` yönetimi) |
| `GET /market/price/{ticker}` | ✅ | yfinance anlık fiyat |
| `GET /market/history/{ticker}` | ✅ | yfinance tarihsel OHLCV |
| `GET /news/market` | ✅ | Finnhub genel piyasa haberleri |
| `GET /news/company/{symbol}` | ✅ | Finnhub şirket haberleri |
| RAG Pipeline | ✅ | ChromaDB + `all-MiniLM-L6-v2` + Gemini 2.5 Flash |
| Sohbet Hafızası | ✅ | `conversations` + `messages` MongoDB koleksiyonları |
| Sokratik Mentor Ajanı | ✅ | Portföy verisini analiz edecek şekilde guardrails ve prompt esnetildi |
| Telegram Bot | ✅ | Veritabanı (PyMongo) boolean kilitleri çözüldü, Morning Briefing stabil |
| Oyunlaştırma (XP) | ✅ | Backend XP kazanım motoru (Chat & Al/Sat hook'ları) entegre edildi |
| CORS | ✅ | `localhost:3000` ve `localhost:5173` izinli |

### Frontend
| Sayfa / Bileşen | Durum | Açıklama |
|---|---|---|
| Chatbot (`ChatView`) | ✅ | Örnek Soru Baloncukları (Suggestion Pills), Tailwind özel dosya yükleme Tooltip'i |
| Dashboard | ✅ | `Recharts` ile dinamik portföy pasta grafiği entegre edildi |
| Haberler (`NewsMock`) | ✅ | `getMarketNews` ile Finnhub haberleri, kategori filtreleme |
| Profil (`ProfileMock`) | ✅ | Anlık Sidebar senkronizasyonu sağlandı, dinamik seviye (XP) barı eklendi |
| Simülasyon | ✅ | Yatay kaydırılabilir, şirket tam isimli zengin hisse listesi (BIST30/ABD) |
| `api.js` servis katmanı | ✅ | `sendChatMessage`, `getMarketPrice`, `getMarketHistory`, `getMarketNews`, `getCompanyNews` |

---

## 🚀 Sprint 3 — Kalan Kritik Görevler

> Sprint 3, projenin **son ve tamamlayıcı** aşamasıdır. Aşağıdaki görevler projenin çekirdek işlevselliği için zorunludur.

---

### 1. Kimlik Doğrulama Sistemi (JWT Auth)

**Neden kritik:** Şu an tüm endpoint'ler açık; `user_id` sabit `"demo-user"` değeri kullanılıyor. Auth olmadan kullanıcıya özel hiçbir veri gösterilemez.

**Backend:**
- [x] `python-jose` + `passlib[bcrypt]` (veya sadece `bcrypt`) kurulumu ve `requirements.txt`'e eklenmesi
- [x] `models.py`'e `hashed_password` alanı eklenmesi
- [x] `POST /auth/register` — şifreyi hash'leyip `users` koleksiyonuna kayıt
- [x] `POST /auth/login` — kimlik doğrulama + JWT `access_token` üretimi
- [x] FastAPI `Security(oauth2_scheme)` ile `/chat/`, `/users/me` endpoint'lerine token koruması

**Frontend:**
- [x] Login ve Register form sayfaları
- [x] JWT token'ı `localStorage`'da saklama
- [x] `api.js`'teki tüm isteklere `Authorization: Bearer <token>` header'ı eklenmesi
- [x] `sendChatMessage` içindeki `"demo-user"` sabitinin token'dan alınan gerçek `user_id` ile değiştirilmesi
- [x] Oturum açılmamışsa login sayfasına yönlendirme

**Durum:** ✅ **TAMAMLANDI**

---

### 2. Profil Sayfasının MongoDB ile Eşleştirilmesi

**Neden kritik:** `ProfileMock.jsx` tamamen statik veri gösteriyor; Auth tamamlanınca gerçek kullanıcı verisi bağlanmalı.

**Backend:**
- [x] `GET /users/me` endpoint'i (token'dan `user_id` çekerek ilgili belgeyi döndürür)
- [x] `PUT /users/me` endpoint'i (isim, risk_profile, ilgi alanları güncellemesi)

**Frontend:**
- [x] `ProfileMock.jsx`'e `useEffect` + `GET /users/me` çağrısı
- [x] `xp_score`, `level`, `badges`, `risk_profile`, `virtual_balance` alanlarının dinamik gösterimi
- [x] Profil düzenleme formu (isim, risk profili, ilgi alanları)

**Durum:** ✅ **TAMAMLANDI**

---

### 3. Borsa Simülasyonu Sayfasının Aktifleştirilmesi

**Neden kritik:** `SimulationMock.jsx` tamamen boş iskelet; projenin ana öğrenme aracıdır.

**Veri Kaynağı Seçenekleri:**
- Yfinance `getMarketHistory` (dinamik, anlık) — **önerilen**

**Backend:**
- [x] `POST /transactions/` endpoint'i (al/sat işlemi kaydı → `transactions` koleksiyonu)
- [x] `GET /portfolio/me` endpoint'i (kullanıcının portföy özeti → `portfolios` koleksiyonu)
- [x] `models.py`'deki `Transaction` ve `Portfolio` Pydantic şemalarının aktivasyonu
- [x] dairesel import (circular dependency) hatalarının temizlenmesi.

**Frontend:**
- [x] `recharts` veya `chart.js` ile OHLCV mum/çizgi grafik bileşeni
- [x] Hisse arama + seçim arayüzü ve hızlı sembol butonları (Pills)
- [x] Sanal al/sat formu (miktar, fiyat, onay)
- [x] Portföy özeti tablosu (holding, ortalama maliyet, kâr/zarar)
- [x] Dashboard'a portföy özet kartı entegrasyonu

**Durum:** ✅ **TAMAMLANDI**

---

### 4. Telegram Akıllı Bildirim (Morning Briefing)

**Neden kritik:** Kullanıcıyı platforma bağlayan temel iletişim motorudur.
- [x] Backend'de `apscheduler` entegrasyonu.
- [x] Her kullanıcı için yfinance ile anlık portföy durumunun (K/Z) çekilmesi.
- [x] BIST100, S&P500, NASDAQ kapanış verilerinin yfinance ile entegrasyonu (`NaN` veriler temizlendi).
- [x] Gemini Prompt Injection (Risk Profili + İlgi Alanı + Gerçek Fiyatlar).
- [x] Frontend üzerinden Chat ID ve serbest zaman seçimi girişi, anlık "Test Et" butonu.

**Durum:** ✅ **TAMAMLANDI**

---

### 5. Oyunlaştırma (Gamification)

**Neden kritik:** Kullanıcıyı projede tutmak ve öğrenmeyi teşvik etmek için XP ve Seviye sistemi.
- [x] Backend `POST /chat/` rotasında mesaj başına +10 XP eklendi.
- [x] Backend `POST /transactions/` rotasında işlem başına +25 XP eklendi.
- [x] Seviye limitleri (Lvl 1: 0-499, Lvl 2: 500-1199, vb.) dinamik olarak hesaplanacak şekilde `database.py` güncellendi.
- [x] Frontend `ProfileMock.jsx` sayfasında İlerleme Çubuğu (Progress bar) kullanıcının mevcut seviyesine göre dinamik hesaplanır hale getirildi.

**Durum:** ✅ **TAMAMLANDI**

---

## 🗂️ Gelecek Vizyonu (Backlog)

> Aşağıdaki özellikler projenin **çekirdeği için zorunlu değildir** ve herhangi bir sprint'e bağlı değildir. Proje ilerledikçe değerlendirilebilir.

| Özellik | Açıklama |
|---|---|
| **Yatırımcı Meydanı** | Sosyal ağ gönderileri, like/yorum, moderasyon (`investor_square` koleksiyonu) |
| **Rate Limiting** | `slowapi` ile IP başına `/chat/` istek sınırı |
| **Global Hata Yönetimi** | `@app.exception_handler` ile standart hata formatı |
| **Test Coverage** | `pytest` + `httpx` + `pytest-asyncio` |
| **Docker** | `Dockerfile` + `docker-compose.yml` |
| **Deployment** | Railway / Render (backend) + Vercel / Netlify (frontend) |
| **Türkçe Embedding** | `intfloat/multilingual-e5-base` — Türkçe metinlerde daha yüksek kalite |
| **RAG Kaynak Alıntısı** | Asistan yanıtına kaynak PDF chunk bilgisi eklenmesi |
| **Atlas Vector Search** | ChromaDB → MongoDB Atlas Vector Search geçişi (production) |

---

## Ortam Değişkenleri Referansı

### `backend/.env`
```env
MONGO_URI=mongodb+srv://...
DATABASE_NAME=Fin101DB
GEMINI_API_KEY=...
FINNHUB_API_KEY=...
```

### `frontend/.env.local`
```env
VITE_API_URL=http://localhost:8000
```

---

## Geliştirme Ortamını Başlatma

```powershell
# Terminal 1 — Backend (backend/ klasöründe, venv aktifken)
uvicorn main:app --reload

# Terminal 2 — Frontend (frontend/ klasöründe)
npm run dev
```

**Swagger UI:** http://localhost:8000/docs
**Frontend:** http://localhost:5173

---

## Koleksiyon Durumu

| Koleksiyon | Durum | Bağımlılık |
|---|---|---|
| `users` | ✅ Aktif | Kayıt + profil |
| `conversations` | ✅ Aktif | Sohbet oturumları |
| `messages` | ✅ Aktif | Tekil mesajlar |
| `transactions` | ✅ Aktif | Borsa işlemleri |
| `portfolios` | ✅ Aktif (Dinamik) | Portföy özeti (transactions üzerinden hesaplanır) |
| `news_cache` | 🗂️ Backlog | Haber TTL cache |
| `investor_square` | 🗂️ Backlog | Sosyal ağ |
