-- ============================================================================
-- Fin101 — Supabase şema kontrol betiği (smoke test)
--
-- Yerel geliştirme ortamı gerekmez: Supabase SQL Editor'a bu dosyanın
-- TAMAMINI yapıştırıp Run demeniz yeterli. Sonuçlar tablo olarak çıkar.
--
-- Betik kendi test verisini oluşturur ve sonunda siler; mevcut verilerinize
-- dokunmaz. Birden fazla kez çalıştırılabilir.
--
-- Beklenen: her satırda sonuc = 'GECTI'
-- ============================================================================

create or replace function public.fin101_smoke_test()
returns table (kontrol text, sonuc text, detay text)
language plpgsql
as $$
declare
    uid       uuid;
    conv_id   uuid;
    sid       uuid := gen_random_uuid();
    avg_cost  numeric;
    qty       integer;
    n         integer;
    i         integer;
begin
    ------------------------------------------------------------------
    -- Eklentiler
    ------------------------------------------------------------------
    kontrol := 'pgvector eklentisi kurulu';
    if exists (select 1 from pg_extension where extname = 'vector') then
        sonuc := 'GECTI'; detay := 'RAG vektör araması için hazır';
    else
        sonuc := 'EKSIK';
        detay := 'Database > Extensions > "vector" > Enable yapın';
    end if;
    return next;

    kontrol := 'citext eklentisi kurulu';
    if exists (select 1 from pg_extension where extname = 'citext') then
        sonuc := 'GECTI'; detay := 'E-posta karşılaştırması harf duyarsız';
    else
        sonuc := 'EKSIK'; detay := 'Migration eksik çalışmış';
    end if;
    return next;

    ------------------------------------------------------------------
    -- Tablolar
    ------------------------------------------------------------------
    select count(*) into n
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('users', 'conversations', 'messages', 'transactions');

    kontrol := 'Dört tablo mevcut';
    sonuc   := case when n = 4 then 'GECTI' else 'EKSIK' end;
    detay   := n || '/4 tablo bulundu';
    return next;

    ------------------------------------------------------------------
    -- RLS açık mı (Data API üzerinden veri sızmasını engeller)
    ------------------------------------------------------------------
    select count(*) into n
    from pg_tables
    where schemaname = 'public'
      and tablename in ('users', 'conversations', 'messages', 'transactions')
      and rowsecurity;

    kontrol := 'RLS dört tabloda da açık';
    sonuc   := case when n = 4 then 'GECTI' else 'EKSIK' end;
    detay   := n || '/4 tabloda RLS etkin';
    return next;

    ------------------------------------------------------------------
    -- Test kullanıcısı
    ------------------------------------------------------------------
    insert into public.users (name, email)
    values ('Smoke Test', 'smoke-' || gen_random_uuid() || '@fin101-qa.dev')
    returning id into uid;

    kontrol := 'Kullanıcı kaydı ve varsayılanlar';
    select virtual_balance into avg_cost from public.users where id = uid;
    sonuc := case when avg_cost = 10000.00 then 'GECTI' else 'HATA' end;
    detay := 'başlangıç bakiyesi = ' || avg_cost;
    return next;

    ------------------------------------------------------------------
    -- Kısıtlar reddediyor mu
    ------------------------------------------------------------------
    kontrol := 'Negatif bakiye reddediliyor';
    begin
        update public.users set virtual_balance = -1 where id = uid;
        sonuc := 'HATA'; detay := 'kısıt çalışmadı!';
    exception when check_violation then
        sonuc := 'GECTI'; detay := 'check constraint devrede';
    end;
    return next;

    kontrol := 'Geçersiz risk profili reddediliyor';
    begin
        update public.users set risk_profile = 'Çok Yüksek' where id = uid;
        sonuc := 'HATA'; detay := 'kısıt çalışmadı!';
    exception when check_violation then
        sonuc := 'GECTI'; detay := 'yalnızca Düşük/Orta/Yüksek';
    end;
    return next;

    kontrol := 'Sıfır adetli işlem reddediliyor';
    begin
        insert into public.transactions (user_id, symbol, type, quantity, price)
        values (uid, 'TEST', 'BUY', 0, 10);
        sonuc := 'HATA'; detay := 'kısıt çalışmadı!';
    exception when check_violation then
        sonuc := 'GECTI'; detay := 'quantity > 0 zorunlu';
    end;
    return next;

    kontrol := 'Mükerrer e-posta reddediliyor';
    begin
        insert into public.users (name, email)
        select 'Kopya', email from public.users where id = uid;
        sonuc := 'HATA'; detay := 'kısıt çalışmadı!';
    exception when unique_violation then
        sonuc := 'GECTI'; detay := 'e-posta tekilliği korunuyor';
    end;
    return next;

    ------------------------------------------------------------------
    -- Sohbet hafızası sırası
    ------------------------------------------------------------------
    insert into public.conversations (user_id, session_id, title)
    values (uid, sid, 'Smoke test oturumu')
    returning id into conv_id;

    for i in 1..15 loop
        insert into public.messages (conversation_id, session_id, user_id, role, content, created_at)
        values (
            conv_id, sid, uid,
            case when i % 2 = 1 then 'user' else 'assistant' end,
            'mesaj-' || i,
            now() + (i || ' seconds')::interval
        );
    end loop;

    -- Uygulamanın yaptığı sorgu: son 10 mesaj (sonra kronolojik sıraya çevrilir).
    -- 15 mesajın son 10'u = mesaj-6 .. mesaj-15; mesaj-1 bu aralıkta OLMAMALI.
    kontrol := 'Sohbet hafızası SON 10 mesajı getiriyor';
    -- 15 mesajdan son 10 = mesaj-6 .. mesaj-15
    if exists (
        select 1 from (
            select content from public.messages
            where session_id = sid order by created_at desc, id desc limit 10
        ) t where content = 'mesaj-6'
    ) and not exists (
        select 1 from (
            select content from public.messages
            where session_id = sid order by created_at desc, id desc limit 10
        ) t where content = 'mesaj-1'
    ) then
        sonuc := 'GECTI'; detay := 'mesaj-6 .. mesaj-15 (ilk 10 değil)';
    else
        sonuc := 'HATA'; detay := 'yanlış aralık döndü';
    end if;
    return next;

    ------------------------------------------------------------------
    -- Portföy: hareketli ortalama maliyet (bildirilen hata)
    ------------------------------------------------------------------
    insert into public.transactions (user_id, symbol, type, quantity, price, created_at) values
        (uid, 'AAPL', 'BUY',  10, 100, now() - interval '3 h'),
        (uid, 'AAPL', 'SELL', 10, 150, now() - interval '2 h'),
        (uid, 'AAPL', 'BUY',   1, 200, now() - interval '1 h');

    select p.average_cost, p.quantity into avg_cost, qty
    from public.user_portfolio(uid) p where p.symbol = 'AAPL';

    kontrol := 'Ortalama maliyet: kapanıp yeniden açılan pozisyon';
    if avg_cost = 200 and qty = 1 then
        sonuc := 'GECTI'; detay := '1 adet @ 200 (MongoDB 109.09 veriyordu)';
    else
        sonuc := 'HATA'; detay := coalesce(qty::text, 'null') || ' adet @ ' || coalesce(avg_cost::text, 'null');
    end if;
    return next;

    insert into public.transactions (user_id, symbol, type, quantity, price, created_at) values
        (uid, 'THYAO.IS', 'BUY', 10, 100, now() - interval '3 h'),
        (uid, 'THYAO.IS', 'BUY', 10, 200, now() - interval '2 h');

    select p.average_cost, p.quantity into avg_cost, qty
    from public.user_portfolio(uid) p where p.symbol = 'THYAO.IS';

    kontrol := 'Ortalama maliyet: kademeli alım';
    if avg_cost = 150 and qty = 20 then
        sonuc := 'GECTI'; detay := '20 adet @ 150';
    else
        sonuc := 'HATA'; detay := coalesce(qty::text, 'null') || ' adet @ ' || coalesce(avg_cost::text, 'null');
    end if;
    return next;

    insert into public.transactions (user_id, symbol, type, quantity, price, created_at) values
        (uid, 'ASELS.IS', 'BUY',  5, 50, now() - interval '2 h'),
        (uid, 'ASELS.IS', 'SELL', 5, 60, now() - interval '1 h');

    kontrol := 'Tamamen satılan pozisyon listede görünmüyor';
    if not exists (select 1 from public.user_portfolio(uid) p where p.symbol = 'ASELS.IS') then
        sonuc := 'GECTI'; detay := 'kapanan pozisyon gizleniyor';
    else
        sonuc := 'HATA'; detay := 'kapanan pozisyon hâlâ listede';
    end if;
    return next;

    ------------------------------------------------------------------
    -- Telegram bülten filtresi
    ------------------------------------------------------------------
    update public.users set briefing_time = '08:30', telegram_chat_id = null where id = uid;

    kontrol := 'Bülten filtresi: chat_id NULL olan kullanıcı dışlanıyor';
    if not exists (
        select 1 from public.users
        where id = uid and briefing_time = '08:30'
          and telegram_chat_id is not null and telegram_chat_id <> ''
    ) then
        sonuc := 'GECTI'; detay := 'NULL chat_id bültene girmiyor';
    else
        sonuc := 'HATA'; detay := 'NULL chat_id filtreye giriyor';
    end if;
    return next;

    ------------------------------------------------------------------
    -- Temizlik (cascade: conversations, messages, transactions)
    ------------------------------------------------------------------
    delete from public.users where id = uid;

    kontrol := 'Test verisi temizlendi';
    if not exists (select 1 from public.users where id = uid)
       and not exists (select 1 from public.messages where session_id = sid) then
        sonuc := 'GECTI'; detay := 'cascade silme çalışıyor, iz kalmadı';
    else
        sonuc := 'HATA'; detay := 'artık veri kaldı — elle silin: ' || uid;
    end if;
    return next;
end;
$$;

-- Sonuçlar aşağıda tablo olarak çıkar. Her satırda sonuc = 'GECTI' olmalı.
select * from public.fin101_smoke_test();

-- Betiği tekrar çalıştırmak isterseniz bu dosyayı yeniden Run etmeniz yeterli.
-- Fonksiyonu tamamen kaldırmak için:  drop function public.fin101_smoke_test();
