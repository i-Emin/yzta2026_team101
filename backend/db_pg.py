"""
db_pg.py — Fin101 Supabase/Postgres veri katmanı (database.py'nin asyncpg karşılığı)

Bu modül `database.py` ile AYNI fonksiyon imzalarını sunar; böylece geçiş
main.py içinde tek satırlık bir import değişikliğinden ibaret olur:

    import database as db_ops     →     import db_pg as db_ops

Mongo katmanı silinmedi; sorun çıkarsa importu geri almak yeterli.

İlk parametre olan `db`, Motor'daki AsyncIOMotorDatabase yerine asyncpg
bağlantı havuzudur (Pool). Çağrı yerleri değişmediği için tip ipuçları
dışında bir fark yoktur.

database.py'de OLMAYAN, ham Mongo çağrılarını değiştiren ek fonksiyonlar:
  - create_user_with_password  (auth.py:100  db["users"].insert_one)
  - update_user                (main.py:246  db["users"].update_one)
  - get_users_for_briefing     (telegram_bot.py:161  _db["users"].find)
"""

from typing import Any, Optional
from uuid import UUID

import asyncpg

from config import DATABASE_URL
from models import (
    ChatMessage,
    ConversationCreate,
    TransactionCreate,
    UserCreate,
)


# ---------------------------------------------------------------------------
# Havuz Yaşam Döngüsü (FastAPI lifespan ile yönetilir)
# ---------------------------------------------------------------------------

pool: asyncpg.Pool | None = None


async def connect_db() -> None:
    """Uygulama başlangıcında Postgres bağlantı havuzunu kurar."""
    global pool

    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL tanımlı değil. Supabase Session pooler bağlantı "
            "dizesini backend/.env dosyasına ekleyin."
        )

    # Supabase'in transaction pooler'ı (port 6543) PgBouncer transaction
    # modunda çalışır ve prepared statement'ları desteklemez. Session
    # pooler (5432) destekler. Yanlış porta denk gelirsek anlaşılmaz
    # "prepared statement already exists" hataları yerine önbelleği kapatıyoruz.
    is_transaction_pooler = ":6543" in DATABASE_URL

    pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=1,
        max_size=10,               # Free tier toplam 60 bağlantı veriyor
        command_timeout=30,
        statement_cache_size=0 if is_transaction_pooler else 100,
    )


async def close_db() -> None:
    """Uygulama kapanışında havuzu düzgün sonlandırır."""
    global pool
    if pool:
        await pool.close()
        pool = None


def get_database() -> asyncpg.Pool:
    """FastAPI Dependency Injection için bağlantı havuzunu döndürür."""
    if pool is None:
        raise RuntimeError("Veritabanı havuzu henüz kurulmadı (connect_db çağrılmadı).")
    return pool


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------

# UserResponse / mevcut kodun beklediği alanlar. hashed_password bilinçli
# olarak dışarıda: yalnızca get_user_by_email (login) onu ayrıca çekiyor.
_USER_COLUMNS = """
    id, name, email, risk_profile, virtual_balance, currency, avatar_url,
    telegram_chat_id, briefing_time, interests, badges, xp_score, level,
    is_active, created_at, last_active_at
"""


def _row_to_dict(row: asyncpg.Record | None) -> Optional[dict]:
    """asyncpg Record → dict. UUID ve numeric alanları mevcut kodun
    beklediği Python tiplerine çevirir (id: str, para: float)."""
    if row is None:
        return None

    doc: dict[str, Any] = dict(row)

    # Mongo katmanı id'yi string döndürüyordu; UserResponse de str bekliyor.
    for key in ("id", "user_id", "conversation_id"):
        if key in doc and isinstance(doc[key], UUID):
            doc[key] = str(doc[key])

    # numeric → float (Pydantic float alanları ve JSON serileştirme için)
    for key in ("virtual_balance", "price", "average_cost"):
        if key in doc and doc[key] is not None:
            doc[key] = float(doc[key])

    return doc


# ===========================================================================
# KULLANICI CRUD
# ===========================================================================


async def create_user(db: asyncpg.Pool, user: UserCreate) -> str:
    """
    Yeni kullanıcı kaydeder (şifresiz — POST /users/ ile aynı davranış).

    Returns:
        Eklenen satırın uuid'si (string).

    Raises:
        ValueError: Aynı e-posta adresi zaten kayıtlıysa.
    """
    return await create_user_with_password(db, user, hashed_password="")


async def create_user_with_password(
    db: asyncpg.Pool,
    user: UserCreate,
    hashed_password: str,
) -> str:
    """
    Kullanıcıyı hash'lenmiş şifresiyle kaydeder (auth.py/register akışı).

    Raises:
        ValueError: Aynı e-posta adresi zaten kayıtlıysa.
    """
    try:
        new_id = await db.fetchval(
            """
            insert into users (
                name, email, hashed_password, risk_profile,
                virtual_balance, currency, avatar_url,
                telegram_chat_id, briefing_time, interests
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            returning id
            """,
            user.name,
            str(user.email),
            hashed_password,
            user.risk_profile,
            user.virtual_balance,
            user.currency,
            user.avatar_url,
            user.telegram_chat_id,
            user.briefing_time,
            user.interests,
        )
    except asyncpg.UniqueViolationError as exc:
        raise ValueError(f"'{user.email}' adresi zaten kayıtlı.") from exc

    return str(new_id)


