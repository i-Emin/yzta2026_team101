"""
main.py — Fin101 FastAPI Uygulaması

Veri katmanı Supabase/Postgres (db_pg.py, asyncpg). MongoDB katmanı
database.py içinde duruyor; geri dönmek gerekirse aşağıdaki iki import
satırını `database` olarak değiştirmek yeterli.

Endpoint'ler:
  GET  /            → Sağlık kontrolü
  POST /users/      → Kullanıcı kaydı (şifresiz; asıl kayıt /auth/register)
  POST /chat/       → Sohbet (hafızalı, RAG destekli)
  GET  /users/me    → Profil  ·  PUT /users/me → profil güncelleme
  GET  /market/...  → Piyasa verileri
  GET  /news/...    → Haber verileri

Ayrıca router olarak: /auth/* (auth.py), /stocks /transactions /portfolio
(simulation.py).
"""

from contextlib import asynccontextmanager
import logging
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordBearer

# Supabase/Postgres veri katmanı. MongoDB'ye dönmek gerekirse bu iki satırı
# `import database as db_ops` / `from database import ...` haline getirmek yeterli.
import db_pg as db_ops
from db_pg import connect_db, close_db, get_database
from config import (
    ALLOWED_ORIGINS,
    ALLOWED_ORIGIN_REGEX,
    DATABASE_URL,
    FINNHUB_API_KEY,
    GEMINI_API_KEY,
    GEMINI_EMBEDDING_MODEL,
    GEMINI_MODEL,
    fingerprint,
)
from graph import mentor_graph
from models import (
    ChatMessage,
    ChatResponse,
    ConversationCreate,
    MessageCreate,
    UserCreate,
    UserResponse,
    UserUpdateRequest,
)
from api import market, news
import auth as auth_module
from auth import decode_token, oauth2_scheme, CurrentUser
import telegram_bot

# Logger ayarları
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Uygulama Yaşam Döngüsü
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # CORS hataları dışarıdan "sunucu hiç başlık döndürmedi" olarak görünüyor;
    # etkin değeri loglamak, sorunun ortam değişkeninde mi kodda mı olduğunu
    # log'a bakarak ayırt etmeyi sağlıyor.
    logger.info(
        "CORS izinli origin listesi: %s | kalıp: %s",
        ALLOWED_ORIGINS,
        ALLOWED_ORIGIN_REGEX or "(yok)",
    )

    # Anahtarların parmak izi: değeri açığa çıkarmadan, paneldeki değerin
    # sürece gerçekten ulaşıp ulaşmadığını ve beklenen uzunlukta olup
    # olmadığını gösterir. Ortam değişkeni kaydetmek çalışan süreci
    # değiştirmediği için "kaydettim ama hâlâ eski anahtar" durumu buradan
    # tek bakışta anlaşılıyor.
    logger.info(
        "Anahtarlar → GEMINI: %s | FINNHUB: %s | DATABASE_URL: %s",
        fingerprint(GEMINI_API_KEY),
        fingerprint(FINNHUB_API_KEY),
        "tanımlı" if DATABASE_URL else "TANIMSIZ",
    )
    logger.info(
        "Modeller → sohbet: %s | embedding: %s",
        GEMINI_MODEL,
        GEMINI_EMBEDDING_MODEL,
    )

    # Uygulama başlarken
    logger.info("Postgres bağlantı havuzu kuruluyor...")
    await connect_db()

    # Zamanlayıcıyı başlat
    logger.info("Bildirim zamanlayıcısı başlatılıyor...")
    telegram_bot.start_scheduler(get_database())

    yield
    # Uygulama kapanırken
    logger.info("Bildirim zamanlayıcısı durduruluyor...")
    telegram_bot.stop_scheduler()
    logger.info("Postgres bağlantı havuzu kapatılıyor...")
    await close_db()


