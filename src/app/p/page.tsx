import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FichaPrestador } from "@/components/FichaPrestador";
import { Logo } from "@/components/Logo";
import { BotonPrimario, Cargando, Pantalla, Titulo } from "@/components/ui";
import { rubroPorId } from "@/lib/catalogo";
import { ErrorDePedido, pedir } from "@/lib/cliente";
import { Link, useRouter } from "@/lib/navegacion";
import type { PerfilPublico } from "@/lib/tipos";

// Perfil público de un prestador: lo que ve quien abre el enlace que él compartió.
// Es su tarjeta digital, y la puerta de entrada de vecinos nuevos a la app.
export default function PerfilPublicoDePrestador() {
  const { id = "" } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    pedir<{ perfil: PerfilPublico }>(`/api/perfil?id=${encodeURIComponent(id)}`)
      .then((datos) => {
        if (vigente) setPerfil(datos.perfil);
      })
      .catch((e) => {
        if (!vigente) return;
        setError(e instanceof ErrorDePedido && e.estado === 404 ? "Este perfil ya no existe." : "No pudimos cargar el perfil. Revisá tu conexión.");
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  if (error) {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/")}>Ir al inicio</BotonPrimario>}>
        <div className="mt-[60px]">
          <Titulo pregunta={error}>No está disponible</Titulo>
        </div>
      </Pantalla>
    );
  }

  if (!perfil) return <Cargando />;

  const pila = perfil.nombre.split(" ")[0];
  const frase = perfil.rubros.length > 0 ? `Necesito un trabajo de ${rubroPorId(perfil.rubros[0]).nombre.toLowerCase()}` : "";

  return (
    <Pantalla
      pie={
        <>
          <BotonPrimario onClick={() => router.push(frase ? `/pedir?texto=${encodeURIComponent(frase)}` : "/pedir")}>Pedir presupuesto</BotonPrimario>
          <p className="mt-2 text-center text-[13px] text-ink-500">Gratis. Te responden {pila} y otros prestadores de tu barrio.</p>
        </>
      }
    >
      <header className="flex h-[60px] items-center">
        <Link href="/" aria-label="Ir al inicio de NecesitoYa">
          <Logo />
        </Link>
      </header>
      <FichaPrestador perfil={perfil} />
    </Pantalla>
  );
}