async def get_user_by_email(db: asyncpg.Pool, email: str) -> Optional[dict]:
    """
    E-posta adresine göre kullanıcı döndürür. Login akışı şifreyi
    doğrulayabilmek için hashed_password'a ihtiyaç duyduğundan bu
    fonksiyon onu da içerir (email sütunu citext: harf duyarsız).
    """
    row = await db.fetchrow(
        f"select {_USER_COLUMNS}, hashed_password from users where email = $1",
        email,
    )
    return _row_to_dict(row)


async def get_user_by_id(db: asyncpg.Pool, user_id: str) -> Optional[dict]:
    """
    uuid string'e göre kullanıcı döndürür.
    Geçersiz uuid biçiminde None döner (Mongo katmanındaki ObjectId
    try/except davranışıyla aynı).
    """
    try:
        uid = UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None

    row = await db.fetchrow(
        f"select {_USER_COLUMNS} from users where id = $1", uid
    )
    return _row_to_dict(row)


async def update_user(
    db: asyncpg.Pool,
    user_id: str,
    fields: dict[str, Any],
) -> Optional[dict]:
    """
    Kullanıcının verilen alanlarını günceller (PUT /users/me).

    Yalnızca izin verilen sütunlar güncellenir — sözlük anahtarları
    doğrudan SQL'e gömülmez.
    """
    allowed = {
        "name", "risk_profile", "interests", "telegram_chat_id",
        "briefing_time", "avatar_url", "currency", "last_active_at",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return await get_user_by_id(db, user_id)

    try:
        uid = UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None

    set_parts = [f"{col} = ${i}" for i, col in enumerate(updates, start=2)]
    row = await db.fetchrow(
        f"""
        update users set {", ".join(set_parts)}
        where id = $1
        returning {_USER_COLUMNS}
        """,
        uid,
        *updates.values(),
    )
    return _row_to_dict(row)


async def add_xp_to_user(
    db: asyncpg.Pool, user_id: str, xp_amount: int
) -> Optional[dict]:
    """
    Kullanıcıya XP ekler ve seviyesini yeniden hesaplar.
    Eşikler — Lvl 1: 0-499, Lvl 2: 500-1199, Lvl 3: 1200-2499, Lvl 4: 2500+

    Mongo sürümünden farkı: okuma + yazma tek atomik ifadede yapılıyor,
    eşzamanlı isteklerde XP kaybı olmuyor.
    """
    try:
        uid = UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None

    row = await db.fetchrow(
        f"""
        update users
        set xp_score = xp_score + $2,
            level = case
                when xp_score + $2 >= 2500 then 4
                when xp_score + $2 >= 1200 then 3
                when xp_score + $2 >=  500 then 2
                else 1
            end
        where id = $1
        returning {_USER_COLUMNS}
        """,
        uid,
        xp_amount,
    )
    return _row_to_dict(row)


async def get_users_for_briefing(db: asyncpg.Pool, hhmm: str) -> list[dict]:
    """
    Telegram sabah bülteni için: briefing_time verilen "HH:MM" değerine eşit
    ve geçerli bir telegram_chat_id'si olan kullanıcılar.

    Mongo sürümündeki hata: {"$exists": True, "$ne": None, "$ne": ""} —
    aynı sözlükte iki kez "$ne" olduğu için `$ne: None` sessizce düşüyordu ve
    chat_id'si NULL olan kullanıcılar da filtreye giriyordu.
    """
    rows = await db.fetch(
        f"""
        select {_USER_COLUMNS}
        from users
        where briefing_time = $1
          and telegram_chat_id is not null
          and telegram_chat_id <> ''
          and is_active
        """,
        hhmm,
    )
    return [_row_to_dict(r) for r in rows]


# ===========================================================================
# SOHBET & HAFIZA CRUD
# ===========================================================================


async def create_conversation(db: asyncpg.Pool, conv: ConversationCreate) -> str:
    """
    Yeni sohbet oturumu açar.

    Returns:
        Eklenen conversations satırının uuid'si (string).
    """
    new_id = await db.fetchval(
        """
        insert into conversations (user_id, session_id, title)
        values ($1, $2, $3)
        returning id
        """,
        UUID(str(conv.user_id)),
        conv.session_id,
        conv.title,
    )
    return str(new_id)


async def get_conversation_by_session(
    db: asyncpg.Pool, session_id: str | UUID
) -> Optional[dict]:
    """session_id ile conversation satırını döndürür."""
    row = await db.fetchrow(
        """
        select id, user_id, session_id, title, message_count,
               is_archived, created_at, updated_at
        from conversations
        where session_id = $1
        """,
        UUID(str(session_id)),
    )
    return _row_to_dict(row)


async def save_message(
    db: asyncpg.Pool,
    conversation_id: str,
    session_id: str | UUID,
    user_id: str,
    message: ChatMessage,
) -> str:
    """
    Tekil mesajı kaydeder ve bağlı conversation'ın message_count /
    updated_at alanlarını günceller. İkisi tek transaction içinde.

    Returns:
        Eklenen mesaj satırının id'si (string).
    """
    conv_uuid = UUID(str(conversation_id))

    async with db.acquire() as conn:
        async with conn.transaction():
            msg_id = await conn.fetchval(
                """
                insert into messages
                    (conversation_id, session_id, user_id, role, content, created_at)
                values ($1, $2, $3, $4, $5, $6)
                returning id
                """,
                conv_uuid,
                UUID(str(session_id)),
                UUID(str(user_id)),
                message.role,
                message.content,
                message.created_at,
            )
            await conn.execute(
                """
                update conversations
                set message_count = message_count + 1,
                    updated_at = now()
                where id = $1
                """,
                conv_uuid,
            )

    return str(msg_id)


async def get_conversation_history(
    db: asyncpg.Pool,
    session_id: str | UUID,
    limit: int = 10,
) -> list[dict]:
    """
    RAG hafızası için oturumdaki SON N mesajı kronolojik sırada döndürür.

    Mongo sürümündeki hata: .sort("created_at", 1).limit(10) artan sıralamada
    EN ESKİ 10 mesajı getiriyordu; 5 turdan sonra hafıza donuyordu. Burada
    son N satır alınıp kronolojik sıraya çevriliyor.
    """
    rows = await db.fetch(
        """
        select role, content, created_at
        from messages
        where session_id = $1
        order by created_at desc, id desc
        limit $2
        """,
        UUID(str(session_id)),
        limit,
    )
    # En yeniden en eskiye geldi → kronolojik sıraya çevir
    return [dict(r) for r in reversed(rows)]


# ===========================================================================
# SİMÜLASYON VE PORTFÖY
# ===========================================================================


async def create_transaction(
    db: asyncpg.Pool,
    user_id: str,
    transaction: TransactionCreate,
) -> str:
    """
    Al/sat işlemini kaydeder ve sanal bakiyeyi günceller.

    Mongo sürümünden farkı: bakiye kontrolü, işlem kaydı ve bakiye
    güncellemesi tek transaction içinde ve kullanıcı satırı `for update`
    ile kilitli. Eşzamanlı iki alım isteği artık bakiyeyi eksiye düşüremez.

    Raises:
        ValueError: Kullanıcı yok, bakiye yetersiz veya hisse yetersizse.
    """
    uid = UUID(str(user_id))
    total_cost = transaction.quantity * transaction.price

    async with db.acquire() as conn:
        async with conn.transaction():
            balance = await conn.fetchval(
                "select virtual_balance from users where id = $1 for update",
                uid,
            )
            if balance is None:
                raise ValueError("Kullanıcı bulunamadı.")

            balance = float(balance)

            if transaction.type == "BUY":
                if balance < total_cost:
                    raise ValueError(
                        f"Yetersiz bakiye. Gerekli: {total_cost}, Mevcut: {balance}"
                    )
                balance_change = -total_cost
            else:
                held = await conn.fetchval(
                    """
                    select quantity from user_portfolio($1)
                    where symbol = $2
                    """,
                    uid,
                    transaction.symbol,
                )
                held = held or 0
                if held < transaction.quantity:
                    raise ValueError(
                        f"Yetersiz hisse. Gerekli: {transaction.quantity}, Mevcut: {held}"
                    )
                balance_change = total_cost

            tx_id = await conn.fetchval(
                """
                insert into transactions (user_id, symbol, type, quantity, price)
                values ($1, $2, $3, $4, $5)
                returning id
                """,
                uid,
                transaction.symbol,
                transaction.type,
                transaction.quantity,
                transaction.price,
            )

            await conn.execute(
                "update users set virtual_balance = virtual_balance + $2 where id = $1",
                uid,
                balance_change,
            )

    return str(tx_id)


async def get_user_portfolio(db: asyncpg.Pool, user_id: str) -> list[dict]:
    """
    Kullanıcının açık pozisyonlarını döndürür.

    Hesap `user_portfolio(uuid)` SQL fonksiyonunda: hareketli ortalama
    maliyet kullanır ve pozisyon tamamen kapandığında maliyet tabanını
    sıfırlar (Mongo aggregation'ı satışları hesaba katmıyordu).
    """
    try:
        uid = UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return []

    rows = await db.fetch(
        "select symbol, quantity, average_cost from user_portfolio($1) order by symbol",
        uid,
    )
    return [_row_to_dict(r) for r in rows]