# ---------------------------------------------------------------------------
# FastAPI Uygulaması
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Fin101 API",
    description="Finansal okuryazarlık ve yapay zeka mentorluk platformu backend'i.",
    version="0.3.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def catch_unhandled_errors(request: Request, call_next):
    """
    Yakalanmayan istisnaları normal bir 500 yanıtına çevirir.

    Starlette'te yakalanmayan istisna CORS middleware'inin dışında işleniyor,
    yani çıplak 500 yanıtına Access-Control-Allow-Origin başlığı eklenmiyor.
    Tarayıcı da bunu "CORS policy" hatası olarak gösteriyor ve gerçek durum
    kodu istemciye hiç ulaşmıyor — her sunucu hatası CORS sorunu gibi görünüyor.
    Burada yakalamak, yanıtın aşağıdaki CORS katmanından geçmesini sağlıyor.

    NOT: Bu middleware CORS'tan ÖNCE eklenmeli. Starlette son eklenen
    middleware'i en dışa koyuyor; CORS en dışta kalmazsa başlık yine eklenmez.
    """
    try:
        return await call_next(request)
    except Exception:
        logger.exception(
            "Yakalanmayan hata: %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Sunucuda beklenmeyen bir hata oluştu."},
        )


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,          # ALLOWED_ORIGINS ortam değişkeni
    allow_origin_regex=ALLOWED_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_module.router)

import simulation as sim_module
app.include_router(sim_module.router)


# ---------------------------------------------------------------------------
# Dependency Injection — Veritabanı
# ---------------------------------------------------------------------------

def get_db() -> asyncpg.Pool:
    return get_database()


DatabaseDep = Annotated[asyncpg.Pool, Depends(get_db)]


# ===========================================================================
# ENDPOINT'LER
# ===========================================================================


@app.get("/", tags=["Sistem"])
async def root():
    """Sağlık kontrolü — API'nin ayakta olduğunu doğrular."""
    return {"status": "ok", "message": "Fin101 API is running.", "version": "0.3.0"}


# ---------------------------------------------------------------------------
# POST /users/ — Kullanıcı Kaydı
# ---------------------------------------------------------------------------

@app.post(
    "/users/",
    response_model=UserResponse,
    status_code=201,
    tags=["Kullanıcılar"],
    summary="Yeni kullanıcı oluştur",
)
async def create_user_endpoint(user: UserCreate, db: DatabaseDep):
    """
    Yeni bir kullanıcı kaydeder.

    - **name**: Kullanıcı adı soyadı
    - **email**: Benzersiz e-posta adresi (duplicate → 400)
    - **risk_profile**: Düşük / Orta / Yüksek (varsayılan: Orta)
    - **virtual_balance**: Başlangıç sanal bakiye (varsayılan: 10000.0)
    """
    try:
        inserted_id = await db_ops.create_user(db, user)
    except ValueError as exc:
        # create_user duplicate e-posta için ValueError fırlatır
        raise HTTPException(status_code=400, detail=str(exc))

    # Kaydedilen belgeyi geri çekip UserResponse ile döndür
    created_doc = await db_ops.get_user_by_id(db, inserted_id)
    if not created_doc:
        raise HTTPException(status_code=500, detail="Kullanıcı kaydedildi fakat geri okunamadı.")

    return UserResponse(**created_doc)


# ---------------------------------------------------------------------------
# POST /chat/ — Sohbet ve Hafıza Akışı
# ---------------------------------------------------------------------------

@app.post(
    "/chat/",
    response_model=ChatResponse,
    tags=["Sohbet"],
    summary="Sokratik Mentor'a mesaj gönder (hafızalı)",
)
async def chat_endpoint(request: MessageCreate, db: DatabaseDep, current_user: CurrentUser):
    """
    Hafızalı, RAG destekli sohbet endpoint'i.

    **Akış:**
    1. `session_id` yoksa yeni `Conversation` belgesi oluşturulur.
    2. Kullanıcı mesajı `messages` koleksiyonuna kaydedilir.
    3. Oturumdaki son 10 mesaj geçmiş olarak çekilir.
    4. Geçmiş + RAG bağlamı Gemini'ye gönderilir, gerçek yanıt alınır.
    5. Asistan yanıtı `messages` koleksiyonuna kaydedilir.
    6. `reply` ve `session_id` döndürülür.
    """

    # ------------------------------------------------------------------
    # 1. Oturum Yönetimi: session_id yoksa yeni conversation oluştur
    # ------------------------------------------------------------------
    session_id: UUID

    if request.session_id is None:
        # Yeni oturum: başlık olarak kullanıcı mesajının ilk 60 karakteri
        title = request.message[:60] + ("..." if len(request.message) > 60 else "")
        new_conv = ConversationCreate(
            user_id=current_user["id"],
            title=title,
        )
        conversation_id = await db_ops.create_conversation(db, new_conv)
        session_id = new_conv.session_id        # uuid4 ile üretildi
    else:
        # Mevcut oturumu bul
        session_id = request.session_id
        existing_conv = await db_ops.get_conversation_by_session(db, session_id)

        if not existing_conv:
            raise HTTPException(
                status_code=404,
                detail=f"session_id '{session_id}' bulunamadı. Yeni oturum için session_id göndermeden tekrar deneyin.",
            )
        conversation_id = existing_conv["id"]

    user_msg = ChatMessage(role="user", content=request.message)
    await db_ops.save_message(db, conversation_id, session_id, current_user["id"], user_msg)
    await db_ops.add_xp_to_user(db, current_user["id"], 10)

    history = await db_ops.get_conversation_history(db, session_id, limit=10)
    portfolio = await db_ops.get_user_portfolio(db, current_user["id"])

    graph_state = {
        "query": request.message,
        "history": history,
        "file_base64": request.file_base64,
        "file_mime_type": request.file_mime_type,
        "route": "",
        "answer": "",
        "user_profile": current_user,
        "portfolio": portfolio,
    }
    result = await mentor_graph.ainvoke(graph_state)
    real_reply = result["answer"]

    assistant_msg = ChatMessage(role="assistant", content=real_reply)
    await db_ops.save_message(db, conversation_id, session_id, current_user["id"], assistant_msg)

    return ChatResponse(reply=real_reply, session_id=session_id)


