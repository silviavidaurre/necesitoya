import type { ReactNode } from "react";
import { Cabecera, Pantalla, Seccion, Titulo } from "@/components/ui";

function Punto({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-base leading-relaxed text-ink">{children}</p>;
}

// Privacidad y condiciones, en una sola página y en castellano simple: qué se guarda, para qué y cómo borrarlo.
export default function Privacidad() {
  return (
    <Pantalla>
      <Cabecera volver="/" />
      <Titulo pregunta="Qué guardamos, para qué, y cómo pedís que lo borremos.">Privacidad y condiciones</Titulo>

      <Seccion>Qué guardamos</Seccion>
      <Punto>Tu nombre, tu barrio y lo que contás en tu pedido (el texto y la foto, si mandás una).</Punto>
      <Punto>Si ofrecés un servicio: tu nombre, tus oficios, los barrios donde trabajás, lo que escribís sobre tu trabajo, las fotos que subís y, si querés cargarlo, tu celular.</Punto>
      <Punto>Los presupuestos, los mensajes del chat y las calificaciones.</Punto>
      <Punto>La app se puede usar sin cuenta: tu celular guarda una llave para que puedas volver a tu pedido o a tu perfil.</Punto>

      <Seccion>Si creás una cuenta con mail</Seccion>
      <Punto>
        Es opcional. Guardamos tu mail y una huella de tu contraseña que no se puede leer: ni nosotros sabemos cuál es. No te mandamos correos de
        publicidad.
      </Punto>

      <Seccion>Si entrás con Google</Seccion>
      <Punto>
        Es opcional. De tu cuenta de Google guardamos solo un identificador y tu nombre de pila, para que recuperes tu perfil y tus pedidos en otro
        celular. No guardamos tu mail ni tu foto, y no leemos nada más de tu cuenta.
      </Punto>

      <Seccion>Quién ve qué</Seccion>
      <Punto>Los prestadores ven tu pedido, tu barrio y tu nombre de pila. Nadie ve tu teléfono.</Punto>
      <Punto>El perfil de un prestador (nombre, oficios, fotos y calificaciones) es público. Su celular no se muestra.</Punto>

      <Seccion>Inteligencia artificial y voz</Seccion>
      <Punto>
        Para ordenar tu pedido o tu perfil, el texto y la foto se envían a Anthropic (Claude). Si dictás o pedís que la app lea en voz alta, el audio
        y el texto se envían a ElevenLabs. Se usan solo para darte ese resultado.
      </Punto>

      <Seccion>Lo que no hacemos</Seccion>
      <Punto>No vendemos tus datos ni los usamos para publicidad.</Punto>

      <Seccion>Condiciones</Seccion>
      <Punto>
        NecesitoYa conecta vecinos con personas que ofrecen servicios. El trabajo, el precio final y el pago los acuerdan entre ustedes: NecesitoYa
        no es parte de ese acuerdo ni garantiza el resultado. El precio que muestra la app es aproximado.
      </Punto>
      <Punto>No publiques datos de otras personas ni contenido ofensivo. Podemos quitar pedidos o perfiles que no cumplan con esto.</Punto>

      <Seccion>Borrar tus datos</Seccion>
      <Punto>
        Escribinos a{" "}
        <a href="mailto:gabriel13iturre@gmail.com" className="font-semibold text-brand">
          gabriel13iturre@gmail.com
        </a>{" "}
        y borramos tu pedido, tu perfil o tu cuenta.
      </Punto>
      <p className="mt-8 text-[13px] text-ink-500">San Salvador de Jujuy, noviembre de 2026.</p>
    </Pantalla>
  );
}
