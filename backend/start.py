"""Script de arranque del backend para PRODUCCIÓN.

Electron lo lanza con `python start.py` desde resources/backend en la app
empaquetada. A diferencia del bloque __main__ de main.py, aquí NO usamos
--reload (innecesario y problemático fuera de desarrollo).
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
