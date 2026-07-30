import os
import logging
from datetime import datetime
import asyncio
from typing import Optional

import asyncpg
import httpx
import yfinance as yf
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi.concurrency import run_in_threadpool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from db_pg import get_user_portfolio, get_users_for_briefing
from config import GEMINI_API_KEY, TELEGRAM_BOT_TOKEN as _BOT_TOKEN

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = _BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN", "")

scheduler = AsyncIOScheduler()
_db: Optional[asyncpg.Pool] = None

MARKET_INDICES = {
    "BIST 100": "XU100.IS",
    "S&P 500":  "^GSPC",
    "NASDAQ":   "^IXIC",
}


def _fetch_price_data(symbols: list[str]) -> dict:
    """
    Verilen semboller için güncel fiyat ve günlük değişim yüzdesini yfinance ile çeker.
    Senkron; run_in_threadpool ile çağrılmalıdır.
    """
    result = {}
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="5d").dropna(subset=["Close"])
            if len(hist) >= 2:
                prev_close = hist["Close"].iloc[-2]
                last_close = hist["Close"].iloc[-1]
                change_pct = ((last_close - prev_close) / prev_close) * 100
                result[sym] = {
                    "price": round(float(last_close), 2),
                    "change_pct": round(float(change_pct), 2),
                }
            elif len(hist) == 1:
                last_close = hist["Close"].iloc[-1]
                result[sym] = {"price": round(float(last_close), 2), "change_pct": None}
            else:
                logger.warning(f"Yeterli veri yok ({sym}): {len(hist)} satır")
        except Exception as e:
            logger.warning(f"Fiyat çekilemedi ({sym}): {e}")
    return result


async def send_telegram_message(chat_id: str, text: str):
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN bulunamadı. Mesaj gönderilemedi.")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)
            if response.status_code != 200:
                logger.error(f"Telegram hatası {response.status_code}: {response.text}")
            else:
                logger.info(f"Telegram mesajı gönderildi: {chat_id}")
    except Exception as e:
        logger.error(f"Telegram API isteği hatası: {e}")


async def generate_morning_briefing(user: dict, portfolio: list) -> str:
    try:
        portfolio_symbols = [p["symbol"] for p in portfolio] if portfolio else []
        index_symbols = list(MARKET_INDICES.values())
        all_symbols = list(set(portfolio_symbols + index_symbols))

        price_data: dict = await run_in_threadpool(_fetch_price_data, all_symbols)

        index_lines = []
        for name, sym in MARKET_INDICES.items():
            d = price_data.get(sym)
            if d:
                chg = f"{d['change_pct']:+.2f}%" if d["change_pct"] is not None else "veri yok"
                index_lines.append(f"• {name}: {d['price']} ({chg})")

        portfolio_lines = []
        for p in portfolio:
            sym = p["symbol"]
            qty = p["quantity"]
            avg = p.get("average_cost", 0)
            d = price_data.get(sym)
            if d:
                chg = f"{d['change_pct']:+.2f}%" if d["change_pct"] is not None else "veri yok"
                pnl = (d["price"] - avg) * qty if avg else None
                pnl_str = f", K/Z: {pnl:+.2f} TL" if pnl is not None else ""
                portfolio_lines.append(
                    f"• {sym}: {d['price']} ({chg}), {qty} adet{pnl_str}"
                )
            else:
                portfolio_lines.append(f"• {sym}: fiyat alınamadı, {qty} adet")

        market_block = "\n".join(index_lines) if index_lines else "Endeks verisi alınamadı."
        portfolio_block = "\n".join(portfolio_lines) if portfolio_lines else "Portföyde hisse yok."
        interests_str = ", ".join(user.get("interests", [])) or "Genel Piyasa"

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0.5,
        )

        sys_msg = SystemMessage(content=(
            "Sen Fin101'in yapay zeka finans asistanısın. "
            "Kullanıcıya her sabah somut, sayısal ve teknik veriye dayalı kişiselleştirilmiş bir borsa özeti (Morning Briefing) sunuyorsun. "
            "ASLA genel geçer laflar etme, 'piyasalar genelde dalgalıdır' gibi belirsiz cümleler kurma. "
            "Portföydeki varlıkların GÜNCEL fiyat değişimlerine, endekslerin durumuna ve kullanıcının risk profiline dayanarak "
            "somut ve teknik bir yorum yap. "
            "Mesajı Telegram'da okunmaya uygun Markdown formatında, maksimum 200 kelimede tut. "
            "Yatırım tavsiyesi verme; eğitim ve farkındalık odaklı ol."
        ))

        user_prompt = (
            f"📊 *Sabah Bülteni — {datetime.now().strftime('%d.%m.%Y')}*\n\n"
            f"Kullanıcı: {user.get('name')} | Risk Profili: {user.get('risk_profile')} | İlgi: {interests_str}\n\n"
            f"*Piyasa Endeksleri (güncel):*\n{market_block}\n\n"
            f"*Portföy (güncel):*\n{portfolio_block}\n\n"
            "Yukarıdaki GERÇEK ve GÜNCEL verilere dayanarak bu kullanıcı için somut, sayısal ve eğitici bir sabah bülteni yaz."
        )

        response = await llm.ainvoke([sys_msg, HumanMessage(content=user_prompt)])
        return response.content

    except Exception as e:
        logger.error(f"Bülten üretilirken hata: {e}")
        return "⚠️ Bülten şu an oluşturulamıyor, piyasa verilerine erişimde sorun yaşandı."


