
import { useState, useRef, useEffect } from "react";
import { Send, Info, Paperclip, X, FileText } from "lucide-react";
import { sendChatMessage } from "../services/api";
import MessageBubble from "../components/MessageBubble";
import TypingIndicator from "../components/TypingIndicator";

const formatTime = (date) =>
  date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Merhaba! Ben FinSim eğitim asistanınızım. Finansal kavramlar, borsa terimleri veya yatırım stratejileri hakkında sorularınızı yanıtlamak için buradayım.\n\nSize nasıl yardımcı olabilirim?",
  timestamp: formatTime(new Date()),
};

const SUGGESTION_PILLS = [
  "Portföyümü analiz et",
  "BIST 100 nedir?",
  "Risk profilime göre strateji önerir misin?"
];

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isPdfFile(file) {
  return file.type === "application/pdf";
}

export default function ChatView() {
  const [messages, setMessages]       = useState([WELCOME_MESSAGE]);
  const [inputText, setInputText]     = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [sessionId, setSessionId]     = useState(null);
  const [fileObj, setFileObj]         = useState(null);
  const [fileBase64, setFileBase64]   = useState(null);
  const [fileMime, setFileMime]       = useState(null);
  const [previewUrl, setPreviewUrl]   = useState(null);

  const scrollRef = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dataUrl = await readFileAsDataURL(file);
    const base64  = dataUrl.split(",")[1];

    setFileObj(file);
    setFileMime(file.type);
    setFileBase64(base64);
    setPreviewUrl(isPdfFile(file) ? null : dataUrl);

    e.target.value = "";
  };

  const clearFile = () => {
    setFileObj(null);
    setFileBase64(null);
    setFileMime(null);
    setPreviewUrl(null);
  };

  const handleSend = async (forcedText = null) => {
    const textToSend = typeof forcedText === "string" ? forcedText : inputText;
    const trimmed = textToSend.trim();
    if ((!trimmed && !fileBase64) || isLoading) return;

    const isPdf  = fileMime === "application/pdf";
    const label  = trimmed || (isPdf ? "📄 PDF gönderildi" : "📎 Görsel gönderildi");

    const userMessage = {
      role: "user",
      content: label,
      timestamp: formatTime(new Date()),
      attachmentPreview: previewUrl,
      attachmentName: fileObj?.name ?? null,
      attachmentIsPdf: isPdf && !!fileObj,
    };

    setMessages((prev) => [...prev, userMessage]);
    if (typeof forcedText !== "string") setInputText("");

    const sentBase64 = fileBase64;
    const sentMime   = fileMime;
    clearFile();
    setIsLoading(true);

    try {
      const { reply, sessionId: newSessionId } = await sendChatMessage(
        trimmed || (isPdf ? "Bu belgeyi analiz eder misin?" : "Bu görseli analiz eder misin?"),
        sessionId,
        sentBase64,
        sentMime
      );
      setSessionId(newSessionId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, timestamp: formatTime(new Date()) },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Üzgünüm, şu anda sunucuya ulaşamıyorum. Lütfen kısa süre sonra tekrar deneyin.",
          timestamp: formatTime(new Date()),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text) => {
    handleSend(text);
  };

  const canSend = (inputText.trim() || fileBase64) && !isLoading;

  return (
    <div className="h-full flex flex-col">
      <header className="px-10 pt-8 pb-4 shrink-0">
        <h1 className="text-3xl font-bold text-slate-900">Finans Chatbotu</h1>
        <p className="text-slate-500 mt-1">
          Borsa ve finans konularında öğretici destek alın.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto chat-scroll px-10 py-6"
      >
        <div className="max-w-4xl mx-auto">
          {messages.map((msg, idx) => (
            <div key={idx}>
              {msg.attachmentPreview && (
                <div className={`flex mb-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <img
                    src={msg.attachmentPreview}
                    alt="Gönderilen görsel"
                    className="max-h-48 max-w-xs rounded-2xl border border-slate-200 shadow-sm object-cover"
                  />
                </div>
              )}
              {msg.attachmentIsPdf && (
                <div className={`flex mb-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-2xl shadow-sm text-xs font-medium max-w-xs">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{msg.attachmentName}</span>
                  </div>
                </div>
              )}
              <MessageBubble
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                animate={msg.role === "assistant" && idx === messages.length - 1}
              />
            </div>
          ))}
          {isLoading && <TypingIndicator />}
        </div>
      </div>

      <div className="px-10 pb-6 pt-3 bg-finsim-bg shrink-0">
        <div className="max-w-4xl mx-auto">

          {fileObj && (
            <div className="mb-3 flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm w-fit max-w-xs">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Önizleme"
                  className="h-14 w-14 rounded-xl object-cover border border-slate-100 shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-red-500" />
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-slate-700 truncate">
                  {fileObj.name}
                </span>
                <span className="text-xs text-slate-400">
                  {(fileObj.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <button
                onClick={clearFile}
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors ml-1 shrink-0"
                aria-label="Dosyayı kaldır"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Suggestion Pills */}
          {!fileObj && messages.length <= 2 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {SUGGESTION_PILLS.map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(pill)}
                  disabled={isLoading}
                  className="text-xs font-medium bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition shadow-sm disabled:opacity-50"
                >
                  {pill}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf, .jpg, .jpeg, .png"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              onClick={() => fileRef.current?.click()}
              disabled={isLoading}
              className="group relative w-12 h-12 rounded-full border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm shrink-0"
              aria-label="Dosya ekle"
            >
              <Paperclip className="w-5 h-5 text-slate-500" />
              
              {/* Custom Tailwind Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max max-w-[220px] opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-1 group-hover:translate-y-0 transition-all duration-200 z-50 pointer-events-none">
                <div className="bg-white text-slate-700 text-xs font-medium leading-relaxed px-4 py-2.5 rounded-xl shadow-lg border border-slate-200 text-center relative">
                  Finansal grafiklerinizi (JPG/PNG) veya şirket raporlarınızı (PDF) yükleyebilirsiniz
                  {/* Arrow */}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45"></div>
                </div>
              </div>
            </button>

            <div className="flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={
                  fileBase64
                    ? "Dosya hakkında soru sorun (opsiyonel)…"
                    : "Borsayla ilgili bir soru sorun..."
                }
                className="w-full px-5 py-4 rounded-full border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-finsim-primary focus:border-transparent shadow-sm disabled:opacity-60"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!canSend}
              className="w-12 h-12 rounded-full bg-finsim-primary hover:bg-finsim-primaryDark disabled:bg-slate-300 flex items-center justify-center transition-colors shadow-md shrink-0"
              aria-label="Gönder"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5" />
            <span>Yatırım tavsiyesi vermez, eğitici bilgi sunar.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
