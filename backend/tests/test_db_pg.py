"""
test_db_pg.py — Supabase/Postgres veri katmanının uçtan uca testi.

Canlı bir Postgres'e bağlanır, şemanın kurulu olduğunu varsayar
(supabase/migrations/20260729120000_init.sql uygulanmış olmalı).

Kullanım:
    cd backend
    DATABASE_URL="postgresql://postgres.<ref>:<parola>@aws-1-<region>.pooler.supabase.com:5432/postgres" \
        python tests/test_db_pg.py

Supabase bağlantınızı doğrulamak için doğrudan üretim veritabanına karşı
çalıştırabilirsiniz: test kendi oluşturduğu kullanıcıları sonunda siler
(conversations/messages/transactions cascade ile temizlenir) ve mevcut
verilere dokunmaz. Yine de ilk denemeyi boş bir veritabanında yapmak
en güvenlisidir.

Çıkış kodu: 0 = hepsi geçti, 1 = en az bir test başarısız.
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

# backend/ dizinini import yoluna ekle (tests/ alt klasöründen çalıştırılıyor)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# config, backend/.env dosyasını da yükler — bu yüzden DATABASE_URL'i
# ortam değişkeni yerine doğrudan .env'e yazmanız yeterli.
from config import DATABASE_URL                           # noqa: E402

if not DATABASE_URL:
    print("ATLANDI: DATABASE_URL tanımlı değil.")
    print("backend/.env dosyasına şu satırı ekleyin:")
    print("  DATABASE_URL=postgresql://postgres.<ref>:<parola>@aws-0-<region>.pooler.supabase.com:5432/postgres")
    sys.exit(0)

import db_pg as db_ops                                    # noqa: E402
from models import (                                      # noqa: E402
    ChatMessage,
    ConversationCreate,
    TransactionCreate,
    UserCreate,
)

# Aynı veritabanında birden fazla kez çalıştırılabilsin diye her koşuda benzersiz
RUN = uuid4().hex[:8]
created_user_ids: list[str] = []

ok, fail = 0, 0


def check(label: str, actual, expected) -> None:
    global ok, fail
    if actual == expected:
        print(f"  PASS  {label}: {actual}")
        ok += 1
    else:
        print(f"  FAIL  {label}: {actual!r}  (beklenen: {expected!r})")
        fail += 1


async def new_user(db, name: str, **kwargs) -> str:
    uid = await db_ops.create_user_with_password(
        db,
        UserCreate(name=name, email=f"{name.lower()}-{RUN}@fin101-qa.dev", **kwargs),
        "hash123",
    )
    created_user_ids.append(uid)
    return uid


async def run_tests(db) -> None:
    print("\n[1] Kullanıcı kaydı ve okuma")
    uid = await new_user(db, "Emin")
    user = await db_ops.get_user_by_id(db, uid)
    check("id string", isinstance(user["id"], str), True)
    check("virtual_balance float", isinstance(user["virtual_balance"], float), True)
    check("başlangıç bakiyesi", user["virtual_balance"], 10000.0)
    check("interests listesi", user["interests"], [])
    check("hashed_password sızmıyor", "hashed_password" not in user, True)

    print("\n[2] Login akışı — e-posta harf duyarsız (citext)")
    by_mail = await db_ops.get_user_by_email(db, f"EMIN-{RUN}@FIN101-QA.DEV")
    check("büyük harfle bulundu", by_mail is not None and by_mail["id"] == uid, True)
    check("hashed_password erişilebilir", by_mail["hashed_password"], "hash123")

    print("\n[3] Mükerrer e-posta")
    try:
        await db_ops.create_user_with_password(
            db, UserCreate(name="X", email=f"emin-{RUN}@fin101-qa.dev"), "h"
        )
        check("ValueError fırlattı", False, True)
    except ValueError as exc:
        check("ValueError fırlattı", "zaten kayıtlı" in str(exc), True)

    print("\n[4] Geçersiz uuid — ObjectId try/except davranışı korunuyor")
    check("get_user_by_id('abc')", await db_ops.get_user_by_id(db, "abc"), None)

    print("\n[5] Profil güncelleme (PUT /users/me)")
    upd = await db_ops.update_user(db, uid, {
        "name": "Emin İpek",
        "risk_profile": "Yüksek",
        "interests": ["Hisse", "ETF"],
        "telegram_chat_id": "12345",
        "briefing_time": "08:30",
        # allowed listesinde olmayan alan yazılmamalı (mass assignment koruması)
        "hashed_password": "ELE_GECIRME_DENEMESI",
    })
    check("isim", upd["name"], "Emin İpek")
    check("risk profili", upd["risk_profile"], "Yüksek")
    check("ilgi alanları", upd["interests"], ["Hisse", "ETF"])
    check(
        "izin verilmeyen alan yazılmadı",
        (await db_ops.get_user_by_email(db, f"emin-{RUN}@fin101-qa.dev"))["hashed_password"],
        "hash123",
    )

    print("\n[6] XP ve seviye eşikleri")
    check("+10 XP → Lvl 1", (await db_ops.add_xp_to_user(db, uid, 10))["level"], 1)
    check("500 XP → Lvl 2", (await db_ops.add_xp_to_user(db, uid, 490))["level"], 2)
    check("1200 XP → Lvl 3", (await db_ops.add_xp_to_user(db, uid, 700))["level"], 3)
    lvl4 = await db_ops.add_xp_to_user(db, uid, 1300)
    check("2500 XP → Lvl 4", lvl4["level"], 4)
    check("xp toplamı", lvl4["xp_score"], 2500)

    print("\n[7] Sohbet hafızası — SON N mesaj sırası")
    conv = ConversationCreate(user_id=uid, title="Test oturumu")
    conv_id = await db_ops.create_conversation(db, conv)
    sid = conv.session_id
    for i in range(1, 16):
        role = "user" if i % 2 else "assistant"
        await db_ops.save_message(
            db, conv_id, sid, uid, ChatMessage(role=role, content=f"mesaj-{i}")
        )

    hist = await db_ops.get_conversation_history(db, sid, limit=10)
    check("10 mesaj döndü", len(hist), 10)
    # Mongo sürümü buraya "mesaj-1" koyuyordu (en eski 10) — hafıza donuyordu
    check("son 10 mesaj geldi", hist[0]["content"], "mesaj-6")
    check("kronolojik sıra", hist[-1]["content"], "mesaj-15")
    check(
        "message_count güncellendi",
        (await db_ops.get_conversation_by_session(db, sid))["message_count"],
        15,
    )

    print("\n[8] Portföy — hareketli ortalama maliyet")
    for tx in (
        TransactionCreate(symbol="AAPL", type="BUY", quantity=10, price=100),
        TransactionCreate(symbol="AAPL", type="SELL", quantity=10, price=150),
        TransactionCreate(symbol="AAPL", type="BUY", quantity=1, price=200),
    ):
        await db_ops.create_transaction(db, uid, tx)

    aapl = next(p for p in await db_ops.get_user_portfolio(db, uid) if p["symbol"] == "AAPL")
    # Mongo aggregation'ı 109.09 veriyordu: satışlar maliyet tabanını düşürmüyordu
    check("kapanıp yeniden açılan pozisyon", aapl["average_cost"], 200.0)
    check("adet", aapl["quantity"], 1)

    print("\n[9] Bakiye ve hisse yeterlilik kontrolleri")
    check(
        "bakiye tutarlı (10000 - 1000 + 1500 - 200)",
        (await db_ops.get_user_by_id(db, uid))["virtual_balance"],
        10300.0,
    )
    try:
        await db_ops.create_transaction(
            db, uid, TransactionCreate(symbol="TSLA", type="BUY", quantity=1000, price=500)
        )
        check("yetersiz bakiye reddedildi", False, True)
    except ValueError as exc:
        check("yetersiz bakiye reddedildi", "Yetersiz bakiye" in str(exc), True)
    try:
        await db_ops.create_transaction(
            db, uid, TransactionCreate(symbol="AAPL", type="SELL", quantity=99, price=200)
        )
        check("yetersiz hisse reddedildi", False, True)
    except ValueError as exc:
        check("yetersiz hisse reddedildi", "Yetersiz hisse" in str(exc), True)
    check(
        "başarısız işlem bakiyeyi bozmadı",
        (await db_ops.get_user_by_id(db, uid))["virtual_balance"],
        10300.0,
    )

    print("\n[10] Telegram bülten filtresi")
    # Mongo'da {"$exists": True, "$ne": None, "$ne": ""} yazılmıştı; Python
    # sözlüğünde tekrarlanan anahtar yüzünden `$ne: None` düşüyor ve chat_id'si
    # NULL olan kullanıcılar da filtreye giriyordu.
    null_uid = await new_user(db, "NullChat", briefing_time="08:30")
    await db_ops.update_user(db, null_uid, {"telegram_chat_id": None})
    empty_uid = await new_user(db, "EmptyChat", briefing_time="08:30")
    await db_ops.update_user(db, empty_uid, {"telegram_chat_id": ""})

    briefing = await db_ops.get_users_for_briefing(db, "08:30")
    ours = {u["id"] for u in briefing} & {uid, null_uid, empty_uid}
    check("yalnızca geçerli chat_id", ours, {uid})

    print("\n[11] Eşzamanlı alım — yarış koşulu")
    racer = await new_user(db, "Racer")
    # Bakiye 10000, her istek 6000 tutarında → en fazla biri geçebilir
    results = await asyncio.gather(
        *[
            db_ops.create_transaction(
                db, racer, TransactionCreate(symbol="RACE", type="BUY", quantity=60, price=100)
            )
            for _ in range(5)
        ],
        return_exceptions=True,
    )
    check("yalnızca 1 alım geçti", sum(1 for r in results if not isinstance(r, Exception)), 1)
    check(
        "bakiye eksiye düşmedi",
        (await db_ops.get_user_by_id(db, racer))["virtual_balance"],
        4000.0,
    )


async def cleanup(db) -> None:
    """Test verilerini siler; conversations/messages/transactions cascade ile gider."""
    from uuid import UUID
    for uid in created_user_ids:
        try:
            await db.execute("delete from users where id = $1", UUID(uid))
        except Exception as exc:                        # noqa: BLE001
            print(f"  (temizlik uyarısı: {uid} silinemedi — {exc})")


def _explain_connection_error(exc: BaseException) -> str:
    """Sık karşılaşılan bağlantı hatalarını anlaşılır bir öneriye çevirir."""
    import asyncpg
    import socket

    if isinstance(exc, asyncpg.InvalidPasswordError):
        return (
            "Parola hatalı. Parolanızda @ # / : ? gibi karakter varsa percent-encode\n"
            "  edilmesi gerekir (@ → %40). Supabase panelinden 'Reset database\n"
            "  password' ile yeni bir parola da alabilirsiniz."
        )
    if isinstance(exc, socket.gaierror):
        return (
            "Host adı çözümlenemedi. DATABASE_URL içindeki sunucu adresini kontrol edin\n"
            "  (Supabase → Connect → Direct → Session pooler → host)."
        )
    if isinstance(exc, asyncpg.UndefinedTableError):
        return (
            "Tablolar bulunamadı. supabase/migrations/20260729120000_init.sql dosyasını\n"
            "  Supabase SQL Editor'da çalıştırdınız mı?"
        )
    if isinstance(exc, asyncpg.UndefinedFunctionError):
        return (
            "user_portfolio fonksiyonu yok. Migration dosyası eksik çalışmış olabilir,\n"
            "  tamamını yeniden çalıştırın."
        )
    if isinstance(exc, (ConnectionRefusedError, OSError)):
        return (
            "Bağlantı reddedildi veya ağ erişilemedi. Port 5432 (Session pooler) mi?\n"
            "  Doğrudan bağlantı (db.<ref>.supabase.co) IPv6-only olduğu için çoğu\n"
            "  ortamdan erişilemez — Session pooler adresini kullanın."
        )
    return "Beklenmeyen hata. Ayrıntı yukarıda."


async def main() -> int:
    try:
        await db_ops.connect_db()
    except Exception as exc:                              # noqa: BLE001
        print(f"\nBAĞLANTI KURULAMADI: {type(exc).__name__}: {exc}")
        print(f"\n  → {_explain_connection_error(exc)}\n")
        return 1

    db = db_ops.get_database()
    try:
        await run_tests(db)
    except Exception as exc:                              # noqa: BLE001
        print(f"\nTEST SIRASINDA HATA: {type(exc).__name__}: {exc}")
        print(f"\n  → {_explain_connection_error(exc)}\n")
        global fail
        fail += 1
    finally:
        await cleanup(db)
        await db_ops.close_db()

    print(f"\n{'=' * 46}")
    print(f"SONUÇ: {ok} geçti, {fail} başarısız")
    print(f"{'=' * 46}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