async def briefing_cron_job():
    """
    Zamanlayıcı tarafından tetiklenir. Şu anki saate uyan kullanıcıları bulup bülten gönderir.
    """
    if _db is None:
        logger.error("Veritabanı bağlantısı yok, briefing_cron_job iptal edildi.")
        return

    # Şu anki saati "HH:MM" formatında al (UTC veya yerel saat sunucuya bağlıdır, örnekte sunucu saati)
    now_str = datetime.now().strftime("%H:%M")
    logger.info(f"Briefing Cron Job çalıştı: Zaman = {now_str}")

    try:
        # briefing_time'ı şu anki saat olan ve geçerli telegram_chat_id'si olan
        # kullanıcılar. Eski Mongo filtresinde aynı sözlükte iki kez "$ne"
        # bulunduğu için `$ne: None` sessizce düşüyor ve chat_id'si NULL olan
        # kullanıcılar da bu döngüye giriyordu.
        users = await get_users_for_briefing(_db, now_str)

        if not users:
            logger.info("Bu dakikada bülten gönderilecek kullanıcı bulunamadı.")
            return

        for user in users:
            user_id = user["id"]
            chat_id = user["telegram_chat_id"]
            
            # Portföyü çek
            portfolio = await get_user_portfolio(_db, user_id)
            
            # Bülteni üret
            briefing_text = await generate_morning_briefing(user, portfolio)
            
            # Telegram'a gönder
            await send_telegram_message(chat_id, briefing_text)
            
            # Limit API rate, aralara küçük beklemeler koy
            await asyncio.sleep(1)

    except Exception as e:
        logger.error(f"briefing_cron_job sırasında hata: {e}")


def start_scheduler(db: asyncpg.Pool):
    """
    Zamanlayıcıyı başlatır ve her dakika çalışacak şekilde cron job ekler.
    """
    global _db
    _db = db
    
    # Her dakika kontrol et (kullanıcının ayarladığı "HH:MM" ile eşleşen var mı diye)
    scheduler.add_job(briefing_cron_job, CronTrigger(minute="*"))
    scheduler.start()
    logger.info("Apscheduler başlatıldı.")

def stop_scheduler():
    """
    Zamanlayıcıyı durdurur.
    """
    scheduler.shutdown()
    logger.info("Apscheduler durduruldu.")
