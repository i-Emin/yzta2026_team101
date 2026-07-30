import logging
from typing import Annotated

import asyncpg
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

import db_pg as db_ops
from db_pg import get_database
from auth import CurrentUser
from models import PortfolioItem, TransactionCreate, TransactionResponse
from api._cache import ttl_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["Simülasyon"])

DatabaseDep = Annotated[asyncpg.Pool, Depends(get_database)]


class ProviderError(RuntimeError):
    """Yukarı akış sağlayıcısı (Yahoo Finance) isteği karşılayamadı.

    Sembolün gerçekten bulunamamasından ayrı tutuluyor: biri geçici bir dış
    servis sorunu (502), diğeri istemcinin geçersiz girdisi (404).
    """


@ttl_cache(seconds=60)
def fetch_stock_data(symbol: str) -> dict:
    """
    yfinance kullanarak senkron olarak hisse verisi çeker.
    run_in_threadpool ile asenkron çağrılmalıdır.

    Sonuç 60 saniye önbelleklenir: Yahoo bulut IP'lerini hız sınırına alıyor,
    aynı sembole tekrar tekrar gitmek sınıra takılma olasılığını artırıyor.
    """
    ticker = yf.Ticker(symbol)

    # history() ÖNCE çağrılıyor. Eskiden ilk çağrı ticker.info'ydu ve aynı try
    # bloğunun içindeydi: .info Yahoo'nun sayfasını kazıdığı için bulut
    # IP'lerinde YFRateLimitError fırlatıyor, bu da history() satırına hiç
    # sıra gelmeden tüm isteği düşürüyordu. Oysa chart API'sini kullanan
    # history() aynı anda çalışmaya devam ediyor.
    try:
        hist = ticker.history(period="1mo")
    except Exception as exc:
        logger.error(
            "history() başarısız: %s -> %s: %s", symbol, type(exc).__name__, exc
        )
        raise ProviderError(
            f"'{symbol}' verisi alınamadı: {type(exc).__name__}: {exc}"
        ) from exc

    if hist.empty:
        raise ValueError(f"'{symbol}' için geçmiş veri bulunamadı.")

    hist = hist.dropna(subset=["Close", "Open", "High", "Low"])
    if hist.empty:
        raise ValueError(f"'{symbol}' için geçerli fiyat satırı bulunamadı.")

    # .info yalnızca anlık fiyatı iyileştirmek için; başarısızlığı akışı bozmamalı.
    current_price = None
    try:
        info = ticker.info
        current_price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
        )
    except Exception as exc:
        logger.warning(
            ".info başarısız (kritik değil, son kapanışa düşülüyor): %s -> %s: %s",
            symbol, type(exc).__name__, exc,
        )

    if not current_price:
        current_price = hist["Close"].iloc[-1]

    history_data = []
    for date, row in hist.iterrows():
        history_data.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]),
        })

    return {
        "symbol": symbol.upper(),
        "current_price": float(current_price),
        "history": history_data,
    }


@router.get("/stocks/{symbol}", summary="Hisse Fiyatı ve 1 Aylık Geçmiş")
async def get_stock_data(symbol: str):
    """
    yfinance üzerinden anlık fiyatı ve son 1 aylık OHLCV geçmişini döner.
    """
    try:
        return await run_in_threadpool(fetch_stock_data, symbol)
    except ProviderError as e:
        # Yahoo geçici olarak veri vermiyor (çoğunlukla hız sınırı). Sebep
        # detail'de taşınıyor, teşhis için sunucu logu okumak gerekmiyor.
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        # Sembol gerçekten bulunamadı: istemci girdisi hatalı.
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/transactions/", response_model=dict, summary="Hisse Al/Sat İşlemi")
async def process_transaction(
    body: TransactionCreate, 
    db: DatabaseDep, 
    current_user: CurrentUser
):
    """
    Kullanıcının sanal bakiyesi veya portföyündeki hisse adedine göre Al/Sat işlemini onaylar ve kaydeder.
    """
    try:
        tx_id = await db_ops.create_transaction(db, current_user["id"], body)
        await db_ops.add_xp_to_user(db, current_user["id"], 25)
        return {"message": "İşlem başarılı", "transaction_id": tx_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"process_transaction error: {e}")
        raise HTTPException(status_code=500, detail="İşlem kaydedilirken bir hata oluştu.")


@router.get("/portfolio/me", response_model=list[PortfolioItem], summary="Kullanıcı Portföy Özeti")
async def get_my_portfolio(db: DatabaseDep, current_user: CurrentUser):
    """
    Kullanıcının mevcut hisse senedi varlıklarını döner.
    """
    try:
        portfolio = await db_ops.get_user_portfolio(db, current_user["id"])
        return portfolio
    except Exception as e:
        logger.error(f"get_my_portfolio error: {e}")
        raise HTTPException(status_code=500, detail="Portföy getirilirken bir hata oluştu.")
