// Entry point de Electron para ReconPanel.
//
// Responsabilidades:
//   - En PRODUCCIÓN: lanzar el backend Python (FastAPI/uvicorn) con spawn().
//     En DESARROLLO el backend ya lo arranca `concurrently` (npm run dev),
//     así que NO lo relanzamos para no chocar en el puerto 8000.
//   - Esperar a que el backend responda en /api/ping (polling 500ms, timeout 10s)
//     antes de abrir la ventana.
//   - Ventana 1280x800 sin barra de menú nativa.
//   - dev  -> http://localhost:5173   |   prod -> frontend/dist/index.html
//   - Al cerrar, matar el proceso del backend antes de salir.

const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const PING_PATH = "/api/ping";

const isDev = !app.isPackaged;

let mainWindow = null;
let backendProc = null;

// ----------------------------------------------------------------------- //
// Backend
// ----------------------------------------------------------------------- //

function backendDir() {
  // En dev el backend vive en ../backend; empaquetado va a resources/backend.
  return isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");
}

function pythonExecutable() {
  // Permite override explícito; si no, default por plataforma.
  if (process.env.RECONPANEL_PYTHON) return process.env.RECONPANEL_PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}

function startBackend() {
  // Solo en producción: en dev lo gestiona concurrently.
  if (isDev) {
    console.log("[reconpanel] dev: backend gestionado por concurrently");
    return;
  }
  const cwd = backendDir();
  // start.py arranca uvicorn sin --reload (script de arranque de producción).
  backendProc = spawn(pythonExecutable(), ["start.py"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  backendProc.stdout.on("data", (d) =>
    console.log(`[backend] ${d.toString().trimEnd()}`)
  );
  backendProc.stderr.on("data", (d) =>
    console.error(`[backend] ${d.toString().trimEnd()}`)
  );
  backendProc.on("exit", (code) =>
    console.log(`[reconpanel] backend finalizó (code ${code})`)
  );
}

function killBackend() {
  if (!backendProc || backendProc.killed) return;
  const pid = backendProc.pid;
  try {
    if (process.platform === "win32") {
      // Mata también los hijos que cuelgan del proceso de Python.
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    } else {
      backendProc.kill("SIGTERM");
    }
  } catch (e) {
    console.error("[reconpanel] error matando backend:", e);
  }
  backendProc = null;
}

// ----------------------------------------------------------------------- //
// Health check
// ----------------------------------------------------------------------- //

function pingBackend() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: BACKEND_HOST, port: BACKEND_PORT, path: PING_PATH, timeout: 1000 },
      (res) => {
        res.resume(); // descarta el cuerpo
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBackend(timeoutMs = 10000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingBackend()) return true;
    await wait(intervalMs);
  }
  return false;
}

// ----------------------------------------------------------------------- //
// Ventana
// ----------------------------------------------------------------------- //

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0b0f17",
    autoHideMenuBar: true, // sin barra de menú nativa
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    loadDevWithRetry();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "frontend", "dist", "index.html")
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// En dev, Vite puede no estar listo aún cuando Electron abre: reintentamos.
function loadDevWithRetry(attempt = 0) {
  const url = "http://localhost:5173";
  mainWindow.loadURL(url).catch(() => {});
  mainWindow.webContents.once("did-fail-load", () => {
    if (mainWindow && attempt < 40) {
      setTimeout(() => loadDevWithRetry(attempt + 1), 500);
    }
  });
}

// ----------------------------------------------------------------------- //
// Ciclo de vida
// ----------------------------------------------------------------------- //

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // elimina el menú nativo por completo

  startBackend();

  const ready = await waitForBackend();
  if (!ready) {
    dialog.showErrorBox(
      "ReconPanel",
      "El backend no respondió en /api/ping tras 10 s.\n" +
        "Comprueba que Python y las dependencias estén instaladas."
    );
    killBackend();
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killBackend();
  app.quit();
});

app.on("before-quit", killBackend);
app.on("will-quit", killBackend);
