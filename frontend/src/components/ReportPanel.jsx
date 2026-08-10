import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:8000";

/**
 * Panel de generación de informe para la fase 6.
 *
 * Compila los resultados guardados de la auditoría activa en un informe
 * Markdown (opcionalmente con un resumen ejecutivo redactado por Claude) y
 * permite descargarlo. Requiere una auditoría con al menos una ejecución.
 */
export default function ReportPanel({ auditId, target }) {
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  // Al cambiar de auditoría, recupera un informe previo si existe.
  useEffect(() => {
    setReport(null);
    setError(null);
    if (!auditId) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/audits/${auditId}/report`);
        if (r.ok && alive) {
          const data = await r.json();
          setReport(data.content);
        }
      } catch {
        /* aún no hay informe: normal */
      }
    })();
    return () => {
      alive = false;
    };
  }, [auditId]);

  const generate = useCallback(async () => {
    if (!auditId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/audits/${auditId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_ai: useAi }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setReport(data.content);
    } catch (e) {
      setError(e.message || "No se pudo generar el informe");
    } finally {
      setLoading(false);
    }
  }, [auditId, useAi]);

  const download = useCallback(() => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (target || "objetivo").replace(/[^a-z0-9.-]/gi, "_");
    a.href = url;
    a.download = `reconpanel-informe-${safe}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, target]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold text-slate-100">
        Informe de la auditoría
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Compila los resultados guardados de la auditoría activa en un documento
        Markdown descargable.
      </p>

      {!auditId ? (
        <p className="mt-3 rounded border border-slate-800 bg-[#0a0e16] p-2 text-xs text-amber-300">
          Ejecuta al menos una herramienta sobre un target para poder generar el
          informe.
        </p>
      ) : (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="accent-sky-500"
            />
            Añadir resumen ejecutivo con IA
            <span className="text-slate-500">(requiere ANTHROPIC_API_KEY)</span>
          </label>

          <div className="mt-3 flex gap-2">
            <button
              onClick={generate}
              disabled={loading}
              className="rounded bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white disabled:opacity-40"
            >
              {loading ? "Generando…" : "Generar informe"}
            </button>
            <button
              onClick={download}
              disabled={!report}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Descargar .md
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {report && (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-[#0a0e16] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {report}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
