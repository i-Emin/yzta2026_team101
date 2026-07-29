import os
import logging
from pathlib import Path

from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from dotenv import load_dotenv

from guardrails import (
    INPUT_REFUSAL_MESSAGE,
    OUTPUT_REFUSAL_MESSAGE,
    check_assistant_output,
    check_user_input,
    extract_text,
)

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RAG_DATA_DIR = Path(__file__).resolve().parent / "rag_data"
CHROMA_PERSIST_DIR = Path(__file__).resolve().parent / "chroma_store"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
GEMINI_MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = (
    "Sen genç yatırımcılara finansal okuryazarlık eğitimi veren, deneyimli ve sabırlı bir mentorsun.\n\n"
    "YANIT YAPISI — Her yanıtta şu sırayı takip et:\n"
    "1. AÇIKLAMA (zorunlu): Kullanıcının sorusunu, görselini veya belgesini önce açık ve anlaşılır bir dille ele al. "
    "Grafikteki temel hareketleri, önemli seviyeleri veya belgedeki kritik bilgileri eğitici bir üslupla özetle. "
    "Karmaşık kavramları somut örneklerle basitleştir.\n"
    "2. YÖNLENDİRİCİ SORU (opsiyonel, en fazla 1-2 adet): Açıklamanın ardından, yalnızca kullanıcının konuyu "
    "pekiştirmesini sağlamak amacıyla cevabının en sonuna en fazla 1 veya 2 düşündürücü soru ekle. "
    "Hiçbir zaman art arda çok sayıda soruyla kullanıcıyı darlama.\n\n"
    "TEMEL KURALLAR:\n"
    "- Asla doğrudan 'al', 'sat' veya 'şu varlığa yatırım yap' gibi kesin yatırım tavsiyesi verme.\n"
    "- Yalnızca sana verilen bağlamdaki (RAG) verileri ve genel finansal bilgini kullan.\n"
    "- Yanıtların her zaman önce açıklayıcı, sonra yönlendirici olsun; asla yalnızca soru soran bir yapıya dönüşme."
)


_vector_store: Chroma = None
_llm: ChatGoogleGenerativeAI = None


def _load_and_split_pdfs() -> list:
    logger.info("PDF aranıyor: %s", RAG_DATA_DIR)

    if not RAG_DATA_DIR.exists():
        logger.error("Klasör bulunamadı: %s", RAG_DATA_DIR)
        return []

    pdf_files = list(RAG_DATA_DIR.glob("*.pdf"))
    if not pdf_files:
        logger.error("Klasörde hiç .pdf dosyası yok: %s", RAG_DATA_DIR)
        return []

    documents = []
    for pdf_path in pdf_files:
        try:
            loader = PyMuPDFLoader(str(pdf_path))
            pages = loader.load()
            non_empty = [p for p in pages if p.page_content.strip()]
            if not non_empty:
                logger.warning("'%s' metin içermiyor (taranmış/resim bazlı olabilir).", pdf_path.name)
            else:
                logger.info("'%s' → %d sayfa yüklendi.", pdf_path.name, len(non_empty))
            documents.extend(non_empty)
        except Exception as e:
            logger.error("'%s' yüklenemedi: %s", pdf_path.name, e)

    if not documents:
        logger.error("Hiçbir PDF'den metin çıkarılamadı.")
        return []

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    chunks = splitter.split_documents(documents)
    logger.info("Toplam %d chunk oluşturuldu.", len(chunks))
    return chunks


def _get_vector_store() -> Chroma:
    global _vector_store
    if _vector_store is not None:
        return _vector_store

    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if CHROMA_PERSIST_DIR.exists() and any(CHROMA_PERSIST_DIR.iterdir()):
        logger.info("Mevcut ChromaDB deposu yükleniyor.")
        _vector_store = Chroma(
            persist_directory=str(CHROMA_PERSIST_DIR),
            embedding_function=embeddings,
        )
    else:
        chunks = _load_and_split_pdfs()
        if not chunks:
            raise ValueError(
                f"Vektör deposu oluşturulamadı: '{RAG_DATA_DIR}' dizininde "
                "okunabilir metin içeren PDF bulunamadı."
            )
        logger.info("ChromaDB deposu ilk kez oluşturuluyor.")
        _vector_store = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=str(CHROMA_PERSIST_DIR),
        )

    return _vector_store


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.3,
        )
        logger.info("LLM nesnesi oluşturuldu ve önbelleğe alındı.")
    return _llm


async def ask_mentor(
    query: str,
    history: list[dict] | None = None,
    file_base64: str | None = None,
    file_mime_type: str | None = None,
) -> str:
    llm = _get_llm()

    has_file = bool(file_base64 and file_mime_type)

    if not has_file:
        input_check = await check_user_input(query, llm)
        if not input_check.allowed:
            return INPUT_REFUSAL_MESSAGE

    vector_store = _get_vector_store()
    retriever = vector_store.as_retriever(search_kwargs={"k": 4})
    relevant_docs = retriever.invoke(query)

    context = "\n\n".join(doc.page_content for doc in relevant_docs)

    messages = [SystemMessage(content=SYSTEM_PROMPT)]

    for turn in (history or []):
        if turn.get("role") == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(content=turn["content"]))

    final_text = f"Bağlam:\n{context}\n\nSoru: {query}"

    if has_file:
        is_pdf = file_mime_type == "application/pdf"

        if is_pdf:
            file_block = {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{file_mime_type};base64,{file_base64}"
                },
            }
        else:
            file_block = {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{file_mime_type};base64,{file_base64}"
                },
            }

        human_content = [
            {"type": "text", "text": final_text},
            file_block,
        ]
        messages.append(HumanMessage(content=human_content))
    else:
        messages.append(HumanMessage(content=final_text))

    response = await llm.ainvoke(messages)
    answer = extract_text(response.content)

    if not has_file:
        output_check = await check_assistant_output(answer, llm)
        if not output_check.allowed:
            return OUTPUT_REFUSAL_MESSAGE

    return answer