import type { CapacitorConfig } from "@capacitor/cli";

// App de Android de NecesitoYa, armada con Capacitor como KILO.
// Abre la versión publicada en Cloudflare: casi todos los cambios llegan a los celulares solo con publicar la web.
// Solo hace falta una versión nueva en Play cuando cambia algo nativo (permisos, íconos, complementos).
// Para probar la app con la copia empaquetada en vez de la publicada: NECESITOYA_ANDROID_LOCAL=true npx cap sync android
const URL_PUBLICADA = "https://necesitoya.gabriel13iturre.workers.dev";
const usarCopiaLocal = process.env.NECESITOYA_ANDROID_LOCAL === "true";

const config: CapacitorConfig = {
  appId: "com.necesitoya.app",
  appName: "NecesitoYa",
  webDir: "dist",
  server: usarCopiaLocal
    ? undefined
    : {
        url: URL_PUBLICADA,
        // Solo la app publicada y los pagos abren adentro; el resto de los enlaces se abre en el navegador.
        allowNavigation: ["necesitoya.gabriel13iturre.workers.dev", "payments.cosmospay.lat", "*.mercadopago.com.ar", "*.mercadopago.com"],
        cleartext: false,
      },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#0D0D0D",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
