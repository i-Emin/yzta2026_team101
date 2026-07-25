import logging
from typing import Annotated

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

import database as db_ops
from database import get_database
from auth import CurrentUser
from models import PortfolioItem, TransactionCreate, TransactionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["Simülasyon"])

DatabaseDep = Annotated[AsyncIOMotorDatabase, Depends(get_database)]


def fetch_stock_data(symbol: str) -> dict:
    """
    yfinance kullanarak senkron olarak hisse verisi çeker.
    run_in_threadpool ile asenkron çağrılmalıdır.
    """
    try:
        ticker = yf.Ticker(symbol)
        
        # Anlık fiyat için info, eğer yoksa son kapanışı alalım
        info = ticker.info
        current_price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
        
        # Son 1 aylık geçmiş veri
        hist = ticker.history(period="1mo")
        if hist.empty:
            raise ValueError("Geçmiş veri bulunamadı.")
            
        hist = hist.dropna(subset=["Close", "Open", "High", "Low"])
            
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
    except Exception as e:
        logger.error(f"fetch_stock_data error: {e}")
        raise ValueError(f"'{symbol}' için veri çekilemedi.")


@router.get("/stocks/{symbol}", summary="Hisse Fiyatı ve 1 Aylık Geçmiş")
async def get_stock_data(symbol: str):
    """
    yfinance üzerinden anlık fiyatı ve son 1 aylık OHLCV geçmişini döner.
    """
    try:
        data = await run_in_threadpool(fetch_stock_data, symbol)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Sunucu hatası: " + str(e))


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
