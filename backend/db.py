"""Capa de persistencia SQLite para ReconPanel.

Guarda auditorías y los resultados de cada ejecución de herramienta.
Los métodos son síncronos (sqlite3 de stdlib); desde el código async se
invocan con ``asyncio.to_thread`` para no bloquear el event loop.
"""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# La BBDD vive junto al backend para que sea portable con la app empaquetada.
DEFAULT_DB_PATH = Path(__file__).resolve().parent / "reconpanel.db"


def _utcnow() -> str:
    """Timestamp ISO-8601 en UTC, estable para ordenar y exportar."""
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Wrapper fino sobre SQLite con conexión única y thread-safe."""

    def __init__(self, path: str | Path = DEFAULT_DB_PATH) -> None:
        self.path = str(path)
        # check_same_thread=False porque uvicorn/asyncio puede tocar la
        # conexión desde distintos hilos (to_thread). Serializamos con un Lock.
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS audits (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    target      TEXT    NOT NULL,
                    status      TEXT    NOT NULL DEFAULT 'idle',
                    created_at  TEXT    NOT NULL
                );

                CREATE TABLE IF NOT EXISTS results (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    audit_id    INTEGER NOT NULL,
                    tool        TEXT,
                    command     TEXT    NOT NULL,
                    output      TEXT    NOT NULL DEFAULT '',
                    severity    TEXT,
                    created_at  TEXT    NOT NULL,
                    FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_results_audit
                    ON results(audit_id);

                CREATE TABLE IF NOT EXISTS reports (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    audit_id    INTEGER NOT NULL UNIQUE,
                    content     TEXT    NOT NULL,
                    created_at  TEXT    NOT NULL,
                    FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE
                );
                """
            )
            self._conn.commit()

    # ------------------------------------------------------------------ #
    # Auditorías
    # ------------------------------------------------------------------ #
    def create_audit(self, target: str, status: str = "idle") -> int:
        """Crea una auditoría y devuelve su id."""
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO audits (target, status, created_at) VALUES (?, ?, ?)",
                (target, status, _utcnow()),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def update_audit_status(self, audit_id: int, status: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE audits SET status = ? WHERE id = ?",
                (status, audit_id),
            )
            self._conn.commit()

    def get_history(self, limit: int = 100) -> list[dict[str, Any]]:
        """Devuelve las auditorías más recientes con su nº de resultados."""
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT a.id, a.target, a.status, a.created_at,
                       COUNT(r.id) AS result_count
                FROM audits a
                LEFT JOIN results r ON r.audit_id = a.id
                GROUP BY a.id
                ORDER BY a.id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_audit(self, audit_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM audits WHERE id = ?", (audit_id,)
            ).fetchone()
        return dict(row) if row else None

    # ------------------------------------------------------------------ #
    # Resultados
    # ------------------------------------------------------------------ #
    def save_result(
        self,
        audit_id: int,
        command: str,
        output: str,
        tool: Optional[str] = None,
        severity: Optional[str] = None,
    ) -> int:
        """Persiste el resultado de una ejecución y devuelve su id."""
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO results (audit_id, tool, command, output, severity, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (audit_id, tool, command, output, severity, _utcnow()),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def get_results(self, audit_id: int) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM results WHERE audit_id = ? ORDER BY id ASC",
                (audit_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    # ------------------------------------------------------------------ #
    # Reportes generados por IA
    # ------------------------------------------------------------------ #
    def save_report(self, audit_id: int, content: str) -> int:
        """Guarda o reemplaza el reporte IA de una auditoría."""
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO reports (audit_id, content, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(audit_id) DO UPDATE SET
                    content = excluded.content,
                    created_at = excluded.created_at
                """,
                (audit_id, content, _utcnow()),
            )
            self._conn.commit()
            return int(cur.lastrowid)

    def get_report(self, audit_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM reports WHERE audit_id = ?", (audit_id,)
            ).fetchone()
        return dict(row) if row else None

    def close(self) -> None:
        with self._lock:
            self._conn.close()
