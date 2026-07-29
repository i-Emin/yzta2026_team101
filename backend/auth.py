import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import asyncpg
import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt

import db_pg as db_ops
from config import IS_PRODUCTION, JWT_SECRET_KEY
from db_pg import get_database, get_user_by_email, get_user_by_id
from models import UserCreate, UserRegister, UserResponse

logger = logging.getLogger(__name__)

# Eskiden sabit bir "fin101-default-secret-change-in-prod" değerine düşülüyordu;
# deploy'da JWT_SECRET_KEY unutulursa token'lar herkesin bildiği bir anahtarla
# imzalanmış olurdu. Artık üretimde açılışta hata veriyor, geliştirmede ise
# süreç başına rastgele anahtar üretiliyor (yeniden başlatınca oturumlar düşer).
if JWT_SECRET_KEY:
    SECRET_KEY = JWT_SECRET_KEY
elif IS_PRODUCTION:
    raise RuntimeError(
        "JWT_SECRET_KEY tanımlı değil. Üretim ortamında zorunludur — "
        "host'unuzun ortam değişkenlerine güçlü ve rastgele bir değer ekleyin."
    )
else:
    SECRET_KEY = secrets.token_urlsafe(32)
    logger.warning(
        "JWT_SECRET_KEY tanımlı değil; bu süreç için geçici bir anahtar üretildi. "
        "Sunucu yeniden başladığında mevcut oturumlar geçersiz olacak."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
BCRYPT_ROUNDS = 12

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

router = APIRouter(prefix="/auth", tags=["Kimlik Doğrulama"])


def hash_password(plain: str) -> str:
    encoded = plain.encode("utf-8")[:72]
    return _bcrypt.hashpw(encoded, _bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception as exc:
        logger.warning("verify_password hatası: %s", exc)
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[asyncpg.Pool, Depends(get_database)],
) -> dict:
    payload = decode_token(token)
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Geçersiz token içeriği.")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


DatabaseDep = Annotated[asyncpg.Pool, Depends(get_database)]


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: UserRegister, db: DatabaseDep):
    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="Şifre en az 6 karakter olmalıdır.")

    user_create = UserCreate(
        name=body.name,
        email=body.email,
        risk_profile=body.risk_profile,
    )

    # Mükerrer e-posta kontrolü veritabanındaki unique kısıtına bırakıldı:
    # ayrı bir "önce sorgula" adımı, iki isteğin arasına girdiği durumda
    # yarış koşuluna açıktı.
    try:
        user_id = await db_ops.create_user_with_password(
            db, user_create, hash_password(body.password)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı.")

    logger.info("Yeni kullanıcı kaydedildi: %s (id=%s)", body.email, user_id)

    created_doc = await get_user_by_id(db, user_id)
    return UserResponse(**created_doc)


@router.post("/login")
async def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DatabaseDep):
    user_doc = await get_user_by_email(db, form.username)
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı.",
        )

    hashed = user_doc.get("hashed_password", "")
    if not hashed or not verify_password(form.password, hashed):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı.",
        )

    token = create_access_token({"sub": user_doc["id"], "email": user_doc["email"]})
    logger.info("Giriş başarılı: %s", user_doc["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_doc["id"],
            "name": user_doc["name"],
            "email": user_doc["email"],
        },
    }
