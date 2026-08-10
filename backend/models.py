"""Pydantic models para la API de ReconPanel."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AuditCreate(BaseModel):
    """Cuerpo para crear una nueva auditoría."""
    target: str = Field(..., min_length=1, description="Host o URL objetivo de la auditoría")


class Audit(BaseModel):
    """Una auditoría almacenada."""
    id: int
    target: str
    status: str
    created_at: str


class RunRequest(BaseModel):
    """Petición para ejecutar un comando dentro de una auditoría."""
    command: str = Field(..., min_length=1, description="Comando completo ya interpolado")
    audit_id: int = Field(..., description="Auditoría a la que pertenece la ejecución")
    tool: Optional[str] = Field(None, description="Nombre de la herramienta (nmap, nuclei, ...)")


class RunResponse(BaseModel):
    """Respuesta inmediata al lanzar un proceso."""
    pid: int
    audit_id: int
    tool: Optional[str] = None
    command: str
    status: str = "running"


class Result(BaseModel):
    """Resultado guardado de una ejecución."""
    id: int
    audit_id: int
    tool: Optional[str]
    command: str
    output: str
    severity: Optional[str]
    created_at: str


class ReportRequest(BaseModel):
    """Opciones para generar el informe de una auditoría."""
    use_ai: bool = Field(
        False,
        description="Añadir un resumen ejecutivo redactado por Claude "
        "(requiere ANTHROPIC_API_KEY en el entorno del backend).",
    )


class ReportResponse(BaseModel):
    """Informe generado (Markdown) de una auditoría."""
    audit_id: int
    content: str
    created_at: Optional[str] = None
