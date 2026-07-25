"""
database.py — Fin101 MongoDB Bağlantı Yönetimi ve CRUD Operasyonları

Sorumluluklar:
  - Motor async istemci yaşam döngüsü (connect / close)
  - Koleksiyon referanslarına merkezi erişim
  - Kullanıcı ve sohbet hafızası için asenkron CRUD fonksiyonları
"""

from typing import Optional
from uuid import UUID

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import MONGO_URI, DATABASE_NAME
from models import ChatMessage, ConversationCreate, ConversationInDB, UserCreate, UserInDB


# ---------------------------------------------------------------------------
# İstemci Yaşam Döngüsü (FastAPI lifespan ile yönetilir)
# ---------------------------------------------------------------------------

client: AsyncIOMotorClient | None = None


async def connect_db() -> None:
    """Uygulama başlangıcında MongoDB bağlantısını kurar."""
    global client
    client = AsyncIOMotorClient(MONGO_URI)


async def close_db() -> None:
    """Uygulama kapanışında bağlantıyı düzgün sonlandırır."""
    global client
    if client:
        client.close()


def get_database() -> AsyncIOMotorDatabase:
    """FastAPI Dependency Injection için veritabanı nesnesi döndürür."""
    return client[DATABASE_NAME]


# ---------------------------------------------------------------------------
# Koleksiyon Yardımcıları (DRY — koleksiyon adları tek yerden)
# ---------------------------------------------------------------------------

def _users(db: AsyncIOMotorDatabase):
    return db["users"]


def _conversations(db: AsyncIOMotorDatabase):
    return db["conversations"]


def _messages(db: AsyncIOMotorDatabase):
    return db["messages"]


def _transactions(db: AsyncIOMotorDatabase):
    return db["transactions"]


# ===========================================================================
# KULLANICI CRUD

# ===========================================================================


async def create_user(db: AsyncIOMotorDatabase, user: UserCreate) -> str:
    """
    Gelen UserCreate verisini UserInDB'ye dönüştürüp users koleksiyonuna kaydeder.

    Returns:
        Eklenen belgenin string ObjectId'si.

    Raises:
        ValueError: Aynı e-posta adresi zaten kayıtlıysa.
    """
    existing = await get_user_by_email(db, str(user.email))
    if existing:
        raise ValueError(f"'{user.email}' adresi zaten kayıtlı.")

    user_in_db = UserInDB(**user.model_dump())
    doc = user_in_db.model_dump()

    result = await _users(db).insert_one(doc)
    return str(result.inserted_id)


async def get_user_by_email(
    db: AsyncIOMotorDatabase, email: str
) -> Optional[dict]:
    """
    E-posta adresine göre kullanıcı belgesi döndürür.

    Returns:
        Kullanıcı dict belgesi veya None (bulunamazsa).
    """
    doc = await _users(db).find_one({"email": email})
    if doc:
        doc["id"] = str(doc.pop("_id"))  # ObjectId → str
    return doc


async def get_user_by_id(
    db: AsyncIOMotorDatabase, user_id: str
) -> Optional[dict]:
    """
    ObjectId string'e göre kullanıcı belgesi döndürür.

    Returns:
        Kullanıcı dict belgesi veya None (bulunamazsa).
    """
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None

    doc = await _users(db).find_one({"_id": oid})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def add_xp_to_user(db: AsyncIOMotorDatabase, user_id: str, xp_amount: int) -> Optional[dict]:
    """
    Kullanıcıya XP ekler ve seviyesini günceller.
    Lvl 1: 0 - 499
    Lvl 2: 500 - 1199
    Lvl 3: 1200 - 2499
    Lvl 4: 2500+
    """
    user = await get_user_by_id(db, user_id)
    if not user:
        return None

    new_xp = user.get("xp_score", 0) + xp_amount
    new_level = 1
    if new_xp >= 2500:
        new_level = 4
    elif new_xp >= 1200:
        new_level = 3
    elif new_xp >= 500:
        new_level = 2

    await _users(db).update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"xp_score": new_xp, "level": new_level}}
    )
    user["xp_score"] = new_xp
    user["level"] = new_level
    return user


# ===========================================================================
# SOHBET & HAFIZA CRUD
# ===========================================================================


async def create_conversation(
    db: AsyncIOMotorDatabase, conv: ConversationCreate
) -> str:
    """
    Yeni bir sohbet oturumu açar ve conversations koleksiyonuna kaydeder.

    Returns:
        Eklenen belgenin string ObjectId'si.
    """
    conv_in_db = ConversationInDB(**conv.model_dump())

    # UUID nesnelerini string'e çevir — MongoDB UUID'yi doğal desteklemez
    doc = conv_in_db.model_dump()
    doc["session_id"] = str(doc["session_id"])

    result = await _conversations(db).insert_one(doc)
    return str(result.inserted_id)


async def get_conversation_by_session(
    db: AsyncIOMotorDatabase, session_id: str | UUID
) -> Optional[dict]:
    """
    session_id ile conversations belgesini döndürür.

    Returns:
        Conversation dict belgesi veya None.
    """
    doc = await _conversations(db).find_one({"session_id": str(session_id)})
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


