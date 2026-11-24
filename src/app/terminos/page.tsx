import type { ReactNode } from "react";
import { Cabecera, Pantalla, Seccion, Titulo } from "@/components/ui";
import { Link } from "@/lib/navegacion";

function Punto({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-base leading-relaxed text-ink">{children}</p>;
}

// Términos y condiciones en castellano simple. Lo importante primero: qué hace NecesitoYa y qué no.
export default function Terminos() {
  return (
    <Pantalla>
      <Cabecera volver="/" />
      <Titulo pregunta="Las reglas para usar NecesitoYa.">Términos y condiciones</Titulo>

      <Seccion>Qué es NecesitoYa</Seccion>
      <Punto>NecesitoYa es de Iturre Labs, de San Salvador de Jujuy, Argentina. Contacto: gabriel13iturre@gmail.com.</Punto>
      <Punto>
        Una app que conecta a vecinos de San Salvador de Jujuy y Palpalá con personas que ofrecen oficios. El vecino cuenta qué necesita, recibe hasta
        tres presupuestos y elige. El trabajo lo hace el prestador, no NecesitoYa.
      </Punto>

      <Seccion>El diagnóstico es orientativo</Seccion>
      <Punto>
        El diagnóstico de la IA (qué puede ser, el riesgo, qué hacer ya, materiales y el precio aproximado) es una orientación, no un diagnóstico
        profesional. No reemplaza la visita de un prestador. Con gas o electricidad, el trabajo lo tiene que hacer un gasista o electricista
        matriculado. Ante olor a gas o peligro, cortá el suministro, salí y llamá a emergencias.
      </Punto>

      <Seccion>Cuentas</Seccion>
      <Punto>Para pedir o presupuestar hace falta una cuenta y tener 18 años o más. Sos responsable de lo que se haga con ella. Una persona, una cuenta; un perfil de prestador por cuenta.</Punto>
      <Punto>
        Podés eliminar tu cuenta cuando quieras, desde la app o sin entrar:{" "}
        <Link href="/eliminar-cuenta" className="font-semibold text-brand">
          eliminar tu cuenta
        </Link>
        .
      </Punto>

      <Seccion>Presupuestos y trabajo</Seccion>
      <Punto>
        El precio lo pone cada prestador. El acuerdo del trabajo es entre el vecino y el prestador. El prestador marca el trabajo como terminado con
        una foto, y el vecino confirma que quedó bien; recién ahí puede calificar. Las calificaciones tienen que ser honestas.
      </Punto>
      <Punto>“Verificado” quiere decir que revisamos a mano su DNI (y, si dice “con matrícula”, su matrícula o certificado). No es una garantía del trabajo.</Punto>

      <Seccion>Pagos dentro de la app</Seccion>
      <Punto>
        Si el prestador cobra por la app, el vecino puede pagarle con Cosmos Pay, en USDC sobre la red Stellar. Hoy el pago es directo: le llega al
        prestador en el momento, con la comisión de NecesitoYa separada. Cuando Cosmos Pay habilite el pago protegido, la app lo va a ofrecer y lo
        va a mostrar antes de pagar: en ese caso la plata queda retenida en un contrato hasta que el vecino confirma el trabajo, y si hay un problema
        el vecino puede abrir una disputa que resuelve Cosmos Pay con lo que muestren las dos partes.
      </Punto>
      <Punto>
        NecesitoYa cobra una comisión fija por trabajo pagado por la app, que se muestra antes de pagar. Cosmos Pay descuenta además su propia
        comisión de lo que recibe el prestador. El valor en pesos es aproximado: se calcula con la cotización del día.
      </Punto>
      <Punto>Si pagan por fuera de la app, NecesitoYa no interviene en ese pago.</Punto>

      <Seccion>Cancelaciones y reclamos</Seccion>
      <Punto>El vecino puede cancelar su pedido mientras el trabajo no esté terminado y no haya un pago retenido. Con un pago retenido, lo que corresponde es un reclamo.</Punto>
      <Punto>Cualquiera de las dos partes puede abrir un reclamo con fotos. El equipo lo revisa a mano y puede leer el chat de ese presupuesto como prueba.</Punto>

      <Seccion>Conducta</Seccion>
      <Punto>
        Todo el contacto es por el chat de la app: no compartas teléfonos ni pidas datos o pagos por fuera. No publiques datos de otras personas ni
        contenido ofensivo. Se puede denunciar un perfil o un mensaje y bloquear a otra persona. Podemos suspender perfiles o quitar contenido que no
        cumpla estas reglas.
      </Punto>

      <Seccion>Responsabilidad</Seccion>
      <Punto>NecesitoYa no es parte del contrato del trabajo ni garantiza su resultado. Hacemos lo posible para que la app funcione, pero puede tener cortes.</Punto>

      <Punto>
        Cómo tratamos tus datos está en{" "}
        <Link href="/privacidad" className="font-semibold text-brand">
          privacidad
        </Link>
        .
      </Punto>
      <Seccion>Soporte</Seccion>
      <Punto>
        ¿Dudas o problemas? Escribinos a{" "}
        <a href="mailto:gabriel13iturre@gmail.com" className="font-semibold text-brand">
          gabriel13iturre@gmail.com
        </a>
        .
      </Punto>
      <p className="mt-8 text-[13px] text-ink-500">Iturre Labs · San Salvador de Jujuy, Argentina · Última actualización: 24 de noviembre de 2026.</p>
    </Pantalla>
  );
}
