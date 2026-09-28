import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import ToolCard from "./components/ToolCard.jsx";
import ReportPanel from "./components/ReportPanel.jsx";
import OutputPanel from "./components/OutputPanel.jsx";
import { PHASES } from "./data/phases.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

const API = "http://localhost:8000";

export default function App() {
  const [currentPhase, setCurrentPhase] = useState(PHASES[0].id);
  const [target, setTarget] = useState("");
  const [auditId, setAuditId] = useState(null);
  const [auditTarget, setAuditTarget] = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);
  // cmdId -> pid de la última ejecución de ese comando.
  const [runningTools, setRunningTools] = useState({});
  // Último error al lanzar una ejecución (POST /api/run), visible en la UI:
  // sin esto, un fallo quedaba solo en la consola y el botón "Ejecutar"
  // parecía no hacer nada.
  const [runError, setRunError] = useState(null);

  const { output, statuses, wsReady, connect, disconnect, clearOutput } =
    useWebSocket();

  // Cola de ejecuciones pendientes hasta que wsReady === true.
  const pendingRuns = useRef([]);

  // ---- Health check del backend ----
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/ping`);
        if (alive) setBackendOnline(r.ok);
      } catch {
        if (alive) setBackendOnline(false);
      }
    };
    check();
    const id = setInterval(check, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Lanza realmente el POST /api/run (solo se llama con wsReady === true).
  const doRun = useCallback(
    async (run) => {
      try {
        const res = await fetch(`${API}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: run.command,
            audit_id: run.auditId,
            tool: run.tool,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // Asocia el cmdId con el pid para poder leer su estado.
        setRunningTools((prev) => ({ ...prev, [run.cmdId]: data.pid }));
        setRunError(null);
      } catch (e) {
        console.error("Error al ejecutar:", e);
        setRunError(e.message || "No se pudo lanzar el comando");
      }
    },
    []
  );

  // Cuando el WS queda listo, vaciamos la cola de ejecuciones pendientes.
  useEffect(() => {
    if (wsReady && pendingRuns.current.length > 0) {
      const queued = [...pendingRuns.current];
      pendingRuns.current = [];
      queued.forEach(doRun);
    }
  }, [wsReady, doRun]);

  // Crea una auditoría nueva y conecta el WS de esa auditoría.
  const ensureAudit = useCallback(async () => {
    const r = await fetch(`${API}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    if (!r.ok) throw new Error("No se pudo crear la auditoría");
    const data = await r.json();
    setAuditId(data.id);
    setAuditTarget(target);
    connect(data.id);
    return data.id;
  }, [target, connect]);

  // Handler que reciben las ToolCards al pulsar "Ejecutar".
  const handleRun = useCallback(
    async (cmdId, tool, command) => {
      if (!target.trim()) return; // nunca ejecutamos sin target
      if (!backendOnline) return;

      const sameAudit = auditId && auditTarget === target;
      const run = {
        cmdId,
        tool,
        command,
        auditId: sameAudit ? auditId : null,
      };

      if (sameAudit && wsReady) {
        // Todo listo: ejecutamos ya.
        doRun(run);
        return;
      }

      // Necesitamos (re)crear o reconectar el WS: encolamos y conectamos.
      let id;
      if (sameAudit) {
        // La auditoría existe pero el WS no está listo: reconectamos.
        id = auditId;
        connect(id);
      } else {
        id = await ensureAudit();
      }
      run.auditId = id;
      pendingRuns.current.push(run);
    },
    [target, backendOnline, auditId, auditTarget, wsReady, doRun, ensureAudit, connect]
  );

  // Si cambia el target respecto al de la auditoría activa, la cerramos:
  // la próxima ejecución creará una auditoría nueva para el nuevo target.
  useEffect(() => {
    if (auditTarget !== null && target !== auditTarget) {
      disconnect();
      setAuditId(null);
      setAuditTarget(null);
      setRunningTools({});
    }
  }, [target, auditTarget, disconnect]);

  // Estado idle/running/done/error de un comando concreto.
  const getState = useCallback(
    (cmdId) => {
      const pid = runningTools[cmdId];
      if (!pid) return "idle";
      return statuses[pid]?.status || "running";
    },
    [runningTools, statuses]
  );

  const phase = PHASES.find((p) => p.id === currentPhase);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-200">
      <Sidebar currentPhase={currentPhase} onSelect={setCurrentPhase} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          target={target}
          onTargetChange={setTarget}
          backendOnline={backendOnline}
          wsReady={wsReady}
          auditId={auditId}
        />

        {runError && (
          <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <span>No se pudo ejecutar: {runError}</span>
            <button
              onClick={() => setRunError(null)}
              className="shrink-0 text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        <main className="grid min-h-0 flex-1 grid-cols-2 gap-4 p-4">
          {/* Columna izquierda: herramientas de la fase */}
          <section className="flex min-h-0 flex-col">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-slate-100">
                {phase.title}
              </h2>
              <p className="text-xs text-slate-500">{phase.description}</p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {phase.id === "report" && (
                <ReportPanel auditId={auditId} target={auditTarget || target} />
              )}
              {phase.tools.map((tool) => (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  target={target}
                  color={phase.color}
                  onRun={handleRun}
                  getState={getState}
                />
              ))}
            </div>
          </section>

          {/* Columna derecha: output en tiempo real */}
          <section className="min-h-0">
            <OutputPanel output={output} onClear={clearOutput} />
          </section>
        </main>
      </div>
    </div>
  );
}
