<div align="center">

# 🛡️ ReconPanel

**Panel de control de escritorio para auditorías web autorizadas.**

Orquesta las herramientas estándar de pentesting (nmap, nuclei, sqlmap, ffuf…)
desde una única interfaz, con streaming del output en tiempo real, historial
persistente y generación de informes.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38BDF8?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.10+-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-persistencia-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ ¿Qué es?

ReconPanel es una aplicación de **escritorio multiplataforma** (Electron) que
organiza una auditoría web en **6 fases** —reconocimiento, escaneo de puertos,
enumeración web, análisis de vulnerabilidades, explotación controlada y
generación de informe— y te permite lanzar las herramientas de cada fase con un
clic, viendo su salida **en directo** y guardando todo el historial.

El foco del proyecto es la **arquitectura**: un frontend React desacoplado, una
API FastAPI asíncrona que lanza subprocesos sin bloquear el event loop y hace
_streaming_ del output por **WebSocket**, y una capa de persistencia en SQLite.

### Características

- 🧭 **6 fases guiadas** con herramientas predefinidas y comandos plantilla.
- ⚡ **Streaming en tiempo real** del `stdout`/`stderr` vía WebSocket, línea a
  línea y con auto-scroll inteligente.
- 🎯 **Placeholders** `{HOST}` / `{TARGET}` que se interpolan con el objetivo:
  escribe el target una vez y todos los comandos se rellenan solos.
- 🛑 **Control de procesos**: cada ejecución es cancelable y se mata todo el
  árbol de procesos (multiplataforma) al detener o cerrar la app.
- 💾 **Historial persistente** de auditorías y resultados en SQLite.
- 📄 **Generación de informe** en Markdown a partir de los resultados, con un
  **resumen ejecutivo opcional redactado por Claude** (API de Anthropic).
- 🔒 **Backend solo local** (`127.0.0.1:8000`); Electron lo arranca y supervisa.

---

## ⚠️ Aviso legal

ReconPanel **ejecuta herramientas de seguridad reales** (nmap, nuclei, sqlmap,
hydra, etc.) contra el objetivo que indiques. Úsalo **única y exclusivamente**
sobre sistemas para los que dispongas de **autorización expresa y por escrito**.

El escaneo, la enumeración o la explotación de sistemas sin permiso es **ilegal**
en la mayoría de jurisdicciones. Tú, como usuario, eres el único responsable del
uso que hagas de esta herramienta.

---

## 🧱 Stack

| Capa          | Tecnología                                             |
|---------------|--------------------------------------------------------|
| **Frontend**  | React 18 + Vite + Tailwind CSS                         |
| **Backend**   | Python 3.10+ · FastAPI + uvicorn (async)              |
| **Escritorio**| Electron 28 (empaquetado con electron-builder)        |
| **Tiempo real**| WebSocket (streaming del output de cada herramienta) |
| **Persistencia**| SQLite (historial de auditorías y resultados)       |
| **IA (opcional)**| API de Anthropic (Claude) para el resumen ejecutivo |

---

## 🏗️ Arquitectura

```
reconpanel/
├── backend/      FastAPI: API REST + WebSocket, runner de subprocesos, SQLite
│   ├── main.py       Endpoints y ConnectionManager del WebSocket
│   ├── runner.py     Lanzamiento/streaming/kill de subprocesos (async)
│   ├── db.py         Persistencia SQLite (auditorías, resultados, informes)
│   ├── report.py     Construcción del informe Markdown (+ resumen IA opcional)
│   └── models.py     Modelos Pydantic
├── frontend/     React + Vite + Tailwind (UI de las 6 fases)
├── electron/     Proceso principal + preload (arranca y supervisa el backend)
└── package.json  Scripts y configuración de electron-builder
```

**Flujo de una ejecución:**

1. El frontend crea una auditoría (`POST /api/audits`) y abre el WebSocket
   `/ws/{audit_id}`.
2. Cuando el WS está listo, envía `POST /api/run` con el comando ya interpolado.
3. El backend lanza el proceso (async) y emite por el WS:
   `start` → `line`* → `status` (`done`/`error`). El resultado se guarda en SQLite.
4. En la fase 6, `POST /api/audits/{id}/report` compila todos los resultados en
   un informe Markdown descargable.

Eventos del WebSocket:

```jsonc
{ "type": "connected" }
{ "type": "start",  "pid": 1234, "tool": "nmap", "command": "nmap -sV ..." }
{ "type": "line",   "pid": 1234, "data": "..." }
{ "type": "status", "pid": 1234, "data": "done", "returncode": 0 }
```

