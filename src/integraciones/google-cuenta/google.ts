import { variable } from "@/lib/config";
import { limpiarTexto } from "@/lib/texto";

// Entrar con Google. En la web lo dibuja el botón de Google (src/components/EntrarACuenta.tsx); en la app de Android
// lo hace el inicio de sesión nativo (integraciones/capacitor-android). Los dos devuelven un token de Google que
// se valida acá contra el cliente web (GOOGLE_CLIENT_ID).

export const idDeGoogle = () => variable("GOOGLE_CLIENT_ID");

// Google confirma que el comprobante es suyo, está vigente y fue emitido para esta app.
export async function verificarGoogle(credencial: string, idDeLaApp: string): Promise<{ sub: string; nombre: string } | null> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 10_000);
  try {
    const respuesta = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credencial)}`, { signal: control.signal });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Record<string, unknown>;
    const emisor = String(datos.iss ?? "");
    if (datos.aud !== idDeLaApp) return null;
    if (emisor !== "accounts.google.com" && emisor !== "https://accounts.google.com") return null;
    if (Number(datos.exp) * 1000 < Date.now()) return null;
    const sub = typeof datos.sub === "string" ? datos.sub : "";
    if (!sub) return null;
    const nombre = limpiarTexto(datos.given_name ?? datos.name ?? "", 40) || "Vecino";
    return { sub, nombre };
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}
