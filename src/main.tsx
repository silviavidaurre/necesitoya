import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { prepararAppNativa } from "./lib/nativo";
import "./app/globals.css";
import PerfilPublicoDePrestador from "./app/p/page";
import SeguimientoPedido from "./app/pedido/page";
import Pedir from "./app/pedir/page";
import AltaPrestador from "./app/prestador/alta/page";
import Privacidad from "./app/privacidad/page";
import EditarPerfil from "./app/prestador/editar/page";
import MisOfertas from "./app/prestador/ofertas/page";
import PedidosPrestador from "./app/prestador/page";
import PerfilPrestador from "./app/prestador/perfil/page";
import VerificarPrestador from "./app/prestador/verificar/page";
import PanelInterno from "./app/admin/page";
import Terminos from "./app/terminos/page";
import EliminarCuentaPublica from "./app/eliminar-cuenta/page";
import Recuperar from "./app/recuperar/page";

// El lado del prestador va oscuro y el del vecino claro: se cambia la clase de <html> según la pantalla.
function TemaSegunPantalla() {
  const { pathname } = useLocation();
  useEffect(() => {
    const oscuro = pathname.startsWith("/prestador");
    document.documentElement.classList.toggle("tema-oscuro", oscuro);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#0d0d0d" : "#ffffff");
  }, [pathname]);
  return null;
}

// Dentro de la app de Android: botón atrás del celular y avisos nativos que abren su pantalla.
function PreparacionNativa() {
  const navegar = useNavigate();
  useEffect(() => prepararAppNativa((ruta) => navegar(ruta)), [navegar]);
  return null;
}

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
      <TemaSegunPantalla />
      <PreparacionNativa />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white">
        <Routes>
          <Route path="/" element={<Pedir />} />
          <Route path="/pedir" element={<Pedir />} />
          <Route path="/pedido/:id" element={<SeguimientoPedido />} />
          <Route path="/prestador" element={<PedidosPrestador />} />
          <Route path="/prestador/alta" element={<AltaPrestador />} />
          <Route path="/prestador/ofertas" element={<MisOfertas />} />
          <Route path="/prestador/perfil" element={<PerfilPrestador />} />
          <Route path="/prestador/editar" element={<EditarPerfil />} />
          <Route path="/prestador/verificar" element={<VerificarPrestador />} />
          <Route path="/admin" element={<PanelInterno />} />
          <Route path="/terminos" element={<Terminos />} />
          <Route path="/eliminar-cuenta" element={<EliminarCuentaPublica />} />
          <Route path="/recuperar" element={<Recuperar />} />
          <Route path="/p/:id" element={<PerfilPublicoDePrestador />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
);

// App instalable y avisos: el service worker se registra cuando la página ya cargó, para no demorar el arranque.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la app anda igual: solo no se instala ni recibe avisos.
    });
  });
}
