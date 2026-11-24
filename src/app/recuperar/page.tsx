import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { abrirCuenta, type Entrada } from "@/components/EntrarACuenta";
import { BotonPrimario, Cabecera, Campo, ErrorDePantalla, Pantalla, Titulo, claseCampo } from "@/components/ui";
import { pedir } from "@/lib/cliente";
import { useRouter } from "@/lib/navegacion";

// Elegir otra contraseña con el enlace que llegó por mail (/recuperar?t=...). Al guardarla, la cuenta queda abierta.
export default function Recuperar() {
  const [parametros] = useSearchParams();
  const token = parametros.get("t") ?? "";
  const router = useRouter();
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      const entrada = await pedir<Entrada>("/api/cuenta/recuperar", { method: "POST", body: JSON.stringify({ token, contrasena }) });
      abrirCuenta(entrada);
      setNombre(entrada.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardarla. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (nombre) {
    return (
      <Pantalla pie={<BotonPrimario onClick={() => router.replace("/")}>Ir al inicio</BotonPrimario>}>
        <Cabecera volver="/" />
        <Titulo pregunta={`Ya entraste como ${nombre}. La próxima vez usá la contraseña nueva.`}>Listo</Titulo>
      </Pantalla>
    );
  }

  return (
    <Pantalla
      pie={
        <BotonPrimario onClick={guardar} disabled={!token || contrasena.length < 6} cargando={enviando}>
          Guardar y entrar
        </BotonPrimario>
      }
    >
      <Cabecera volver="/" />
      <Titulo pregunta={token ? "Elegí una que no uses en otro lado." : "Este enlace está incompleto. Pedí otro desde Entrar o crear cuenta."}>Contraseña nueva</Titulo>
      {token && (
        <Campo etiqueta="Contraseña nueva" ayuda="6 caracteres o más.">
          <input className={claseCampo} type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} maxLength={100} />
        </Campo>
      )}
      {error && <ErrorDePantalla>{error}</ErrorDePantalla>}
    </Pantalla>
  );
}
