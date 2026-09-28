"""API principal de ReconPanel (FastAPI).

Expone:
  - POST   /api/run                    lanza una herramienta y la asocia a una auditoría
  - POST   /api/audits                 crea una auditoría
  - GET    /api/history                lista las auditorías guardadas
  - GET    /api/audits/{id}/results    resultados de una auditoría
  - POST   /api/audits/{id}/report     genera (y guarda) el informe en Markdown
  - GET    /api/audits/{id}/report     recupera el último informe guardado
  - DELETE /api/kill/{pid}             mata un proceso en ejecución
  - GET    /api/ping                   health check
  - WS     /ws/{audit_id}              streaming del output en tiempo real

AVISO: ReconPanel ejecuta herramientas de seguridad reales contra el objetivo
indicado. Úsalo únicamente sobre sistemas para los que tengas autorización
expresa por escrito.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict

# Carga variables de un backend/.env si existe (p. ej. ANTHROPIC_API_KEY para
# el resumen ejecutivo con IA). Es opcional: si falta python-dotenv, seguimos.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import Database
from models import (
    AuditCreate,
    ReportRequest,
    ReportResponse,
    RunRequest,
    RunResponse,
)
from report import generate_report
from runner import ProcessRunner

app = FastAPI(title="ReconPanel API", version="0.1.0")

# El backend solo escucha en 127.0.0.1 y no usa cookies ni credenciales, así que
# permitimos cualquier origen. Esto cubre tanto el dev server de Vite
# (http://localhost:5173) como la app empaquetada, que carga el frontend desde
# file:// y envía el origen "null" (que una lista fija de orígenes bloquearía).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()
runner = ProcessRunner()


class ConnectionManager:
    """Mantiene los WebSockets abiertos por auditoría y difunde eventos."""

    def __init__(self) -> None:
        self._conns: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, audit_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._conns[audit_id].add(ws)

    def disconnect(self, audit_id: int, ws: WebSocket) -> None:
        self._conns[audit_id].discard(ws)
        if not self._conns[audit_id]:
            self._conns.pop(audit_id, None)

    async def broadcast(self, audit_id: int, message: dict) -> None:
        """Envía un mensaje a todos los sockets de esa auditoría."""
        dead: list[WebSocket] = []
        for ws in list(self._conns.get(audit_id, ())):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(audit_id, ws)


manager = ConnectionManager()


@app.get("/api/ping")
async def ping() -> dict:
    return {"status": "ok", "service": "reconpanel"}


@app.post("/api/audits")
async def create_audit(body: AuditCreate) -> dict:
    audit_id = await asyncio.to_thread(db.create_audit, body.target)
    return {"id": audit_id, "target": body.target, "status": "idle"}


@app.get("/api/history")
async def history(limit: int = 100) -> dict:
    items = await asyncio.to_thread(db.get_history, limit)
    return {"audits": items}


@app.get("/api/audits/{audit_id}/results")
async def audit_results(audit_id: int) -> dict:
    items = await asyncio.to_thread(db.get_results, audit_id)
    return {"results": items}


@app.post("/api/audits/{audit_id}/report", response_model=ReportResponse)
async def create_report(audit_id: int, body: ReportRequest | None = None) -> ReportResponse:
    """Genera el informe en Markdown de una auditoría y lo persiste.

    Con ``use_ai=true`` (y ``ANTHROPIC_API_KEY`` en el entorno) antepone un
    resumen ejecutivo redactado por Claude; si no, devuelve el informe base.
    """
    audit = await asyncio.to_thread(db.get_audit, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")

    results = await asyncio.to_thread(db.get_results, audit_id)
    use_ai = bool(body.use_ai) if body else False
    content = await asyncio.to_thread(
        generate_report, audit, results, use_ai=use_ai
    )
    await asyncio.to_thread(db.save_report, audit_id, content)
    saved = await asyncio.to_thread(db.get_report, audit_id)
    return ReportResponse(
        audit_id=audit_id,
        content=content,
        created_at=saved.get("created_at") if saved else None,
    )


@app.get("/api/audits/{audit_id}/report", response_model=ReportResponse)
async def get_report(audit_id: int) -> ReportResponse:
    """Recupera el último informe guardado de una auditoría."""
    report = await asyncio.to_thread(db.get_report, audit_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Esta auditoría aún no tiene informe")
    return ReportResponse(
        audit_id=audit_id,
        content=report["content"],
        created_at=report.get("created_at"),
    )


@app.post("/api/run", response_model=RunResponse)
async def run_command(body: RunRequest) -> RunResponse:
    """Lanza un comando, hace streaming por WebSocket y guarda el resultado.

    El proceso corre en una tarea de fondo: devolvemos el pid en cuanto el
    subproceso arranca, sin esperar a que termine.
    """
    command = body.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="El comando está vacío")

    loop = asyncio.get_running_loop()
    pid_future: asyncio.Future[int] = loop.create_future()

    async def emit(message: dict) -> None:
        await manager.broadcast(body.audit_id, message)

    async def on_started(pid: int) -> None:
        if not pid_future.done():
            pid_future.set_result(pid)

    async def task() -> None:
        await asyncio.to_thread(db.update_audit_status, body.audit_id, "running")
        try:
            result = await runner.run(
                command, emit, tool=body.tool, on_started=on_started
            )
            await asyncio.to_thread(
                db.save_result,
                body.audit_id,
                command,
                result.output,
                body.tool,
                None,
            )
            await asyncio.to_thread(
                db.update_audit_status, body.audit_id, result.status
            )
        except Exception as exc:  # noqa: BLE001 — reportamos cualquier fallo a la UI
            if not pid_future.done():
                pid_future.set_exception(exc)
            await emit({"type": "status", "data": "error", "error": str(exc)})
            await asyncio.to_thread(db.update_audit_status, body.audit_id, "error")

    asyncio.create_task(task())

    try:
        pid = await asyncio.wait_for(pid_future, timeout=10)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=500, detail="El proceso no arrancó a tiempo")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo lanzar ({type(exc).__name__}): {exc or 'sin mensaje'}",
        )

    return RunResponse(
        pid=pid, audit_id=body.audit_id, tool=body.tool, command=command
    )


@app.delete("/api/kill/{pid}")
async def kill_process(pid: int) -> dict:
    ok = await runner.kill(pid)
    if not ok:
        raise HTTPException(status_code=404, detail="Proceso no encontrado o ya finalizado")
    return {"killed": pid}


@app.websocket("/ws/{audit_id}")
async def ws_endpoint(ws: WebSocket, audit_id: int) -> None:
    await manager.connect(audit_id, ws)
    await ws.send_json({"type": "connected", "audit_id": audit_id})
    try:
        # No esperamos mensajes del cliente; solo mantenemos viva la conexión.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(audit_id, ws)


@app.on_event("shutdown")
async def _shutdown() -> None:
    for pid in runner.active_pids():
        await runner.kill(pid)
    db.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
