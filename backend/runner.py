"""Gestor de subprocesos asíncrono para ReconPanel.

Lanza herramientas externas (nmap, nuclei, gobuster, ...) sin bloquear el
event loop, hace streaming del output línea a línea hacia un callback (que
en main.py reenvía por WebSocket) y mantiene un registro de procesos vivos
para poder matarlos desde la UI.
"""
from __future__ import annotations

import asyncio
import os
import signal
import sys
from typing import Awaitable, Callable, Optional

# Callback que recibe cada evento (dict serializable a JSON).
Emit = Callable[[dict], Awaitable[None]]

IS_WINDOWS = sys.platform.startswith("win")


class RunResult:
    """Resultado final de una ejecución."""

    def __init__(self, pid: int, returncode: int, output: str, killed: bool) -> None:
        self.pid = pid
        self.returncode = returncode
        self.output = output
        self.killed = killed

    @property
    def status(self) -> str:
        if self.killed:
            return "error"
        return "done" if self.returncode == 0 else "error"


class ProcessRunner:
    """Lanza y supervisa subprocesos de herramientas de auditoría."""

    def __init__(self) -> None:
        # pid -> proceso activo, para poder matarlos.
        self._procs: dict[int, asyncio.subprocess.Process] = {}

    async def run(
        self,
        command: str,
        emit: Emit,
        *,
        tool: Optional[str] = None,
        on_started: Optional[Callable[[int], Awaitable[None]]] = None,
    ) -> RunResult:
        """Ejecuta ``command`` en una shell y hace streaming del output.

        Cada línea se envía mediante ``emit({"type": "line", "data": ...})``.
        Devuelve un :class:`RunResult` con el output completo acumulado.
        """
        # stderr se fusiona en stdout para mantener el orden cronológico real
        # de las líneas tal y como las emite la herramienta.
        kwargs: dict = {
            "stdout": asyncio.subprocess.PIPE,
            "stderr": asyncio.subprocess.STDOUT,
        }
        if IS_WINDOWS:
            # Grupo propio para poder enviar señales/kill al árbol completo.
            kwargs["creationflags"] = getattr(
                __import__("subprocess"), "CREATE_NEW_PROCESS_GROUP", 0
            )
        else:
            kwargs["start_new_session"] = True

        proc = await asyncio.create_subprocess_shell(command, **kwargs)
        pid = proc.pid
        self._procs[pid] = proc

        if on_started is not None:
            await on_started(pid)
        # "start" debe llegar SIEMPRE antes del primer "line".
        await emit({"type": "start", "pid": pid, "tool": tool, "command": command})

        lines: list[str] = []
        killed = False
        try:
            assert proc.stdout is not None
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                lines.append(line)
                await emit({"type": "line", "data": line, "pid": pid})
            await proc.wait()
        except asyncio.CancelledError:
            # La conexión se cae o se cancela la tarea: matamos el proceso.
            killed = True
            await self._terminate(proc)
            raise
        finally:
            self._procs.pop(pid, None)

        returncode = proc.returncode if proc.returncode is not None else -1
        result = RunResult(pid, returncode, "\n".join(lines), killed)
        await emit(
            {
                "type": "status",
                "data": result.status,
                "pid": pid,
                "returncode": returncode,
            }
        )
        return result

    async def kill(self, pid: int) -> bool:
        """Mata un proceso activo por su pid. Devuelve True si existía."""
        proc = self._procs.get(pid)
        if proc is None:
            return False
        await self._terminate(proc)
        self._procs.pop(pid, None)
        return True

    def active_pids(self) -> list[int]:
        return list(self._procs.keys())

    async def _terminate(self, proc: asyncio.subprocess.Process) -> None:
        """Termina el proceso y su árbol de hijos de forma multiplataforma."""
        if proc.returncode is not None:
            return
        try:
            if IS_WINDOWS:
                # taskkill /T mata también los procesos hijos que cuelgan
                # de la shell (nmap, nuclei, etc. lanzados por cmd).
                killer = await asyncio.create_subprocess_exec(
                    "taskkill", "/F", "/T", "/PID", str(proc.pid),
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await killer.wait()
            else:
                # Matamos el grupo de procesos creado con start_new_session.
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            pass
        except Exception:
            # Último recurso: kill directo del proceso de la shell.
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
