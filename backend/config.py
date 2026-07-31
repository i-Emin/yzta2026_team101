import logging
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

logger = logging.getLogger(__name__)


def _clean(name: str, default: str = "") -> str:
    """Ortam değişkenini okur ve yapıştırma kazalarını temizler.

    Barındırma panellerine değer yapıştırırken iki hata sık yapılıyor ve
    ikisi de dışarıdan görünmüyor — sunucu yalnızca "geçersiz anahtar" der:

      * baş/sonda boşluk veya satır sonu
      * .env satırının tamamının kopyalanması:  ANAHTAR="değer"

    Hiçbir API anahtarı tırnakla başlayıp bitmediği ve kendi değişken adını
    içermediği için bunları temizlemek güvenli. Temizlik yapıldığında uyarı
    loglanıyor, yani sorun sessizce gizlenmiyor.
    """
    raw = os.getenv(name, default)
    if not raw:
        return raw

    value = raw.strip()

    # ANAHTAR=... veya ANAHTAR="..." biçiminde yapıştırılmışsa adı at
    prefix = f"{name}="
    if value.startswith(prefix):
        value = value[len(prefix):].strip()

    # Sarmalayan tırnakları at
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1].strip()

    if value != raw:
        logger.warning(
            "%s değerinde fazladan karakter bulundu ve temizlendi "
            "(boşluk/tırnak/değişken adı). Panelde yalnızca değerin kendisi olmalı.",
            name,
        )
    return value


def fingerprint(value: str) -> str:
    """Sırrı açığa çıkarmadan tanımlanmasını sağlar: uzunluk + baş/son birkaç karakter."""
    if not value:
        return "TANIMSIZ"
    if len(value) <= 12:
        return f"{len(value)} karakter (çok kısa)"
    return f"{len(value)} karakter, {value[:4]}…{value[-4:]}"


MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "Fin101DB")

# Supabase / Postgres — Session pooler bağlantı dizesi.
# Örn: postgresql://postgres.<ref>:<parola>@aws-1-<region>.pooler.supabase.com:5432/postgres
DATABASE_URL: str = _clean("DATABASE_URL")

GEMINI_API_KEY: str = _clean("GEMINI_API_KEY")
FINNHUB_API_KEY: str = _clean("FINNHUB_API_KEY")
ALPHA_VANTAGE_API_KEY: str = _clean("ALPHA_VANTAGE_API_KEY")
NEWSAPI_KEY: str = _clean("NEWSAPI_KEY")
TELEGRAM_BOT_TOKEN: str = _clean("TELEGRAM_BOT_TOKEN")

# Model adları ortam değişkeninden okunuyor: Google modelleri emekliye
# ayırıyor ve yeni projelere bazı eski modelleri hiç açmıyor
# ("no longer available to new users"). Sabit isim, her emeklilikte kod
# değişikliği + deploy gerektiriyordu; artık panelden değiştirilebiliyor.
#
# Varsayılan bilinçli olarak "-latest" takma adı: Google'ın güncel Flash
# sürümüne işaret ediyor, sürüm emekliye ayrıldığında kendiliğinden kayıyor.
GEMINI_MODEL: str = _clean("GEMINI_MODEL") or "gemini-flash-latest"
GEMINI_EMBEDDING_MODEL: str = (
    _clean("GEMINI_EMBEDDING_MODEL") or "models/gemini-embedding-001"
)

# RAG parça boyutu. Gemini ücretsiz katmanı dakikada 100 embedding isteği
# veriyor ve indeksleme parça başına bir istek atıyor; parça sayısı bu
# sınırın altında kalmalı, aksi halde ilk indeksleme 429 ile düşüyor.
# rag_data/ (~173 bin karakter) bu değerlerle ~58 parça üretiyor.
RAG_CHUNK_SIZE: int = int(_clean("RAG_CHUNK_SIZE") or "4000")
RAG_CHUNK_OVERLAP: int = int(_clean("RAG_CHUNK_OVERLAP") or "400")

# Parçalar tek seferde değil gruplar hâlinde yazılıyor: kotaya takılırsa
# tüm indeksleme yerine yalnızca o grup başarısız olur.
RAG_EMBED_BATCH: int = int(_clean("RAG_EMBED_BATCH") or "50")

# "production" olduğunda eksik/güvensiz yapılandırma sessizce tolere edilmez.
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION: bool = ENVIRONMENT == "production"

# Varsayılan YOK: auth.py üretimde boşsa açılışta hata verir, geliştirmede
# rastgele bir anahtar üretip uyarır. Sabit bir "changeme" değeri, deploy
# sırasında unutulduğunda token'ların tahmin edilebilir bir anahtarla
# imzalanmasına yol açıyordu.
JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")

# Virgülle ayrılmış origin listesi. Deploy'da frontend adresini eklemek için
# ALLOWED_ORIGINS=https://fin101.vercel.app şeklinde tanımlayın.
ALLOWED_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

# Vercel her deploy için ayrıca hash'li bir önizleme adresi üretiyor
# (proje-a1b2c3-takim.vercel.app) ve bu adres her push'ta değişiyor, yani
# ALLOWED_ORIGINS listesine elle yazılamıyor. Kalıp, tam liste eşleşmesi
# başarısız olduğunda devreye giriyor: ikisinden biri tutarsa CORS geçer.
# Kapatmak için ALLOWED_ORIGIN_REGEX="" tanımlanması yeterli.
ALLOWED_ORIGIN_REGEX: str = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"https://[a-z0-9-]+\.vercel\.app",
)
