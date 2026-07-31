"""
rag.py — Fin101 RAG altyapısı (vektör deposu + LLM)

Sokratik mentor akışı graph.py içindeki LangGraph düğümlerinde yürür;
bu modül yalnızca paylaşılan iki kaynağı sağlar: vektör deposu ve LLM.

Vektör deposu ChromaDB yerine Supabase/Postgres + pgvector kullanır.
Embedding'ler yerel `sentence-transformers` yerine Google'ın embedding
modelinden alınır. Bunun iki nedeni var:

  1. `sentence-transformers` torch'u da kurduğu için container ~2 GB'a
     çıkıyor ve modeli RAM'e yüklemek ~400 MB istiyordu; ücretsiz barındırma
     katmanlarının 512 MB sınırına sığmıyordu.
  2. Google'ın modeli Türkçe metinlerde all-MiniLM-L6-v2'den belirgin
     şekilde daha iyi sonuç veriyor.

Embedding modeli değiştirilirse üretilen vektörün boyutu da değişir ve
koleksiyonun sıfırdan yeniden indekslenmesi gerekir
(bkz. reindex_vector_store).
"""

import logging
from pathlib import Path

from langchain_community.document_loaders import PyMuPDFLoader
from langchain_core.documents import Document
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_postgres import PGVector
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import (
    DATABASE_URL,
    GEMINI_API_KEY,
    GEMINI_EMBEDDING_MODEL,
    GEMINI_MODEL,
    RAG_CHUNK_OVERLAP,
    RAG_CHUNK_SIZE,
    RAG_EMBED_BATCH,
)

logger = logging.getLogger(__name__)

RAG_DATA_DIR = Path(__file__).resolve().parent / "rag_data"

# Model adları config üzerinden ortam değişkeninden geliyor: Google modelleri
# emekliye ayırıyor ve yeni projelere eskilerini açmıyor. Sabit isim her
# emeklilikte kod değişikliği gerektiriyordu (önce text-embedding-004, sonra
# gemini-2.5-flash bu yüzden düştü). Değiştirmek artık panelden mümkün.
EMBEDDING_MODEL = GEMINI_EMBEDDING_MODEL
COLLECTION_NAME = "fin101_rag"

_vector_store: PGVector | None = None
_llm: ChatGoogleGenerativeAI | None = None


def _psycopg_dsn() -> str:
    """
    DATABASE_URL'i langchain_postgres'in beklediği sürücü biçimine çevirir.

    asyncpg havuzu düz `postgresql://` şemasını kullanır; langchain_postgres
    ise psycopg3 üzerinden bağlanır ve `postgresql+psycopg://` bekler.
    """
    if not DATABASE_URL:
        raise ValueError(
            "DATABASE_URL tanımlı değil; vektör deposu Postgres'e bağlanamaz."
        )

    dsn = DATABASE_URL
    if dsn.startswith("postgres://"):            # bazı sağlayıcılar bu biçimi verir
        dsn = dsn.replace("postgres://", "postgresql://", 1)
    if "+" not in dsn.split("://", 1)[0]:        # sürücü belirtilmemişse psycopg ekle
        dsn = dsn.replace("postgresql://", "postgresql+psycopg://", 1)
    return dsn


def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=GEMINI_API_KEY,
    )


def _load_and_split_pdfs() -> list[Document]:
    """rag_data/ altındaki PDF'leri okuyup parçalara böler."""
    logger.info("PDF aranıyor: %s", RAG_DATA_DIR)

    if not RAG_DATA_DIR.exists():
        logger.error("Klasör bulunamadı: %s", RAG_DATA_DIR)
        return []

    pdf_files = list(RAG_DATA_DIR.glob("*.pdf"))
    if not pdf_files:
        logger.error("Klasörde hiç .pdf dosyası yok: %s", RAG_DATA_DIR)
        return []

    documents: list[Document] = []
    for pdf_path in pdf_files:
        try:
            pages = PyMuPDFLoader(str(pdf_path)).load()
            non_empty = [p for p in pages if p.page_content.strip()]
            if not non_empty:
                logger.warning(
                    "'%s' metin içermiyor (taranmış/resim bazlı olabilir).", pdf_path.name
                )
                continue

            # Sayfalar PDF başına tek belgede birleştiriliyor. Eskiden her
            # sayfa ayrı belgeydi ve bölücü sayfa başına en az bir parça
            # üretiyordu: 130 sayfa => en az 130 parça, parça boyutundan
            # bağımsız olarak. Gemini ücretsiz katmanı dakikada 100 embedding
            # isteğine izin verdiği için ilk indeksleme 429 ile düşüyordu.
            # Birleştirmenin ikinci faydası: bir cümle sayfa sonunda
            # kesildiğinde bağlam artık ortadan bölünmüyor.
            text = "\n\n".join(p.page_content for p in non_empty)
            documents.append(
                Document(page_content=text, metadata={"source": pdf_path.name})
            )
            logger.info("'%s' → %d sayfa birleştirildi.", pdf_path.name, len(non_empty))
        except Exception as exc:                          # noqa: BLE001
            logger.error("'%s' yüklenemedi: %s", pdf_path.name, exc)

    if not documents:
        logger.error("Hiçbir PDF'den metin çıkarılamadı.")
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=RAG_CHUNK_SIZE,
        chunk_overlap=RAG_CHUNK_OVERLAP,
    )
    chunks = splitter.split_documents(documents)
    logger.info(
        "Toplam %d chunk oluşturuldu (boyut=%d, örtüşme=%d).",
        len(chunks), RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP,
    )
    return chunks


