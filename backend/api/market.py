import logging

import yfinance as yf

logger = logging.getLogger(__name__)


def get_stock_history(ticker: str, start: str, end: str) -> list[dict]:
    """
    Belirtilen hisse için tarih aralığındaki günlük OHLCV verisini döner.
    ticker örnekleri: 'THYAO.IS', 'XU100.IS', 'AAPL'
    start/end formatı: 'YYYY-MM-DD'
    """
    logger.info("Borsa verisi çekiliyor: %s (%s -> %s)", ticker, start, end)
    try:
        data = yf.download(ticker, start=start, end=end, progress=False)
    except Exception as exc:
        # Sağlayıcı hatası 500 yerine anlaşılır bir mesaja çevrilsin.
        raise ValueError(
            f"'{ticker}' geçmiş verisi alınamadı: {type(exc).__name__}: {exc}"
        ) from exc

    if data.empty:
        logger.warning("Veri bulunamadı: %s", ticker)
        return []

    data = data.reset_index()
    data.columns = [str(c[0]) if isinstance(c, tuple) else str(c) for c in data.columns]
    return data.to_dict(orient="records")


def get_current_price(ticker: str) -> dict:
    """
    Bir hissenin güncel fiyat bilgisini döner.

    Fiyat öncelikle history() ile alınıyor: bu çağrı Yahoo'nun chart API'sini
    kullanıyor. Eskiden tek kaynak olan .info ise Yahoo'nun sayfasını kazıdığı
    için bulut sunucularının IP'lerinde sık sık boş dönüyor ya da hız sınırına
    takılıyor — üstelik hata yönetimi olmadığı için endpoint'i 500'e düşürüyordu.

    .info artık yalnızca ek alanlar (para birimi) için, başarısız olması
    fiyatı düşürmeyecek şekilde çağrılıyor.
    """
    stock = yf.Ticker(ticker)

    price = None
    previous_close = None
    currency = None
    reason = None

    try:
        hist = stock.history(period="5d", auto_adjust=False)
        closes = hist["Close"].dropna() if not hist.empty else []
        if len(closes) >= 1:
            price = float(closes.iloc[-1])
        if len(closes) >= 2:
            previous_close = float(closes.iloc[-2])
    except Exception as exc:
        reason = f"{type(exc).__name__}: {exc}"
        logger.warning("history() başarısız: %s -> %s", ticker, reason)

    try:
        info = stock.info
        if price is None:
            price = info.get("currentPrice") or info.get("regularMarketPrice")
        if previous_close is None:
            previous_close = info.get("previousClose")
        currency = info.get("currency")
    except Exception as exc:
        logger.warning(
            ".info başarısız (fiyat için kritik değil): %s -> %s: %s",
            ticker, type(exc).__name__, exc,
        )

    if currency is None:
        # BIST sembolleri .IS ile bitiyor; .info alınamadığında makul varsayılan.
        currency = "TRY" if ticker.upper().endswith(".IS") else "USD"

    if price is None:
        # Sebep çağıran katmana taşınıyor: aksi halde tarayıcıda ayırt
        # edilemeyen bir hata görünüyor ve teşhis için log okumak gerekiyor.
        raise ValueError(
            f"'{ticker}' için fiyat alınamadı: "
            + (reason or "Yahoo Finance boş yanıt döndürdü")
        )

    return {
        "ticker": ticker,
        "price": price,
        "currency": currency,
        "previous_close": previous_close,
    }