### API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/api/ping` | Health check |
| `POST` | `/api/audits` | Crea una auditoría |
| `GET`  | `/api/history` | Lista las auditorías guardadas |
| `POST` | `/api/run` | Lanza una herramienta y hace streaming por WS |
| `GET`  | `/api/audits/{id}/results` | Resultados de una auditoría |
| `POST` | `/api/audits/{id}/report` | Genera y guarda el informe (Markdown) |
| `GET`  | `/api/audits/{id}/report` | Recupera el último informe guardado |
| `DELETE` | `/api/kill/{pid}` | Mata un proceso en ejecución |
| `WS`   | `/ws/{audit_id}` | Streaming del output en tiempo real |

---

## 🔧 Prerrequisitos

| Requisito | Versión | Notas |
|-----------|---------|-------|
| Python    | 3.10+   | Debe estar en el `PATH` (`python` / `python3`) |
| Node.js   | 18+     | Incluye `npm` |
| Herramientas de auditoría | — | Deben estar instaladas y en el `PATH` |

Las herramientas que invocan los comandos predefinidos **no** se instalan con la
app; debes tenerlas tú: `whois`, `dig`, `subfinder`, `amass`, `nmap`, `naabu`,
`gobuster`, `ffuf`, `nikto`, `whatweb`, `nuclei`, `sqlmap`, `curl`, `hydra`.
(En Kali Linux la mayoría ya vienen incluidas.)

---

## 🚀 Instalación

```bash
# 0. Clona el repo
git clone https://github.com/VictorRiPu/ReconPanel.git
cd ReconPanel

# 1. Dependencias del backend (recomendado dentro de un venv)
python -m venv backend/.venv
# Windows:  backend\.venv\Scripts\activate
# Linux:    source backend/.venv/bin/activate
pip install -r backend/requirements.txt

# 2. Dependencias de Node (raíz = Electron, y frontend = React/Vite)
npm install
cd frontend && npm install && cd ..
```

> Nota: hay **dos** `npm install`: el de la raíz (Electron, electron-builder,
> concurrently) y el de `frontend/` (React, Vite, Tailwind).

### (Opcional) Resumen ejecutivo con IA

Para el resumen ejecutivo de la fase 6, copia `backend/.env.example` a
`backend/.env` y añade tu clave de Anthropic:

```bash
cp backend/.env.example backend/.env
# edita backend/.env  ->  ANTHROPIC_API_KEY=sk-ant-...
```

Sin clave, el informe se genera igualmente (solo omite el resumen redactado por IA).

---

## 🧑‍💻 Desarrollo

```bash
npm run dev
```

Arranca en paralelo (vía `concurrently`):

1. **backend** — `uvicorn main:app --reload --port 8000`
2. **frontend** — Vite dev server en `http://localhost:5173`
3. **electron** — espera a que el backend responda en `/api/ping` y abre la ventana

En desarrollo Electron **no** relanza el backend (ya lo levanta `concurrently`);
solo espera a que esté vivo. Si trabajas dentro de un venv, actívalo antes de
`npm run dev` para que `uvicorn` resuelva.

### Scripts individuales

| Script | Acción |
|--------|--------|
| `npm run backend`  | Solo el backend (uvicorn con recarga) |
| `npm run frontend` | Solo el dev server de Vite |
| `npm run dev`      | Backend + frontend + Electron |
| `npm run build`    | Build de Vite + empaquetado con electron-builder |

---

## 📦 Build / Empaquetado

```bash
npm run build
```

Genera en `release/`:

- **Linux:** AppImage
- **Windows:** instalador NSIS

La carpeta `backend/` completa se incluye en los recursos de la app
(`extraResources`). En producción Electron lanza el backend con `python start.py`.

> **Importante:** si `backend/.venv` existe en el momento del build, se incluye
> tal cual en el paquete y Electron lo detecta y lo usa automáticamente en
> producción — el ejecutable queda autocontenido, sin depender de un Python del
> sistema en la máquina destino. Si no existe ningún venv empaquetado, cae de
> vuelta a `python`/`python3` del `PATH` (que entonces sí debe tener
> `requirements.txt` instalado). También puedes forzar un intérprete concreto
> con la variable de entorno `RECONPANEL_PYTHON`.

---

## 🗺️ Fases y herramientas

| Fase | Herramientas |
|------|--------------|
| 1 · Reconocimiento pasivo | `whois`, `dig`, `subfinder`, `amass` |
| 2 · Escaneo de puertos | `nmap`, `naabu` |
| 3 · Enumeración web | `gobuster`, `ffuf`, `nikto`, `whatweb` |
| 4 · Análisis de vulnerabilidades | `nuclei`, `sqlmap` |
| 5 · Explotación controlada | `curl` (proxy), `hydra` |
| 6 · Generación de informe | export `nuclei`/`nmap` + informe Markdown (IA opcional) |

---

## 📝 Licencia

[MIT](LICENSE)
