import { useState } from "react";
import { interpolate } from "../data/phases.js";

const TAG_STYLES = {
  pasivo: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  activo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  auto: "bg-red-500/15 text-red-300 border-red-500/30",
};

// Indicador visual por estado de ejecución.
function StatusBadge({ state }) {
  switch (state) {
    case "running":
      return (
        <span className="flex items-center gap-1 text-xs text-sky-300">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          ejecutando
        </span>
      );
    case "done":
      return <span className="text-xs text-emerald-400">✓ done</span>;
    case "error":
      return <span className="text-xs text-red-400">✗ error</span>;
    default:
      return <span className="text-xs text-slate-600">idle</span>;
  }
}

export default function ToolCard({ tool, target, color, onRun, getState }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const disabled = !target.trim();

  const copy = async (cmd, idx) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(idx);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard puede fallar sin https; ignoramos */
    }
  };

  // Estado agregado de la herramienta = el "más activo" de sus comandos.
  const toolState = tool.commands
    .map((c) => getState(`${tool.name}::${c}`))
    .reduce((acc, s) => {
      const rank = { running: 3, error: 2, done: 1, idle: 0 };
      return rank[s] > rank[acc] ? s : acc;
    }, "idle");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`h-4 w-4 text-slate-500 transition-transform ${
              open ? "rotate-90" : ""
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          <span className="font-mono text-sm font-semibold text-slate-100">
            {tool.name}
          </span>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              TAG_STYLES[tool.tag] || "border-slate-700 text-slate-400"
            }`}
          >
            {tool.tag}
          </span>
        </div>
        <StatusBadge state={toolState} />
      </button>

      {open && (
        <div className="border-t border-slate-800 px-4 py-3">
          <p className="mb-3 text-xs text-slate-400">{tool.description}</p>
          <div className="space-y-2">
            {tool.commands.map((cmd, idx) => {
              const interpolated = interpolate(cmd, target);
              const cmdId = `${tool.name}::${cmd}`;
              const state = getState(cmdId);
              return (
                <div
                  key={idx}
                  className="rounded border border-slate-800 bg-[#0a0e16] p-2"
                >
                  <code className="block break-all font-mono text-xs text-slate-300">
                    {interpolated}
                  </code>
                  <div className="mt-2 flex items-center justify-between">
                    <StatusBadge state={state} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => copy(interpolated, idx)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {copied === idx ? "Copiado" : "Copiar"}
                      </button>
                      <button
                        onClick={() => onRun(cmdId, tool.name, interpolated)}
                        disabled={disabled || state === "running"}
                        title={disabled ? "Introduce un target primero" : ""}
                        className="rounded px-2 py-1 text-xs font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ backgroundColor: color }}
                      >
                        Ejecutar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
