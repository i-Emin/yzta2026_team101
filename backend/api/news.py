import logging

import finnhub

from config import FINNHUB_API_KEY

logger = logging.getLogger(__name__)

_client: finnhub.Client = None


def _get_client() -> finnhub.Client:
    global _client
    if _client is None:
        if not FINNHUB_API_KEY:
            raise ValueError(
                "FINNHUB_API_KEY tanımlı değil. Render → fin101-api → "
                "Environment altında bu değişkeni doldurun (Finnhub panelindeki "
                "20 karakterlik API key)."
            )
        _client = finnhub.Client(api_key=FINNHUB_API_KEY)
        logger.info("Finnhub istemcisi oluşturuldu.")
    return _client


def get_company_news(symbol: str, from_date: str, to_date: str) -> list[dict]:
    """
    Bir şirket için tarih aralığındaki haberleri döner.
    symbol örnekleri: 'AAPL', 'MSFT' (Finnhub Türkçe/BIST sembol desteği sınırlı)
    from_date/to_date formatı: 'YYYY-MM-DD'
    """
    client = _get_client()
    logger.info("Haberler çekiliyor: %s (%s -> %s)", symbol, from_date, to_date)
    try:
        news = client.company_news(symbol, _from=from_date, to=to_date)
    except Exception as exc:
        # Geçersiz anahtar (401) ve kota aşımı (429) buradan geçiyor; sebebi
        # yukarıya taşımak, tarayıcıda ayırt edilemeyen 500 yerine net mesaj
        # görünmesini sağlıyor.
        raise ValueError(
            f"Finnhub haber isteği başarısız: {type(exc).__name__}: {exc}"
        ) from exc
    return news or []


def get_market_news(category: str = "general") -> list[dict]:
    """Genel piyasa haberlerini döner. category: general, forex, crypto, merger"""
    client = _get_client()
    try:
        news = client.general_news(category)
    except Exception as exc:
        raise ValueError(
            f"Finnhub haber isteği başarısız: {type(exc).__name__}: {exc}"
        ) from exc
    return news or []
