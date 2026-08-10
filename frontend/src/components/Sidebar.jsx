import { PHASES } from "../data/phases.js";

export default function Sidebar({ currentPhase, onSelect }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0a0e16]">
      <div className="px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight text-slate-100">
          Recon<span className="text-sky-400">Panel</span>
        </h1>
        <p className="text-[11px] text-slate-500">Auditoría web · 6 fases</p>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {PHASES.map((phase) => {
          const active = phase.id === currentPhase;
          return (
            <button
              key={phase.id}
              onClick={() => onSelect(phase.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: phase.color }}
              />
              <span className="truncate">{phase.title}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3 text-[10px] leading-relaxed text-slate-600">
        ⚠️ Solo para sistemas con autorización expresa.
      </div>
    </aside>
  );
}
