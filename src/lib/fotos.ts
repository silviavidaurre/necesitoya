import type { FotoParaIa } from "@/integraciones/anthropic-ia/ia";

const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
// La app achica la foto antes de mandarla; este tope es la red de seguridad del servidor (≈450 KB de imagen).
const MAXIMO_BASE64 = 620_000;

// Mira los primeros bytes del archivo: tiene que ser de verdad la imagen que dice ser.
function firmaCoincide(tipo: string, base64: string) {
  let inicio: string;
  try {
    inicio = atob(base64.slice(0, 24));
  } catch {
    return false;
  }
  const bytes = [...inicio].map((c) => c.charCodeAt(0));
  if (tipo === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === "image/png") return bytes[0] === 0x89 && inicio.slice(1, 4) === "PNG";
  if (tipo === "image/webp") return inicio.slice(0, 4) === "RIFF" && inicio.slice(8, 12) === "WEBP";
  return false;
}

// Valida la foto que llega del navegador. Devuelve null si no vino ninguna y lanza si vino mal.
export function fotoValida(valor: unknown): FotoParaIa | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "object") throw new Error("La foto no se pudo leer.");
  const { tipo, base64 } = valor as { tipo?: unknown; base64?: unknown };
  if (typeof tipo !== "string" || !(TIPOS as readonly string[]).includes(tipo)) {
    throw new Error("La foto tiene que ser JPG, PNG o WEBP.");
  }
  if (typeof base64 !== "string" || base64.length < 100 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new Error("La foto no se pudo leer.");
  }
  if (base64.length > MAXIMO_BASE64) throw new Error("La foto es muy pesada. Probá con otra.");
  if (!firmaCoincide(tipo, base64)) throw new Error("La foto no se pudo leer. Probá con otra.");
  return { tipo: tipo as FotoParaIa["tipo"], base64 };
}
