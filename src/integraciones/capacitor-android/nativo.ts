import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// La misma web corre en el navegador y dentro de la app de Android (Capacitor, que abre la versión publicada).
// Acá está lo que cambia adentro de la app: el botón atrás del celular, los avisos nativos (Firebase) y lo que
// el WebView no permite (entrar con Google).

export function esAppNativa() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// La app agrega una marca a su identificación cuando se armó con Firebase (google-services.json): solo entonces
// se pueden pedir avisos nativos. Sin Firebase, registrarse cerraría la app, así que ni se intenta.
export function appConAvisosNativos() {
  return esAppNativa() && typeof navigator !== "undefined" && navigator.userAgent.includes("NecesitoYaAndroid/fcm");
}

// --- Barra de estado -------------------------------------------------------------------------------
// Acompaña al tema de la pantalla: fondo blanco con íconos oscuros en claro, fondo negro con íconos claros en oscuro.
// Las versiones de la app que no traen el complemento siguen con la barra blanca de capacitor.config.ts.
export async function pintarBarraDeEstado(oscuro: boolean) {
  if (!esAppNativa()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = íconos claros, para fondos oscuros.
    await StatusBar.setStyle({ style: oscuro ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: oscuro ? "#0d0d0d" : "#ffffff" });
  } catch {
    // Sin el complemento (o en un Android que no deja pintarla) la barra queda como estaba.
  }
}

// --- Botón atrás del celular -----------------------------------------------------------------------
// Las pantallas que se abren encima (chat, presupuestar, reclamos...) se anotan acá: atrás cierra la de arriba.
// Si no hay ninguna, vuelve a la pantalla anterior; en el inicio, sale de la app.
const cierres: (() => void)[] = [];

export function anotarCierre(cerrar: () => void) {
  cierres.push(cerrar);
  return () => {
    const i = cierres.lastIndexOf(cerrar);
    if (i >= 0) cierres.splice(i, 1);
  };
}

let preparado = false;

export function prepararAppNativa(navegar: (ruta: string) => void) {
  if (preparado || !esAppNativa()) return;
  preparado = true;
  void App.addListener("backButton", ({ canGoBack }) => {
    const cerrar = cierres[cierres.length - 1];
    if (cerrar) return cerrar();
    if (canGoBack && window.location.pathname !== "/") return window.history.back();
    void App.exitApp();
  });
  if (appConAvisosNativos()) {
    // Tocar un aviso abre la pantalla que corresponde.
    void PushNotifications.addListener("pushNotificationActionPerformed", (accion) => {
      const url = (accion.notification.data as { url?: string } | undefined)?.url;
      if (url && url.startsWith("/")) navegar(url);
    });
  }
}

// Pide permiso y registra el celular en Firebase. Devuelve el identificador (token) para mandarle avisos.
export async function registrarAvisosNativos(): Promise<string> {
  let permiso = await PushNotifications.checkPermissions();
  if (permiso.receive === "prompt" || permiso.receive === "prompt-with-rationale") permiso = await PushNotifications.requestPermissions();
  if (permiso.receive !== "granted") throw new Error("bloqueado");
  return new Promise<string>((listo, fallo) => {
    const reloj = setTimeout(() => fallo(new Error("No pudimos activar los avisos. Probá de nuevo.")), 15_000);
    void PushNotifications.addListener("registration", (token) => {
      clearTimeout(reloj);
      listo(token.value);
    });
    void PushNotifications.addListener("registrationError", () => {
      clearTimeout(reloj);
      fallo(new Error("No pudimos activar los avisos. Probá de nuevo."));
    });
    void PushNotifications.register();
  });
}

export async function avisosNativosActivos() {
  if (!appConAvisosNativos()) return false;
  return (await PushNotifications.checkPermissions()).receive === "granted";
}

// --- Entrar con Google adentro de la app ----------------------------------------------------------
// Google no deja entrar desde una página web dentro de la app (WebView). La app 1.1.1 en adelante trae el inicio
// de sesión nativo de Android (Credential Manager). Las versiones anteriores no lo tienen: se pregunta si está.
// Se pide con el identificador web de Google, así el token que vuelve es el mismo que valida el servidor.
export function googleNativoDisponible() {
  try {
    return esAppNativa() && Capacitor.isPluginAvailable("SocialLogin");
  } catch {
    return false;
  }
}

let googleIniciado: string | null = null;

// Devuelve el token de Google para mandarle al servidor, o null si la persona cerró la ventana de Google.
export async function entrarConGoogleNativo(idWebDeGoogle: string): Promise<string | null> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  if (googleIniciado !== idWebDeGoogle) {
    // Sin el paso de "autorización" extra: solo hace falta saber quién es (nombre y mail).
    await SocialLogin.initialize({ google: { webClientId: idWebDeGoogle, skipAuthOnlyAuthorizationAfterSignIn: true } });
    googleIniciado = idWebDeGoogle;
  }
  try {
    const respuesta = await SocialLogin.login({ provider: "google", options: {} });
    const resultado = respuesta.result as { idToken?: string | null };
    return resultado.idToken ?? null;
  } catch (error) {
    // Cerrar la ventana de Google no es un error para mostrar.
    if (/cancel/i.test(String((error as { message?: string })?.message ?? error))) return null;
    throw error;
  }
}