async def save_message(
    db: AsyncIOMotorDatabase,
    conversation_id: str,
    session_id: str | UUID,
    user_id: str,
    message: ChatMessage,
) -> str:
    """
    Tekil bir mesajı messages koleksiyonuna kaydeder.
    Bağlı conversation belgesinin message_count ve updated_at alanlarını günceller.

    Returns:
        Eklenen mesaj belgesinin string ObjectId'si.
    """
    # Mesaj belgesini oluştur
    msg_doc = message.model_dump()
    msg_doc["conversation_id"] = conversation_id
    msg_doc["session_id"] = str(session_id)
    msg_doc["user_id"] = user_id

    result = await _messages(db).insert_one(msg_doc)

    # İlgili conversation'ı güncelle
    from models import _utcnow  # döngüsel import'tan kaçınmak için lokal
    await _conversations(db).update_one(
        {"_id": ObjectId(conversation_id)},
        {
            "$inc": {"message_count": 1},
            "$set": {"updated_at": _utcnow()},
        },
    )

    return str(result.inserted_id)


async def get_conversation_history(
    db: AsyncIOMotorDatabase,
    session_id: str | UUID,
    limit: int = 10,
) -> list[dict]:
    """
    RAG hafızası için verilen oturumdaki son N mesajı getirir.
    Mesajlar kronolojik sıradadır (en eski → en yeni).

    Args:
        session_id: Sorgulanacak oturum kimliği.
        limit:      Getirilecek maksimum mesaj sayısı (varsayılan: 10).

    Returns:
        Sıralı mesaj dict listesi [{"role": ..., "content": ..., "created_at": ...}, ...]
    """
    cursor = (
        _messages(db)
        .find(
            {"session_id": str(session_id)},
            # Yalnızca RAG + frontend'in ihtiyacı olan alanlar
            {"_id": 0, "role": 1, "content": 1, "created_at": 1},
        )
        .sort("created_at", 1)   # Kronolojik sıra (ascending)
        .limit(limit)
    )

    return await cursor.to_list(length=limit)


# ===========================================================================
# SİMÜLASYON VE PORTFÖY CRUD
# ===========================================================================


async def create_transaction(
    db: AsyncIOMotorDatabase,
    user_id: str,
    transaction: "TransactionCreate",
) -> str:
    """
    Kullanıcının alım-satım işlemini kaydeder ve bakiyesini günceller.
    Hata durumunda ValueError fırlatır.
    """
    from models import TransactionInDB
    
    # 1. Kullanıcıyı ve bakiyeyi kontrol et
    user = await get_user_by_id(db, user_id)
    if not user:
        raise ValueError("Kullanıcı bulunamadı.")
        
    total_cost = transaction.quantity * transaction.price
    user_balance = user.get("virtual_balance", 10000.0)
    
    if transaction.type == "BUY":
        if user_balance < total_cost:
            raise ValueError(f"Yetersiz bakiye. Gerekli: {total_cost}, Mevcut: {user_balance}")
        balance_change = -total_cost
    else:
        # SELL - Portföyde yeterli hisse var mı kontrol et
        portfolio = await get_user_portfolio(db, user_id)
        current_quantity = next((p["quantity"] for p in portfolio if p["symbol"] == transaction.symbol), 0)
        if current_quantity < transaction.quantity:
            raise ValueError(f"Yetersiz hisse. Gerekli: {transaction.quantity}, Mevcut: {current_quantity}")
        balance_change = total_cost

    # 2. İşlemi kaydet
    tx_in_db = TransactionInDB(
        user_id=user_id,
        **transaction.model_dump()
    )
    doc = tx_in_db.model_dump()
    result = await _transactions(db).insert_one(doc)
    
    # 3. Bakiyeyi güncelle
    await _users(db).update_one(
        {"_id": ObjectId(user_id)},
        {"$inc": {"virtual_balance": balance_change}}
    )
    
    return str(result.inserted_id)


async def get_user_portfolio(
    db: AsyncIOMotorDatabase,
    user_id: str
) -> list[dict]:
    """
    Kullanıcının transactions koleksiyonundaki işlemlerini toplayarak
    mevcut portföy durumunu hesaplar.
    """
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": "$symbol",
            "total_bought_qty": {
                "$sum": {"$cond": [{"$eq": ["$type", "BUY"]}, "$quantity", 0]}
            },
            "total_bought_cost": {
                "$sum": {"$cond": [{"$eq": ["$type", "BUY"]}, {"$multiply": ["$quantity", "$price"]}, 0]}
            },
            "total_sold_qty": {
                "$sum": {"$cond": [{"$eq": ["$type", "SELL"]}, "$quantity", 0]}
            }
        }},
        {"$project": {
            "symbol": "$_id",
            "_id": 0,
            "quantity": {"$subtract": ["$total_bought_qty", "$total_sold_qty"]},
            "average_cost": {
                "$cond": [
                    {"$gt": ["$total_bought_qty", 0]},
                    {"$divide": ["$total_bought_cost", "$total_bought_qty"]},
                    0
                ]
            }
        }},
        {"$match": {"quantity": {"$gt": 0}}} # Sadece elinde olanları getir
    ]
    
    cursor = _transactions(db).aggregate(pipeline)
    return await cursor.to_list(length=None)
