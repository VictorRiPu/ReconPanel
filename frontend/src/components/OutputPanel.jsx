import { useEffect, useRef, useState } from "react";

// Clasifica una línea para colorearla.
function lineClass(text) {
  const t = text.toLowerCase();
  if (/\b(error|fail|failed|fatal|refused|denied|critical)\b/.test(t))
    return "text-red-400";
  if (/\b(warn|warning|timeout|deprecated)\b/.test(t)) return "text-amber-300";
  if (/\b(open|found|success|ok|200|up|vulnerable|discovered)\b/.test(t))
    return "text-emerald-400";
  return "text-slate-300";
}

export default function OutputPanel({ output, onClear }) {
  const scrollRef = useRef(null);
  // autoScroll se desactiva si el usuario sube a revisar y se reactiva
  // cuando vuelve al fondo.
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const exportTxt = () => {
    const text = output.map((l) => l.data).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconpanel-output-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-800 bg-[#0a0e16]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span>OUTPUT</span>
          <span className="text-slate-600">·</span>
          <span>{output.length} líneas</span>
          {!autoScroll && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-amber-300">
              auto-scroll en pausa
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClear}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Limpiar
          </button>
          <button
            onClick={exportTxt}
            disabled={output.length === 0}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Exportar .txt
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed"
      >
        {output.length === 0 ? (
          <p className="text-slate-600">
            Sin salida todavía. Ejecuta una herramienta para ver el output en
            tiempo real.
          </p>
        ) : (
          output.map((l, i) => (
            <div key={i} className={lineClass(l.data)}>
              <span className="select-none text-slate-700">
                [{String(l.pid).padStart(5, " ")}]{" "}
              </span>
              {l.data || " "}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
