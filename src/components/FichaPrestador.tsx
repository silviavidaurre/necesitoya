import type { ReactNode } from "react";
import { Estrellas, ResumenDeReputacion, Verificacion } from "@/components/Reputacion";
import { Seccion } from "@/components/ui";
import { rubroPorId } from "@/lib/catalogo";
import type { PerfilPublico } from "@/lib/tipos";

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span className="shrink-0 text-[15px] text-ink-500">{etiqueta}</span>
      <span className="text-right text-[15px] font-semibold text-ink">{valor}</span>
    </div>
  );
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

// La ficha de un prestador tal como la ve un vecino: quién es, qué hace, sus trabajos y lo que opinan de él.
// `acciones` va debajo del encabezado y `fotosExtra` deja sumar controles al bloque de fotos (para el dueño).
export function FichaPrestador({ perfil, acciones, fotosExtra }: { perfil: PerfilPublico; acciones?: ReactNode; fotosExtra?: ReactNode }) {
  return (
    <>
      <div className="mt-6 flex flex-col items-center text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-[34px] font-bold text-brand-600">{iniciales(perfil.nombre)}</span>
        <h1 className="mt-4 text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">{perfil.nombre}</h1>
        <p className="mt-1 text-[17px] text-ink-500">{perfil.rubros.map((id) => rubroPorId(id).nombre).join(" · ")}</p>
        <p className="mt-2">
          <ResumenDeReputacion reputacion={perfil.reputacion} aniosExperiencia={perfil.aniosExperiencia} />
        </p>
        {!perfil.ejemplo && (
          <p className="mt-2">
            <Verificacion nivel={perfil.nivel} />
          </p>
        )}
      </div>

      {perfil.descripcion && <p className="mt-6 text-center text-base text-ink">{perfil.descripcion}</p>}
      {acciones && <div className="mt-6 space-y-3">{acciones}</div>}

      {(perfil.fotos.length > 0 || fotosExtra) && (
        <>
          <Seccion>Trabajos</Seccion>
          {perfil.fotos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {perfil.fotos.map((fotoId) => (
                <img key={fotoId} src={`/api/fotos?id=${fotoId}`} alt={`Trabajo de ${perfil.nombre}`} loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
              ))}
            </div>
          )}
          {fotosExtra}
        </>
      )}

      <Seccion>Detalles</Seccion>
      <div className="mt-1 divide-y divide-line">
        {perfil.aniosExperiencia > 0 && <Dato etiqueta="Experiencia" valor={`${perfil.aniosExperiencia} años`} />}
        {perfil.zonas.length > 0 && <Dato etiqueta="Barrios" valor={perfil.zonas.join(", ")} />}
        {perfil.disponibilidad && <Dato etiqueta="Horarios" valor={perfil.disponibilidad} />}
        <Dato etiqueta="Identidad (DNI)" valor={perfil.nivel >= 2 ? "Verificada" : "Sin verificar"} />
        <Dato etiqueta="Matrícula o certificado" valor={perfil.nivel >= 3 ? "Verificado" : "Sin verificar"} />
      </div>

      {/* Historial que no depende de lo que diga el prestador: sale de los trabajos hechos por la app. */}
      <Seccion>Historial en NecesitoYa</Seccion>
      <div className="mt-1 divide-y divide-line">
        <Dato etiqueta="Trabajos terminados" valor={String(perfil.reputacion.terminados)} />
        <Dato etiqueta="Cobrados por la app" valor={String(perfil.reputacion.cobrados)} />
        <Dato etiqueta="Opiniones" valor={perfil.reputacion.calificaciones > 0 ? `${perfil.reputacion.calificaciones} · ${String(perfil.reputacion.promedio ?? "").replace(".", ",")} de 5` : "Todavía ninguna"} />
      </div>
      <p className="mt-2 text-[13px] text-ink-500">Terminado quiere decir que el vecino confirmó que quedó bien.</p>

      {perfil.resenas.length > 0 && (
        <>
          <Seccion derecha={`${perfil.reputacion.calificaciones}`}>Opiniones</Seccion>
          <ul className="mt-1 divide-y divide-line">
            {perfil.resenas.map((resena) => (
              <li key={resena.creado} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-ink">{resena.cliente}</span>
                  <Estrellas valor={resena.estrellas} size={16} />
                </div>
                <p className="mt-0.5 text-sm text-ink-500">{resena.trabajo}</p>
                {resena.comentario && <p className="mt-2 text-[15px] text-ink">“{resena.comentario}”</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
