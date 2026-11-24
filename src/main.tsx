import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
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
          <Route path="/p/:id" element={<PerfilPublicoDePrestador />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
