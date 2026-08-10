"""Generación de informes de auditoría para ReconPanel.

A partir de los resultados guardados de una auditoría construye un informe en
Markdown. El informe base es 100 % determinista (no requiere red ni claves): un
resumen estructurado por herramienta con los hallazgos más relevantes.

Opcionalmente, si existe la variable de entorno ``ANTHROPIC_API_KEY`` y se
solicita, se añade un **resumen ejecutivo** redactado por Claude a partir de los
mismos datos. Si la llamada falla (sin clave, sin red, error de API...) se
degrada con elegancia: se devuelve el informe base y se anota el motivo.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

# Nº máximo de caracteres de output por herramienta que enviamos al modelo /
# incrustamos en el informe, para no generar documentos gigantescos.
MAX_OUTPUT_CHARS = 4000
MODEL = "claude-opus-5"


def _now_human() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _truncate(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… [truncado, {len(text) - limit} caracteres más]"


def build_base_report(audit: dict[str, Any], results: list[dict[str, Any]]) -> str:
    """Construye el informe base en Markdown (sin IA)."""
    target = audit.get("target", "—")
    lines: list[str] = [
        f"# Informe de auditoría — {target}",
        "",
        f"- **Auditoría:** #{audit.get('id')}",
        f"- **Objetivo:** `{target}`",
        f"- **Estado:** {audit.get('status', '—')}",
        f"- **Generado:** {_now_human()}",
        f"- **Herramientas ejecutadas:** {len(results)}",
        "",
        "> ⚠️ Documento generado automáticamente por ReconPanel a partir del "
        "output de las herramientas. Revísalo y valida los hallazgos antes de "
        "usarlo como entregable.",
        "",
        "---",
        "",
        "## Detalle por herramienta",
        "",
    ]

    if not results:
        lines.append("_No hay resultados registrados para esta auditoría._")
        return "\n".join(lines)

    for i, r in enumerate(results, start=1):
        tool = r.get("tool") or "comando"
        lines.append(f"### {i}. {tool}")
        lines.append("")
        lines.append(f"- **Comando:** `{r.get('command', '')}`")
        lines.append(f"- **Fecha:** {r.get('created_at', '—')}")
        lines.append("")
        lines.append("```text")
        lines.append(_truncate(r.get("output", "")) or "(sin salida)")
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def _build_prompt(target: str, results: list[dict[str, Any]]) -> str:
    """Compone el prompt para el resumen ejecutivo."""
    blocks = []
    for r in results:
        tool = r.get("tool") or "comando"
        blocks.append(
            f"## Herramienta: {tool}\n"
            f"Comando: {r.get('command', '')}\n"
            f"Salida:\n{_truncate(r.get('output', ''))}"
        )
    joined = "\n\n".join(blocks) if blocks else "(sin resultados)"
    return (
        f"Eres un analista de seguridad ofensiva. A partir del output de varias "
        f"herramientas de auditoría ejecutadas contra el objetivo autorizado "
        f"'{target}', redacta un RESUMEN EJECUTIVO en español y en Markdown.\n\n"
        "Incluye, si la información lo permite:\n"
        "1. Resumen de la superficie de ataque descubierta (dominios, puertos, "
        "servicios, tecnologías).\n"
        "2. Hallazgos ordenados por severidad estimada (crítica/alta/media/baja).\n"
        "3. Recomendaciones de remediación concretas.\n\n"
        "No inventes hallazgos que no aparezcan en el output. Si un dato no está, "
        "indícalo. Sé conciso y técnico.\n\n"
        "=== OUTPUT DE LAS HERRAMIENTAS ===\n"
        f"{joined}"
    )


def _ai_summary(target: str, results: list[dict[str, Any]]) -> str:
    """Genera un resumen ejecutivo con Claude. Lanza excepción si no puede."""
    # Import diferido: la app funciona aunque 'anthropic' no esté instalado,
    # siempre que no se pida el resumen IA.
    from anthropic import Anthropic

    client = Anthropic()  # lee ANTHROPIC_API_KEY del entorno
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": _build_prompt(target, results)}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    return "\n".join(parts).strip()


def generate_report(
    audit: dict[str, Any],
    results: list[dict[str, Any]],
    *,
    use_ai: bool = False,
) -> str:
    """Genera el informe completo en Markdown.

    Si ``use_ai`` y hay ``ANTHROPIC_API_KEY``, antepone un resumen ejecutivo
    redactado por Claude. Cualquier fallo degrada al informe base con una nota.
    """
    base = build_base_report(audit, results)

    if not use_ai:
        return base

    if not os.getenv("ANTHROPIC_API_KEY"):
        note = (
            "> ℹ️ Resumen ejecutivo con IA no disponible: falta la variable de "
            "entorno `ANTHROPIC_API_KEY`. Se muestra únicamente el informe base.\n"
        )
        return f"{note}\n{base}"

    try:
        summary = _ai_summary(audit.get("target", "—"), results)
    except Exception as exc:  # noqa: BLE001 — degradamos siempre a informe base
        note = (
            "> ⚠️ No se pudo generar el resumen ejecutivo con IA "
            f"({type(exc).__name__}: {exc}). Se muestra el informe base.\n"
        )
        return f"{note}\n{base}"

    return (
        "## Resumen ejecutivo (IA)\n\n"
        f"{summary}\n\n"
        "---\n\n"
        f"{base}"
    )
