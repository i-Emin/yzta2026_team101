import { useEffect, useState } from "react";
import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TYPEWRITER_SPEED_MS = 10;

const PROSE_CLASSES = [
  "prose prose-slate max-w-none",
  "prose-p:text-base prose-p:leading-relaxed prose-p:my-2",
  "prose-li:text-base prose-li:leading-relaxed prose-li:my-0.5",
  "prose-ul:my-2 prose-ol:my-2 prose-ul:pl-5 prose-ol:pl-5",
  "prose-headings:font-semibold prose-headings:text-slate-800 prose-headings:mt-4 prose-headings:mb-2",
  "prose-strong:text-blue-700 prose-strong:font-semibold",
  "prose-a:text-blue-600 prose-a:underline",
  "prose-code:bg-slate-100 prose-code:text-blue-700 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-pre:p-4 prose-pre:overflow-x-auto prose-pre:text-sm",
  "prose-table:w-full prose-table:text-sm",
  "prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-slate-700",
  "prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-slate-100",
  "prose-blockquote:border-l-4 prose-blockquote:border-blue-400 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-600",
].join(" ");

const MD_COMPONENTS = {
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-slate-200">
      <table className="w-full" {...props}>{children}</table>
    </div>
  ),
  pre: ({ children, ...props }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm my-3" {...props}>
      {children}
    </pre>
  ),
};

function TypewriterMarkdown({ text }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    if (!text) return;

    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) clearInterval(interval);
    }, TYPEWRITER_SPEED_MS);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {displayed}
      </ReactMarkdown>
    </div>
  );
}

export default function MessageBubble({ role, content, timestamp, animate = false }) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-5`}>
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1 ${
          isUser ? "bg-slate-700" : "bg-finsim-primary"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className={`flex flex-col max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        <span className="text-xs text-slate-400 mb-1.5 px-1">
          {isUser ? "Siz" : "FinSim Asistan"} • {timestamp}
        </span>

        <div
          className={`rounded-2xl shadow-sm ${
            isUser
              ? "bg-finsim-primary text-white rounded-tr-sm px-5 py-4 text-base leading-relaxed whitespace-pre-wrap"
              : "bg-slate-50 border border-slate-200 rounded-tl-sm px-5 py-4"
          }`}
        >
          {isUser ? (
            content
          ) : animate ? (
            <TypewriterMarkdown text={content} />
          ) : (
            <div className={PROSE_CLASSES}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