@app.get("/users/me", response_model=UserResponse, tags=["Kullanıcılar"])
async def get_me(current_user: CurrentUser):
    return UserResponse(**current_user)


@app.put("/users/me", response_model=UserResponse, tags=["Kullanıcılar"])
async def update_me(body: UserUpdateRequest, db: DatabaseDep, current_user: CurrentUser):
    from models import _utcnow

    # exclude_unset: istekte hiç gönderilmeyen alanlar güncellenmez.
    # telegram_chat_id'nin bilinçli olarak null'a çekilebilmesi için
    # "None ise atla" mantığı kullanılmıyor.
    update_fields: dict = body.model_dump(exclude_unset=True)
    update_fields["last_active_at"] = _utcnow()

    updated_doc = await db_ops.update_user(db, current_user["id"], update_fields)
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    return UserResponse(**updated_doc)


# ---------------------------------------------------------------------------
# MARKET VE HABER ENDPOINT'LERİ (Takım Arkadaşının Kodları)
# ---------------------------------------------------------------------------

# Dış sağlayıcı (Yahoo Finance / Finnhub) hatalarında 502 dönülüyor: sorun
# istemcinin isteğinde değil, yukarı akış servisinde. Sebep detail alanında
# taşınıyor, böylece teşhis için sunucu logu okumak gerekmiyor.
@app.get("/market/history/{ticker}", tags=["Piyasa Verileri"])
async def stock_history(ticker: str, start: str, end: str):
    # yfinance senkron çalışır; event loop'u kilitlememesi için threadpool'a atılır.
    try:
        data = await run_in_threadpool(market.get_stock_history, ticker, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ticker": ticker, "data": data}


@app.get("/market/price/{ticker}", tags=["Piyasa Verileri"])
async def stock_price(ticker: str):
    try:
        return await run_in_threadpool(market.get_current_price, ticker)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/news/company/{symbol}", tags=["Haberler"])
async def company_news(symbol: str, from_date: str, to_date: str):
    # finnhub-python da senkron; aynı sebeple threadpool'a atılır.
    try:
        articles = await run_in_threadpool(
            news.get_company_news, symbol, from_date, to_date
        )
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"symbol": symbol, "articles": articles}


@app.get("/news/market", tags=["Haberler"])
async def market_news(category: str = "general"):
    try:
        articles = await run_in_threadpool(news.get_market_news, category)
    except ValueError as exc:
        # Anahtar eksikse yapılandırma sorunu: 503 + net mesaj.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"category": category, "articles": articles}


@app.post("/test-telegram-briefing", tags=["Bildirimler"])
async def test_telegram_briefing(db: DatabaseDep, current_user: CurrentUser):
    chat_id = current_user.get("telegram_chat_id")
    if not chat_id:
        raise HTTPException(
            status_code=400,
            detail="Telegram Chat ID bulunamadı. Lütfen önce profil sayfasından Chat ID'nizi ekleyin.",
        )
    user_id = current_user["id"]
    portfolio = await db_ops.get_user_portfolio(db, user_id)
    briefing_text = await telegram_bot.generate_morning_briefing(current_user, portfolio)
    await telegram_bot.send_telegram_message(chat_id, briefing_text)
    return {"status": "ok", "message": f"{chat_id} adresine bülten gönderildi."}