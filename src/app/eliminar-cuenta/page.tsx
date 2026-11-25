import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lista, SE_BORRA, SE_GUARDA } from "@/components/EliminarCuenta";
import { BotonPrimario, Cabecera, Campo, ErrorDePantalla, Icono, Pantalla, Seccion, Titulo, claseCampo } from "@/components/ui";
import { pedir } from "@/lib/cliente";
import { Link } from "@/lib/navegacion";

const CONTACTO = "gabriel13iturre@gmail.com";

// Página pública para eliminar la cuenta, como pide Google Play: se puede abrir sin tener la app.
// Explica cómo hacerlo desde la app y deja pedirlo sin entrar (con el mail de la cuenta).
export default function EliminarCuentaPublica() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  // Con correo configurado, el pedido manda un enlace para confirmar; al abrirlo se llega acá con ?confirmar=.
  const [porMail, setPorMail] = useState(false);
  const [parametros] = useSearchParams();
  const confirmar = parametros.get("confirmar") ?? "";
  const [eliminada, setEliminada] = useState(false);

  async function confirmarBaja() {
    setEnviando(true);
    setError("");
    try {
      await pedir("/api/eliminar-cuenta", { method: "POST", body: JSON.stringify({ confirmar }) });
      setEliminada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos eliminar la cuenta. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (confirmar) {
    return (
      <Pantalla
        pie={
          eliminada ? undefined : (
            <BotonPrimario onClick={confirmarBaja} cargando={enviando}>
              Sí, eliminar mi cuenta
            </BotonPrimario>
          )
        }
      >
        <Cabecera volver="/" />
        {eliminada ? (
          <Titulo pregunta="Borramos tus datos. Gracias por haber usado NecesitoYa.">Cuenta eliminada</Titulo>
        ) : (
          <>
            <Titulo pregunta="No se puede deshacer.">¿Eliminar tu cuenta?</Titulo>
            {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
            <Seccion>Qué se borra</Seccion>
            <Lista items={SE_BORRA} />
            <Seccion>Qué se guarda y por cuánto tiempo</Seccion>
            <Lista items={SE_GUARDA} />
          </>
        )}
      </Pantalla>
    );
  }

  async function pedirBaja() {
    setEnviando(true);
    setError("");
    try {
      const respuesta = await pedir<{ porMail?: boolean }>("/api/eliminar-cuenta", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setPorMail(Boolean(respuesta.porMail));
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos registrar el pedido. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla
      pie={
        listo ? undefined : (
          <BotonPrimario onClick={pedirBaja} disabled={!email.includes("@")} cargando={enviando}>
            Pedir que la eliminen
          </BotonPrimario>
        )
      }
    >
      <Cabecera volver="/" />
      <Titulo pregunta="NecesitoYa, de Iturre Labs (San Salvador de Jujuy, Argentina).">Eliminar tu cuenta</Titulo>

      <Seccion>Desde la app</Seccion>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-snug text-ink">
        <li>Abrí NecesitoYa y entrá con tu cuenta.</li>
        <li>Tocá "Cuenta" en la barra de abajo (o "Perfil", si sos prestador) y después "Eliminar la cuenta".</li>
        <li>Confirmá. Se elimina en el momento.</li>
      </ol>

      <Seccion>Sin entrar a la app</Seccion>
      {listo ? (
        <div className="mt-3 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-subtle text-success">
            <Icono nombre="check" size={24} />
          </span>
          <p className="text-[15px] text-ink">
            {porMail
              ? "Recibimos el pedido. Si hay una cuenta con ese mail, te mandamos un enlace para confirmar (vence en 24 horas; mirá también en spam). Por seguridad no te decimos si el mail está registrado."
              : "Recibimos el pedido. Si hay una cuenta con ese mail, la eliminamos en hasta 7 días hábiles. Por seguridad no te decimos si el mail está registrado."}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-ink-500">Escribí el mail con el que creaste la cuenta. Si entrabas con Google, escribinos a {CONTACTO}.</p>
          <Campo etiqueta="Mail de tu cuenta">
            <input className={claseCampo} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </Campo>
          {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
        </>
      )}

      <Seccion>Qué se borra</Seccion>
      <Lista items={SE_BORRA} />
      <Seccion>Qué se guarda y por cuánto tiempo</Seccion>
      <Lista items={SE_GUARDA} />

      <p className="mt-8 text-[15px] text-ink-500">
        ¿Dudas? Escribinos a{" "}
        <a href={`mailto:${CONTACTO}`} className="font-semibold text-brand">
          {CONTACTO}
        </a>
        . Más información en{" "}
        <Link href="/privacidad" className="font-semibold text-brand">
          privacidad
        </Link>{" "}
        y en los{" "}
        <Link href="/terminos" className="font-semibold text-brand">
          términos
        </Link>
        .
      </p>
    </Pantalla>
  );
}
