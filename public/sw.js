// Service worker de NecesitoYa: deja instalar la app, la abre sin señal con lo último que vio y recibe los avisos.
// Regla de oro: nunca toca /api/. Los datos siempre van directo al servidor, para que nadie vea algo viejo.

const VERSION = "necesitoya-v2";
const CASCARA = ["/", "/manifest.webmanifest", "/icono.svg", "/icono-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CASCARA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Páginas: primero la red (siempre lo último); sin señal, la última copia guardada.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put("/", copia));
          return respuesta;
        })
        .catch(() => caches.match("/").then((guardada) => guardada || Response.error())),
    );
    return;
  }

  // Archivos del armado (llevan su huella en el nombre, no cambian nunca): primero lo guardado.
  if (url.pathname.startsWith("/assets/") || CASCARA.includes(url.pathname)) {
    evento.respondWith(
      caches.match(pedido).then(
        (guardada) =>
          guardada ||
          fetch(pedido).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(VERSION).then((cache) => cache.put(pedido, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});

// El push llega vacío: solo despierta. El texto se pide al servidor con la suscripción de este celular.
self.addEventListener("push", (evento) => {
  evento.waitUntil(
    (async () => {
      let aviso = null;
      try {
        const suscripcion = await self.registration.pushManager.getSubscription();
        if (suscripcion) {
          const respuesta = await fetch("/api/avisos/ultimo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: suscripcion.endpoint }),
          });
          aviso = (await respuesta.json()).aviso;
        }
      } catch {
        // Sin señal para traer el texto: igual se avisa.
      }
      await self.registration.showNotification(aviso?.titulo || "NecesitoYa", {
        body: aviso?.texto || "Tenés novedades. Entrá a verlas.",
        icon: "/icono-192.png",
        badge: "/icono-192.png",
        tag: aviso?.tipo || "novedad",
        data: { url: aviso?.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin));
      if (abierta) {
        abierta.navigate(destino);
        return abierta.focus();
      }
      return self.clients.openWindow(destino);
    }),
  );
});
