import type { ReactNode } from "react";
import { Cabecera, Pantalla, Seccion, Titulo } from "@/components/ui";
import { Link } from "@/lib/navegacion";

function Punto({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-base leading-relaxed text-ink">{children}</p>;
}

// Privacidad en una sola página y en castellano simple: qué se guarda, para qué, quién lo ve y cómo borrarlo.
export default function Privacidad() {
  return (
    <Pantalla>
      <Cabecera volver="/" />
      <Titulo pregunta="Qué guardamos, para qué, y cómo pedís que lo borremos.">Privacidad</Titulo>

      <Seccion>Qué guardamos</Seccion>
      <Punto>Tu nombre, tu barrio y lo que contás en tu pedido (el texto y la foto, si mandás una), y el diagnóstico que arma la IA.</Punto>
      <Punto>Si ofrecés un servicio: tu nombre, tus oficios, los barrios donde trabajás, lo que escribís sobre tu trabajo, las fotos que subís y, si los cargás, tu celular y tu billetera para cobrar.</Punto>
      <Punto>Los presupuestos, los mensajes del chat, las fotos del trabajo terminado, las calificaciones, los reclamos y las denuncias.</Punto>

      <Seccion>Tu cuenta</Seccion>
      <Punto>
        Para pedir o presupuestar hace falta una cuenta. Con mail, guardamos tu mail y una huella de tu contraseña que no se puede leer: ni nosotros
        sabemos cuál es. Con Google, guardamos solo un identificador y tu nombre de pila: no guardamos tu mail ni tu foto. No te mandamos publicidad.
      </Punto>

      <Seccion>Verificación de prestadores</Seccion>
      <Punto>
        Si pedís que verifiquemos tu identidad o tu oficio, guardamos las fotos de tu DNI, tu selfie y tu matrícula o certificado. Las ve solo el
        equipo de NecesitoYa para revisarlas, nunca los vecinos. A los vecinos les mostramos solo “Verificado” o “Sin verificar”.
      </Punto>

      <Seccion>Pagos</Seccion>
      <Punto>
        Si pagás por la app, el pago lo procesa Cosmos Pay en USDC sobre la red Stellar. NecesitoYa no guarda datos de tarjetas ni claves de
        billeteras: guarda el estado del pago y su monto. Si más adelante se suma Mercado Pago, el pago lo procesa Mercado Pago.
      </Punto>

      <Seccion>Avisos</Seccion>
      <Punto>Si activás los avisos, guardamos la dirección que da tu navegador para avisarte. El texto del aviso nunca pasa por el servicio de avisos de tu celular.</Punto>

      <Seccion>Quién ve qué</Seccion>
      <Punto>Los prestadores ven tu pedido, tu barrio y tu nombre de pila. Nadie ve tu teléfono: todo pasa por el chat de la app.</Punto>
      <Punto>El perfil de un prestador (nombre, oficios, fotos, calificaciones, si está verificado y su historial en la app) es público. Su celular y su billetera no se muestran.</Punto>
      <Punto>Si hay un reclamo o una denuncia, el equipo puede leer el chat de ese presupuesto para resolverlo.</Punto>

      <Seccion>Inteligencia artificial y voz</Seccion>
      <Punto>
        Para ordenar tu pedido, armar el diagnóstico o tu perfil, el texto y la foto se envían a Anthropic (Claude). Si dictás o pedís que la app lea
        en voz alta, el audio y el texto se envían a ElevenLabs. Se usan solo para darte ese resultado.
      </Punto>

      <Seccion>Lo que no hacemos</Seccion>
      <Punto>No vendemos tus datos ni los usamos para publicidad.</Punto>

      <Seccion>Tus derechos</Seccion>
      <Punto>
        Podés pedir ver, corregir o borrar tus datos cuando quieras (Ley 25.326 de Protección de Datos Personales). Escribinos a{" "}
        <a href="mailto:gabriel13iturre@gmail.com" className="font-semibold text-brand">
          gabriel13iturre@gmail.com
        </a>
        . La Agencia de Acceso a la Información Pública es el organismo de control de la ley.
      </Punto>
      <Punto>
        Las reglas de uso están en los{" "}
        <Link href="/terminos" className="font-semibold text-brand">
          términos y condiciones
        </Link>
        .
      </Punto>
      <p className="mt-8 text-[13px] text-ink-500">San Salvador de Jujuy, noviembre de 2026.</p>
    </Pantalla>
  );
}
