-- ============================================================================
-- Fin101 — Supabase (Postgres) başlangıç şeması
--
-- MongoDB koleksiyonlarının Postgres karşılıkları:
--   users         → public.users
--   conversations → public.conversations
--   messages      → public.messages
--   transactions  → public.transactions
--   (ChromaDB)    → pgvector; tabloları langchain_postgres kendisi oluşturur
--
-- Kimlik doğrulama şimdilik uygulama tarafında (auth.py / JWT) kalıyor,
-- bu yüzden users tablosu auth.users'a bağlı DEĞİL. Supabase Auth'a
-- geçilirse ayrı bir migration'da users.id → auth.users.id ilişkisi kurulur.
-- ============================================================================

create extension if not exists vector;   -- RAG vektör araması (ChromaDB yerine)
create extension if not exists citext;   -- e-posta karşılaştırmasını harf duyarsız yapar


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create table public.users (
    id               uuid        primary key default gen_random_uuid(),
    name             text        not null,
    email            citext      not null unique,
    hashed_password  text        not null default '',
    risk_profile     text        not null default 'Orta'
                                 check (risk_profile in ('Düşük', 'Orta', 'Yüksek')),
    virtual_balance  numeric(18,2) not null default 10000.00 check (virtual_balance >= 0),
    currency         text        not null default 'TRY' check (currency in ('TRY', 'USD')),
    avatar_url       text,
    telegram_chat_id text,
    -- "HH:MM" metni olarak tutuluyor; telegram_bot.py şu an string karşılaştırma yapıyor.
    briefing_time    text        not null default '09:00',
    interests        text[]      not null default '{}',
    badges           text[]      not null default '{}',
    xp_score         integer     not null default 0 check (xp_score >= 0),
    level            integer     not null default 1 check (level >= 1),
    is_active        boolean     not null default true,
    created_at       timestamptz not null default now(),
    last_active_at   timestamptz not null default now()
);

-- Telegram cron'u bu iki alanla filtreliyor (telegram_bot.py:161)
create index users_briefing_idx
    on public.users (briefing_time)
    where telegram_chat_id is not null and telegram_chat_id <> '';


-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
    id            uuid        primary key default gen_random_uuid(),
    user_id       uuid        not null references public.users (id) on delete cascade,
    session_id    uuid        not null unique default gen_random_uuid(),
    title         text,
    message_count integer     not null default 0,
    is_archived   boolean     not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index conversations_user_idx on public.conversations (user_id, updated_at desc);


-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table public.messages (
    id              bigserial   primary key,
    conversation_id uuid        not null references public.conversations (id) on delete cascade,
    -- session_id denormalize: mevcut kod geçmişi doğrudan session_id ile çekiyor
    session_id      uuid        not null,
    user_id         uuid        not null references public.users (id) on delete cascade,
    role            text        not null check (role in ('user', 'assistant')),
    content         text        not null,
    created_at      timestamptz not null default now()
);

-- Sohbet hafızası sorgusu: son N mesaj (created_at desc → limit → uygulamada ters çevir).
-- Mongo tarafındaki "ilk 10 mesaj" hatası bu indeksle doğal olarak doğru kurulacak.
create index messages_session_idx on public.messages (session_id, created_at desc);


-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
    id         bigserial     primary key,
    user_id    uuid          not null references public.users (id) on delete cascade,
    symbol     text          not null check (char_length(symbol) between 1 and 10),
    type       text          not null check (type in ('BUY', 'SELL')),
    quantity   integer       not null check (quantity > 0),
    price      numeric(18,4) not null check (price > 0),
    created_at timestamptz   not null default now()
);

create index transactions_user_symbol_idx
    on public.transactions (user_id, symbol, created_at);


-- ---------------------------------------------------------------------------
-- Portföy hesabı
--
-- Mongo aggregation'ındaki hata: average_cost yalnızca BUY toplamlarından
-- hesaplanıyordu, satışlar maliyet tabanını düşürmüyordu. Sonuç:
--   BUY 10x100 → SELL 10 → BUY 1x200  ⇒  average_cost 109.09 (doğrusu 200)
--
-- Buradaki fonksiyon hareketli ortalama maliyet (moving average cost) uygular:
-- SELL, maliyet tabanını o anki ortalama maliyetle azaltır; pozisyon tamamen
-- kapandığında maliyet sıfırlanır, sonraki alım temiz bir ortalama ile başlar.
-- ---------------------------------------------------------------------------

create or replace function public.user_portfolio(p_user_id uuid)
returns table (symbol text, quantity integer, average_cost numeric)
language plpgsql
stable
as $$
declare
    rec        record;
    cur_symbol text    := null;
    qty        integer := 0;
    cost       numeric := 0;      -- pozisyonun toplam maliyet tabanı
    sold       integer;
begin
    for rec in
        select t.symbol, t.type, t.quantity, t.price
        from public.transactions t
        where t.user_id = p_user_id
        order by t.symbol, t.created_at, t.id
    loop
        -- Sembol değişti: biriken pozisyonu döndür, sayaçları sıfırla
        if cur_symbol is distinct from rec.symbol then
            if cur_symbol is not null and qty > 0 then
                symbol       := cur_symbol;
                quantity     := qty;
                average_cost := round(cost / qty, 4);
                return next;
            end if;
            cur_symbol := rec.symbol;
            qty        := 0;
            cost       := 0;
        end if;

        if rec.type = 'BUY' then
            qty  := qty + rec.quantity;
            cost := cost + rec.quantity * rec.price;
        else
            -- Elde olandan fazlası satılamaz; fazlası sessizce yok sayılır
            sold := least(rec.quantity, qty);
            if qty > 0 then
                cost := cost - (cost / qty) * sold;
                qty  := qty - sold;
            end if;
            if qty = 0 then
                cost := 0;          -- pozisyon kapandı → maliyet geçmişi taşınmaz
            end if;
        end if;
    end loop;

    if cur_symbol is not null and qty > 0 then
        symbol       := cur_symbol;
        quantity     := qty;
        average_cost := round(cost / qty, 4);
        return next;
    end if;
end;
$$;

comment on function public.user_portfolio(uuid) is
    'Kullanıcının açık pozisyonlarını hareketli ortalama maliyetle döndürür.';


-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Veritabanına yalnızca FastAPI backend'i (doğrudan Postgres bağlantısı ile)
-- erişiyor; bu bağlantı RLS'i baypas eder. Frontend hiçbir tabloya doğrudan
-- gitmiyor. Bu yüzden RLS'i açıp POLİTİKA TANIMLAMIYORUZ: Data API üzerinden
-- gelen anon/authenticated istekleri için sonuç "hiçbir satır" olur.
--
-- Supabase Auth'a geçildiğinde buraya auth.uid() tabanlı politikalar eklenir.
-- ---------------------------------------------------------------------------

alter table public.users         enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.transactions  enable row level security;