def _add_in_batches(store: PGVector, chunks: list[Document]) -> None:
    """Parçaları gruplar hâlinde yazar.

    Tek seferde yazmak, kotaya takıldığında tüm indekslemeyi kaybettiriyor.
    Gruplara bölmek hem ilerlemeyi loglanabilir kılıyor hem de başarısızlığı
    tek gruba hapsediyor.
    """
    total = len(chunks)
    for start in range(0, total, RAG_EMBED_BATCH):
        batch = chunks[start:start + RAG_EMBED_BATCH]
        store.add_documents(batch)
        logger.info(
            "pgvector'e yazıldı: %d/%d parça", min(start + len(batch), total), total
        )


def _collection_is_empty(store: PGVector) -> bool:
    """
    Koleksiyonda hiç belge var mı? Tablolar henüz oluşmamışsa da boş sayılır.

    Tek bir embedding çağrısı maliyeti var; sonuç modül düzeyinde
    önbelleklendiği için süreç başına yalnızca bir kez çalışır.
    """
    try:
        return not store.similarity_search("finans", k=1)
    except Exception as exc:                              # noqa: BLE001
        logger.info("Koleksiyon henüz sorgulanabilir değil (%s); boş kabul ediliyor.", exc)
        return True


def _get_vector_store() -> PGVector:
    """
    pgvector destekli vektör deposunu döndürür.

    Koleksiyon boşsa rag_data/ altındaki PDF'ler bir kez indekslenir.
    Embedding'ler Postgres'te kalıcı olduğu için sonraki açılışlarda
    bu adım atlanır.
    """
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    store = PGVector(
        embeddings=_get_embeddings(),
        collection_name=COLLECTION_NAME,
        connection=_psycopg_dsn(),
        use_jsonb=True,
    )

    if _collection_is_empty(store):
        logger.info("Vektör koleksiyonu boş; PDF'ler indeksleniyor.")
        chunks = _load_and_split_pdfs()
        if not chunks:
            raise ValueError(
                f"Vektör deposu doldurulamadı: '{RAG_DATA_DIR}' dizininde "
                "okunabilir metin içeren PDF bulunamadı."
            )
        _add_in_batches(store, chunks)
        logger.info("İndeksleme tamamlandı: %d chunk.", len(chunks))
    else:
        logger.info("Mevcut pgvector koleksiyonu kullanılıyor: %s", COLLECTION_NAME)

    _vector_store = store
    return _vector_store


def reindex_vector_store() -> int:
    """
    Koleksiyonu silip PDF'leri sıfırdan indeksler.

    Embedding modeli (dolayısıyla vektör boyutu) değiştiğinde veya
    rag_data/ içeriği güncellendiğinde çalıştırılmalıdır.

    Returns:
        Yazılan chunk sayısı.
    """
    global _vector_store

    chunks = _load_and_split_pdfs()
    if not chunks:
        raise ValueError(f"'{RAG_DATA_DIR}' dizininde indekslenecek PDF yok.")

    store = PGVector(
        embeddings=_get_embeddings(),
        collection_name=COLLECTION_NAME,
        connection=_psycopg_dsn(),
        use_jsonb=True,
        pre_delete_collection=True,       # eski vektörleri temizle
    )
    _add_in_batches(store, chunks)
    _vector_store = store

    logger.info("Yeniden indeksleme tamamlandı: %d chunk.", len(chunks))
    return len(chunks)


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=GEMINI_API_KEY,
            temperature=0.3,
        )
        logger.info("LLM nesnesi oluşturuldu ve önbelleğe alındı.")
    return _llm


if __name__ == "__main__":
    # Elle yeniden indeksleme:  python rag.py
    logging.basicConfig(level=logging.INFO)
    count = reindex_vector_store()
    print(f"{count} chunk indekslendi.")
