import { useEffect, useState } from "react";
import { Estado } from "@/components/ui";
import { leerCuenta, pedir } from "@/lib/cliente";
import { appConAvisosNativos, avisosNativosActivos, esAppNativa, registrarAvisosNativos } from "@/integraciones/capacitor-android/nativo";

type EstadoDeAvisos = "cargando" | "no-soportado" | "sin-servidor" | "bloqueado" | "activo" | "apagado";

function soportados() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function clave(base64url: string) {
  const base = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

// "Avisarme" en el celular: presupuesto nuevo, mensaje, te eligieron, pago. Un toque pide el permiso del navegador
// y anota este celular en la cuenta. Si ya está activo, solo lo dice. Sin cuenta o sin soporte, no se muestra.
export function ActivarAvisos({ para }: { para: string }) {
  const [estado, setEstado] = useState<EstadoDeAvisos>("cargando");
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    (async () => {
      if (!leerCuenta()) return setEstado("no-soportado");
      // App de Android: avisos nativos (Firebase), si la app se armó con Firebase y el servidor puede mandarlos.
      if (esAppNativa()) {
        if (!appConAvisosNativos()) return setEstado("no-soportado");
        const servidor = await pedir<{ fcm?: boolean }>("/api/avisos").catch(() => null);
        if (!servidor?.fcm) return vigente && setEstado("sin-servidor");
        if (!(await avisosNativosActivos())) return vigente && setEstado("apagado");
        // Con el permiso ya dado se vuelve a anotar el celular en silencio (por si cambió la cuenta o el identificador).
        const token = await registrarAvisosNativos();
        await pedir("/api/avisos", { method: "POST", body: JSON.stringify({ cuenta: leerCuenta()?.clave, fcm: token }) });
        if (vigente) setEstado("activo");
        return;
      }
      if (!soportados()) return setEstado("no-soportado");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const servidor = await pedir<{ disponible: boolean }>("/api/avisos").catch(() => null);
      if (!servidor?.disponible) return vigente && setEstado("sin-servidor");
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();
      if (vigente) setEstado(suscripcion && Notification.permission === "granted" ? "activo" : "apagado");
    })().catch(() => vigente && setEstado("no-soportado"));
    return () => {
      vigente = false;
    };
  }, []);

  async function activar() {
    setError("");
    if (esAppNativa()) {
      try {
        const token = await registrarAvisosNativos();
        await pedir("/api/avisos", { method: "POST", body: JSON.stringify({ cuenta: leerCuenta()?.clave, fcm: token }) });
        setEstado("activo");
      } catch (e) {
        if (e instanceof Error && e.message === "bloqueado") setEstado("bloqueado");
        else setError(e instanceof Error ? e.message : "No pudimos activar los avisos en este celular.");
      }
      return;
    }
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }
      const { publica } = await pedir<{ publica: string | null }>("/api/avisos");
      if (!publica) return setEstado("sin-servidor");
      const registro = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const suscripcion =
        (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave(publica) }));
      await pedir("/api/avisos", { method: "POST", body: JSON.stringify({ cuenta: leerCuenta()?.clave, suscripcion: suscripcion.toJSON() }) });
      setEstado("activo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos activar los avisos en este celular.");
    }
  }

  if (estado === "cargando" || estado === "no-soportado" || estado === "sin-servidor") return null;
  return (
    <div className="mt-4 flex min-h-12 items-center justify-between gap-3">
      {estado === "activo" ? (
        <Estado tono="bien">Te avisamos en este celular</Estado>
      ) : estado === "bloqueado" ? (
        <span className="text-[15px] text-ink-500">Los avisos están bloqueados. Activalos en los ajustes {esAppNativa() ? "del celular" : "del navegador"}.</span>
      ) : (
        <>
          <span className="text-[15px] text-ink-500">{para}</span>
          <button type="button" onClick={activar} className="flex min-h-12 shrink-0 items-center text-base font-semibold text-brand">
            Avisarme
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
