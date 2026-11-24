// Contraseñas: nunca se guardan; se guarda una huella que no se puede dar vuelta (PBKDF2 con sal propia de la cuenta).

export async function huella(contrasena: string, sal: string) {
  const texto = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", texto.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: texto.encode(sal), iterations: 100_000 }, material, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let distinto = 0;
  for (let i = 0; i < a.length; i += 1) distinto |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return distinto === 0;
}
