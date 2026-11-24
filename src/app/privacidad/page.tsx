import type { ReactNode } from "react";
import { Cabecera, Pantalla, Seccion, Titulo } from "@/components/ui";
import { Link } from "@/lib/navegacion";

const CONTACTO = "gabriel13iturre@gmail.com";

function Punto({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-base leading-relaxed text-ink">{children}</p>;
}

function Dato({ dato, para }: { dato: string; para: string }) {
  return (
    <li className="py-3">
      <p className="text-base font-semibold text-ink">{dato}</p>
      <p className="mt-0.5 text-[15px] leading-snug text-ink-500">{para}</p>
    </li>
  );
}

function Correo() {
  return (
    <a href={`mailto:${CONTACTO}`} className="font-semibold text-brand">
      {CONTACTO}
    </a>
  );
}

// Política de privacidad completa (Ley 25.326 y requisitos de Google Play), en castellano simple.
export default function Privacidad() {
  return (
    <Pantalla>
      <Cabecera volver="/" />
      <Titulo pregunta="Qué datos usamos, para qué, cuánto tiempo y cómo pedís que los borremos.">Privacidad</Titulo>

      <Seccion>Quién es el responsable</Seccion>
      <Punto>
        NecesitoYa es de <strong>Iturre Labs</strong>, de San Salvador de Jujuy, Argentina. Es el responsable de tus datos. Contacto: <Correo />.
      </Punto>

      <Seccion>Qué datos usamos y para qué</Seccion>
      <ul className="mt-1 divide-y divide-line">
        <Dato dato="Nombre" para="Para que el prestador o el vecino sepa con quién habla. A los demás solo les mostramos el nombre de pila." />
        <Dato dato="Mail y contraseña" para="Para tu cuenta. La contraseña no se guarda: guardamos una huella que no se puede leer. Si entrás con Google, guardamos solo un identificador y tu nombre de pila." />
        <Dato dato="Barrio y dirección del trabajo" para="El barrio, para avisar a los prestadores de la zona. La dirección la ve solo el prestador que elegís, mientras el trabajo está activo; se borra cuando termina o se cancela." />
        <Dato dato="Celular (opcional, prestadores)" para="No se le muestra a nadie. Todo el contacto es por el chat de la app." />
        <Dato dato="Fotos" para="La foto del problema, las de tus trabajos y la del trabajo terminado, para pedir y elegir presupuestos." />
        <Dato dato="Foto del DNI, selfie y matrícula" para="Solo si pedís verificarte. Las ve únicamente el equipo para revisarlas; a los vecinos les mostramos solo “Verificado” o “Sin verificar”." />
        <Dato dato="Audio del dictado" para="Se manda a ElevenLabs para pasarlo a texto y no se guarda. Se guarda solo el texto que confirmás." />
        <Dato dato="Lo que contás y el diagnóstico" para="El texto del pedido y la orientación que arma la IA, para que los prestadores puedan presupuestar." />
        <Dato dato="Mensajes del chat" para="Para coordinar el trabajo. Los teléfonos y enlaces que se pegan se ocultan. Si hay un reclamo o una denuncia, el equipo puede leer esa conversación." />
        <Dato dato="Reseñas, reclamos y denuncias" para="Para la reputación de los prestadores y para resolver problemas." />
        <Dato dato="Billetera para cobrar (prestadores)" para="La dirección pública de tu billetera Stellar, para que te paguen por la app. No se muestra a nadie." />
        <Dato dato="Registros de pago" para="El monto y el estado de cada pago hecho por la app. No guardamos tarjetas ni claves de billeteras." />
        <Dato dato="Identificador de avisos" para="La dirección que da tu navegador para mandarte avisos, si los activás." />
        <Dato dato="Datos técnicos" para="Para frenar abusos contamos los usos de cada día con una huella de tu conexión, sin guardar tu dirección de internet." />
      </ul>
      <Punto>Usamos tus datos porque los necesitamos para darte el servicio que pediste y con tu consentimiento. No los vendemos ni los usamos para publicidad.</Punto>

      <Seccion>Cuánto tiempo los guardamos</Seccion>
      <Punto>Mientras tengas la cuenta. Si la eliminás, se borra en el momento, salvo:</Punto>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink">
        <li>la dirección del trabajo, que se borra antes: cuando el trabajo termina o se cancela;</li>
        <li>los registros de pagos ya hechos, que se guardan sin tus datos hasta 10 años, por obligaciones contables y para prevenir fraudes;</li>
        <li>los reclamos abiertos, que se guardan sin tus datos hasta que se resuelven y 1 año más;</li>
        <li>las copias de seguridad, de las que lo borrado desaparece en hasta 30 días.</li>
      </ul>
      <Punto>
        Cómo eliminar tu cuenta, con o sin la app:{" "}
        <Link href="/eliminar-cuenta" className="font-semibold text-brand">
          eliminar tu cuenta
        </Link>
        .
      </Punto>

      <Seccion>Quiénes procesan datos por nosotros</Seccion>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink">
        <li>Cloudflare: aloja la app y la base de datos.</li>
        <li>Anthropic: ordena tu pedido, arma el diagnóstico y tu perfil a partir del texto y la foto.</li>
        <li>ElevenLabs: pasa el audio a texto y lee en voz alta.</li>
        <li>Google: si entrás con Google; también sirve las tipografías de la app (ve tu dirección de internet).</li>
        <li>Cosmos Pay: procesa los pagos en USDC sobre la red Stellar.</li>
        <li>Mercado Pago: procesa los pagos en pesos, cuando esté disponible.</li>
        <li>El servicio de avisos de tu navegador (Google, Apple o Mozilla): entrega los avisos, sin su texto.</li>
        <li>Firebase (Google): entrega los avisos de la app de Android, con su texto.</li>
        <li>Resend: manda los mails para elegir otra contraseña o confirmar que se borre una cuenta (solo tu mail), cuando esté activado.</li>
      </ul>
      <Punto>A cada uno le mandamos solo lo necesario para su tarea.</Punto>

      <Seccion>Datos fuera de Argentina</Seccion>
      <Punto>Estos proveedores pueden procesar datos en otros países, por ejemplo en Estados Unidos. Las conexiones van cifradas y solo compartimos lo necesario.</Punto>

      <Seccion>Seguridad</Seccion>
      <Punto>
        Toda la app funciona con conexión cifrada (HTTPS). Las contraseñas se guardan como huellas, las fotos de verificación son privadas, los teléfonos no se
        muestran y solo el equipo accede al panel interno, con una clave.
      </Punto>

      <Seccion>Menores de edad</Seccion>
      <Punto>NecesitoYa no es para menores de 18 años. Si sabemos que una cuenta es de un menor, la eliminamos.</Punto>

      <Seccion>Tus derechos</Seccion>
      <Punto>
        Podés pedir gratis ver tus datos, corregirlos o borrarlos (Ley 25.326 de Protección de Datos Personales). Escribinos a <Correo /> desde el mail de tu
        cuenta. Respondemos un pedido de acceso en hasta 10 días corridos y uno de corrección o borrado en hasta 5 días hábiles. También podés borrar tu cuenta
        vos mismo desde la app.
      </Punto>
      <Punto>
        La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326, atiende las denuncias y reclamos de quienes vean afectados
        sus derechos sobre sus datos personales.
      </Punto>

      <Seccion>Cambios en esta política</Seccion>
      <Punto>Si la cambiamos, te avisamos en la app antes de que el cambio rija y actualizamos la fecha de abajo.</Punto>

      <Seccion>Soporte</Seccion>
      <Punto>
        ¿Dudas, problemas o pedidos? Escribinos a <Correo />. Las reglas de uso están en los{" "}
        <Link href="/terminos" className="font-semibold text-brand">
          términos y condiciones
        </Link>
        .
      </Punto>
      <p className="mt-8 text-[13px] text-ink-500">Iturre Labs · San Salvador de Jujuy, Argentina · Última actualización: 24 de noviembre de 2026.</p>
    </Pantalla>
  );
}
