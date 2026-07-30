import os
import logging
from typing import Annotated, TypedDict

from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from dotenv import load_dotenv

from guardrails import (
    INPUT_REFUSAL_MESSAGE,
    OUTPUT_REFUSAL_MESSAGE,
    check_assistant_output,
    check_user_input,
    extract_text,
)
from rag import _get_llm, _get_vector_store

load_dotenv(override=True)

logger = logging.getLogger(__name__)

ANALYST_SYSTEM_PROMPT = (
    "Sen finansal grafikleri, tabloları ve belgeleri analiz eden uzman bir finansal analistsin.\n\n"
    "GÖREVIN:\n"
    "1. Yüklenen görseli veya belgeyi dikkatlice incele.\n"
    "2. Gördüğün temel hareketleri, kritik fiyat seviyelerini, trend yönlerini veya belgedeki "
    "önemli verileri açık ve anlaşılır bir dille türkçe olarak özetle.\n"
    "3. Teknik veya temel analiz kavramlarını kullanıyorsan, bunları kısa ve sade örneklerle açıkla.\n"
    "4. Açıklamanın sonunda konuyu pekiştirmek için en fazla 1-2 soru sor.\n\n"
    "KURAL: Asla kesin 'al' veya 'sat' tavsiyesi verme. Sadece analiz ve eğitim sun."
)

MENTOR_SYSTEM_PROMPT = (
    "Sen genç yatırımcılara finansal okuryazarlık eğitimi veren, deneyimli ve sabırlı bir mentorsun.\n\n"
    "YANIT YAPISI — Her yanıtta şu sırayı takip et:\n"
    "1. AÇIKLAMA (zorunlu): Kullanıcının sorusunu veya portföy durumunu açık ve anlaşılır bir dille ele al. "
    "Karmaşık kavramları somut örneklerle basitleştir. Eğer kullanıcı portföyünü yorumlamanı isterse, "
    "mevcut işlemlerine (kâr/zarar, varlık dağılımı, risk durumu) profesyonel ve eğitici bir bakış açısı sun.\n"
    "2. YÖNLENDİRİCİ SORU (opsiyonel, en fazla 1-2 adet): Açıklamanın ardından, yalnızca "
    "kullanıcının konuyu pekiştirmesini sağlamak amacıyla cevabının en sonuna en fazla 1 veya 2 "
    "düşündürücü soru ekle. Hiçbir zaman art arda çok sayıda soruyla kullanıcıyı darlama.\n\n"
    "TEMEL KURALLAR:\n"
    "- Asla doğrudan 'al', 'sat' veya 'şu varlığa yatırım yap' gibi kesin yatırım tavsiyesi verme.\n"
    "- Sana verilen bağlamdaki (RAG) verileri, kullanıcının profili ve portföy bilgilerini aktif olarak kullan.\n"
    "- Yanıtların her zaman önce açıklayıcı, eğitici, sonra yönlendirici olsun."
)


class AgentState(TypedDict):
    query: str
    history: list[dict]
    file_base64: str | None
    file_mime_type: str | None
    route: str
    answer: str
    user_profile: dict | None
    portfolio: list[dict] | None



def _build_file_block(file_base64: str, file_mime_type: str) -> dict:
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{file_mime_type};base64,{file_base64}"},
    }


def supervisor_node(state: AgentState) -> AgentState:
    has_file = bool(state.get("file_base64") and state.get("file_mime_type"))
    route = "analyst" if has_file else "mentor"
    logger.info("Supervisor → route: %s", route)
    return {**state, "route": route}


async def _retrieve_context(query: str, k: int) -> str:
    """
    RAG bağlamını asenkron olarak getirir.

    Senkron `retriever.invoke()` çağrısı event loop'u bloke ediyordu. Embedding
    artık yerel model yerine Google API'sinden alındığı için bu, CPU değil ağ
    beklemesi anlamına geliyor — tek worker'da eşzamanlı istekleri sıraya sokar.
    """
    vector_store = await run_in_threadpool(_get_vector_store)
    docs = await vector_store.asimilarity_search(query, k=k)
    return "\n\n".join(doc.page_content for doc in docs)


async def analyst_node(state: AgentState) -> AgentState:
    llm = _get_llm()

    context = await _retrieve_context(state["query"], k=3)

    messages: list = [SystemMessage(content=ANALYST_SYSTEM_PROMPT)]

    for turn in (state.get("history") or []):
        if turn.get("role") == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(content=turn["content"]))

    final_text = f"Bağlam:\n{context}\n\nSoru: {state['query']}"
    file_block = _build_file_block(state["file_base64"], state["file_mime_type"])
    messages.append(HumanMessage(content=[
        {"type": "text", "text": final_text},
        file_block,
    ]))

    response = await llm.ainvoke(messages)
    answer = extract_text(response.content)
    logger.info("Analyst node tamamlandı.")
    return {**state, "answer": answer}


async def mentor_node(state: AgentState) -> AgentState:
    llm = _get_llm()

    input_check = await check_user_input(state["query"], llm)
    if not input_check.allowed:
        return {**state, "answer": INPUT_REFUSAL_MESSAGE}

    context = await _retrieve_context(state["query"], k=4)

    messages: list = [SystemMessage(content=MENTOR_SYSTEM_PROMPT)]

    for turn in (state.get("history") or []):
        if turn.get("role") == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn.get("role") == "assistant":
            messages.append(AIMessage(content=turn["content"]))

    user_info = ""
    if state.get("user_profile"):
        up = state["user_profile"]
        risk = up.get("risk_profile", "Bilinmiyor")
        interests = ", ".join(up.get("interests", [])) if up.get("interests") else "Belirtilmemiş"
        user_info += f"\n[Kullanıcı Profili - Risk: {risk}, İlgi Alanları: {interests}]\n"

    if state.get("portfolio"):
        port_str = ", ".join([f"{p['symbol']} ({p['quantity']} adet, Ort. Maliyet: {p.get('average_cost',0):.2f})" for p in state["portfolio"]])
        user_info += f"[Güncel Portföy: {port_str}]\n"

    if user_info:
        user_info += "(Bu bilgileri kullanarak yanıtını kişiselleştir ve portföyünü yorumlamasını isterse değerlendir)\n"

    messages.append(HumanMessage(content=f"Bağlam:\n{context}\n{user_info}\nSoru: {state['query']}"))

    response = await llm.ainvoke(messages)
    answer = extract_text(response.content)

    output_check = await check_assistant_output(answer, llm)
    if not output_check.allowed:
        return {**state, "answer": OUTPUT_REFUSAL_MESSAGE}

    logger.info("Mentor node tamamlandı.")
    return {**state, "answer": answer}


def _route_after_supervisor(state: AgentState) -> str:
    return state["route"]


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("mentor", mentor_node)

    graph.set_entry_point("supervisor")

    graph.add_conditional_edges(
        "supervisor",
        _route_after_supervisor,
        {
            "analyst": "analyst",
            "mentor": "mentor",
        },
    )

    graph.add_edge("analyst", END)
    graph.add_edge("mentor", END)

    return graph.compile()


mentor_graph = build_graph()
