// Definición de las 6 fases de auditoría y sus herramientas.
//
// Placeholders en los comandos:
//   {HOST}    -> dominio/host sin esquema   (ej. example.com)
//   {TARGET}  -> URL completa con esquema    (ej. https://example.com)
// App.jsx los interpola con el target actual antes de ejecutar.
//
// tag: "pasivo" (no toca el objetivo) | "activo" (interactúa) | "auto" (automático/intrusivo)

export const PHASES = [
  {
    id: "recon",
    title: "1 · Reconocimiento pasivo",
    description: "Información del objetivo sin interactuar directamente con él.",
    color: "#38bdf8", // sky
    tools: [
      {
        name: "whois",
        tag: "pasivo",
        description: "Datos de registro del dominio (registrante, fechas, nameservers).",
        commands: ["whois {HOST}"],
      },
      {
        name: "dig",
        tag: "pasivo",
        description: "Consulta de registros DNS del dominio.",
        commands: ["dig {HOST} ANY +short"],
      },
      {
        name: "subfinder",
        tag: "pasivo",
        description: "Enumeración pasiva de subdominios.",
        commands: ["subfinder -d {HOST} -silent"],
      },
      {
        name: "amass",
        tag: "pasivo",
        description: "Mapeo pasivo de superficie de ataque y subdominios.",
        commands: ["amass enum -passive -d {HOST}"],
      },
    ],
  },
  {
    id: "scan",
    title: "2 · Escaneo de puertos",
    description: "Descubrimiento de puertos y servicios expuestos.",
    color: "#a78bfa", // violet
    tools: [
      {
        name: "nmap",
        tag: "activo",
        description: "Escaneo de versiones y scripts por defecto.",
        commands: [
          "nmap -sV -sC -T4 {HOST}",
          "nmap -p- --min-rate 5000 {HOST}",
        ],
      },
      {
        name: "naabu",
        tag: "activo",
        description: "Escáner de puertos rápido basado en SYN.",
        commands: ["naabu -host {HOST}"],
      },
    ],
  },
  {
    id: "enum",
    title: "3 · Enumeración web",
    description: "Descubrimiento de rutas, ficheros y tecnologías web.",
    color: "#34d399", // emerald
    tools: [
      {
        name: "gobuster",
        tag: "activo",
        description: "Fuerza bruta de directorios y ficheros.",
        commands: [
          "gobuster dir -u {TARGET} -w /usr/share/wordlists/dirb/common.txt",
        ],
      },
      {
        name: "ffuf",
        tag: "activo",
        description: "Fuzzing web rápido de rutas (FUZZ).",
        commands: [
          "ffuf -w /usr/share/wordlists/dirb/common.txt -u {TARGET}/FUZZ",
        ],
      },
      {
        name: "nikto",
        tag: "activo",
        description: "Escáner de configuraciones y fallos web conocidos.",
        commands: ["nikto -h {TARGET}"],
      },
      {
        name: "whatweb",
        tag: "pasivo",
        description: "Identificación de tecnologías y CMS del sitio.",
        commands: ["whatweb {TARGET}"],
      },
    ],
  },
  {
    id: "vuln",
    title: "4 · Análisis de vulnerabilidades",
    description: "Detección automatizada de vulnerabilidades.",
    color: "#fbbf24", // amber
    tools: [
      {
        name: "nuclei",
        tag: "auto",
        description: "Plantillas de detección de CVEs y exposiciones.",
        commands: [
          "nuclei -u {TARGET} -t cves/",
          "nuclei -u {TARGET} -t exposures/",
        ],
      },
      {
        name: "sqlmap",
        tag: "auto",
        description: "Detección y explotación de inyección SQL en formularios.",
        commands: ["sqlmap -u {TARGET} --forms --batch"],
      },
    ],
  },
  {
    id: "exploit",
    title: "5 · Explotación controlada",
    description: "Pruebas de explotación con autorización expresa.",
    color: "#f87171", // red
    tools: [
      {
        name: "curl (proxy)",
        tag: "activo",
        description: "Petición a través de proxy local (Burp/ZAP en 127.0.0.1:8080).",
        commands: ["curl -x http://127.0.0.1:8080 -sk {TARGET}"],
      },
      {
        name: "hydra",
        tag: "auto",
        description: "Fuerza bruta de credenciales (requiere users.txt y wordlist).",
        commands: [
          "hydra -L users.txt -P rockyou.txt {HOST} http-post-form \"/login:user=^USER^&pass=^PASS^:F=incorrect\"",
        ],
      },
    ],
  },
  {
    id: "report",
    title: "6 · Generación de reporte",
    description: "Exportación de resultados a formatos estructurados.",
    color: "#94a3b8", // slate
    tools: [
      {
        name: "nuclei (export)",
        tag: "auto",
        description: "Exporta hallazgos de nuclei a JSON.",
        commands: ["nuclei -u {TARGET} -json -o report.json"],
      },
      {
        name: "nmap (export)",
        tag: "activo",
        description: "Exporta resultado de nmap a XML.",
        commands: ["nmap -oX nmap.xml {HOST}"],
      },
    ],
  },
];

/**
 * Reemplaza los placeholders de un comando con el target actual.
 * - {TARGET}: URL completa (se le añade http:// si no trae esquema)
 * - {HOST}:   solo el host (sin esquema ni ruta)
 */
export function interpolate(command, target) {
  const raw = (target || "").trim();
  if (!raw) return command;

  const hasScheme = /^[a-z]+:\/\//i.test(raw);
  const fullUrl = hasScheme ? raw : `http://${raw}`;

  let host = raw;
  try {
    host = new URL(fullUrl).hostname;
  } catch {
    host = raw.replace(/^[a-z]+:\/\//i, "").split("/")[0];
  }

  return command.replaceAll("{TARGET}", fullUrl).replaceAll("{HOST}", host);
}
