export default function Topbar({
  target,
  onTargetChange,
  backendOnline,
  wsReady,
  auditId,
}) {
  return (
    <header className="flex items-center gap-4 border-b border-slate-800 bg-[#0a0e16] px-6 py-3">
      <div className="flex flex-1 items-center gap-3">
        <label className="text-xs font-medium text-slate-400">Target</label>
        <input
          value={target}
          onChange={(e) => onTargetChange(e.target.value)}
          placeholder="example.com  o  https://example.com"
          className="w-full max-w-md rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
        />
        {!target.trim() && (
          <span className="text-xs text-amber-400">
            Introduce un target para habilitar la ejecución
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs">
        {auditId && (
          <span className="text-slate-500">
            audit #<span className="text-slate-300">{auditId}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              backendOnline ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span className={backendOnline ? "text-emerald-300" : "text-red-400"}>
            {backendOnline ? "backend online" : "backend desconectado"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              wsReady ? "bg-sky-400" : "bg-slate-600"
            }`}
          />
          <span className={wsReady ? "text-sky-300" : "text-slate-500"}>
            {wsReady ? "ws listo" : "ws…"}
          </span>
        </span>
      </div>
    </header>
  );
}
