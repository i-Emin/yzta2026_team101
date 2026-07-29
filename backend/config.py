import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "Fin101DB")

# Supabase / Postgres — Session pooler bağlantı dizesi.
# Örn: postgresql://postgres.<ref>:<parola>@aws-1-<region>.pooler.supabase.com:5432/postgres
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
FINNHUB_API_KEY: str = os.getenv("FINNHUB_API_KEY", "")
ALPHA_VANTAGE_API_KEY: str = os.getenv("ALPHA_VANTAGE_API_KEY", "")
NEWSAPI_KEY: str = os.getenv("NEWSAPI_KEY", "")
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")

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
