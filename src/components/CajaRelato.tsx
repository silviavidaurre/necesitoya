import { useCallback, useEffect, useRef } from "react";
import { BotonMic } from "@/components/BotonMic";
import { useDictado } from "@/components/useDictado";
import { Estado, claseCampo } from "@/components/ui";

// Bloque para contar algo con la voz o escribiendo. Por defecto, micrófono grande arriba y el texto debajo;
// con `textoPrimero` (pantalla Contar del vecino), el campo arriba con su etiqueta y el micrófono debajo.
export function CajaRelato({
  valor,
  alCambiar,
  invitacion,
  ejemplo,
  alDetener,
  alDictar,
  alOcuparse,
  textoPrimero = false,
  etiqueta,
}: {
  valor: string;
  alCambiar: (actualizar: (anterior: string) => string) => void;
  invitacion: string;
  ejemplo: string;
  // Recibe la función para cerrar el dictado. La pantalla la llama antes de avanzar y espera el texto completo:
  // cuando el audio se transcribe en el servidor, lo último que se dijo llega un momento después de cortar.
  alDetener?: (terminar: () => Promise<string>) => void;
  // Avisa que la persona usó la voz (y no el teclado), para que la app también le responda hablando.
  alDictar?: () => void;
  // Avisa si hay voz en curso (grabando o pasando a texto), para que la pantalla habilite "Continuar"
  // aunque el texto todavía no haya llegado.
  alOcuparse?: (ocupado: boolean) => void;
  textoPrimero?: boolean;
  // Etiqueta del campo de texto (por defecto, "O escribilo").
  etiqueta?: string;
}) {
  // Copia al día del texto, para sumarle una frase sin esperar a que la pantalla se vuelva a dibujar.
  const texto = useRef(valor);
  useEffect(() => {
    texto.current = valor;
  }, [valor]);

  const agregarFrase = useCallback(
    (frase: string) => {
      // El dictado no puede pasarse del largo que acepta el servidor.
      const completo = (texto.current ? `${texto.current} ${frase}` : frase).slice(0, 3000);
      texto.current = completo;
      alCambiar(() => completo);
      alDictar?.();
    },
    [alCambiar, alDictar],
  );
  const dictado = useDictado(agregarFrase);
  const { terminar } = dictado;
  const terminarDictado = useCallback(async () => {
    await terminar();
    return texto.current;
  }, [terminar]);
  useEffect(() => {
    alDetener?.(terminarDictado);
  }, [alDetener, terminarDictado]);

  const ocupado = dictado.escuchando || dictado.transcribiendo || Boolean(dictado.parcial);
  useEffect(() => {
    alOcuparse?.(ocupado);
  }, [alOcuparse, ocupado]);

  const microfono = dictado.soportado && (
    <div className={`flex flex-col items-center ${textoPrimero ? "mt-6" : ""}`}>
      <BotonMic
        grande
        principal={!valor}
        escuchando={dictado.escuchando}
        ocupado={dictado.transcribiendo}
        onClick={dictado.escuchando ? dictado.parar : dictado.empezar}
        etiqueta={dictado.escuchando ? "Terminar de grabar" : valor ? "Seguir contando con la voz" : invitacion}
      />
      <p className="mt-5 min-h-6 text-center text-[17px] font-bold text-ink" aria-live="polite">
        {dictado.escuchando ? (
          <Estado tono="mal">Grabando. Tocá para terminar</Estado>
        ) : dictado.transcribiendo ? (
          <Estado>Pasando a texto</Estado>
        ) : valor ? (
          "Tocá para seguir contando"
        ) : (
          invitacion
        )}
      </p>
      {dictado.error && (
        <p role="alert" className="mt-1 text-center text-[15px] font-medium text-danger">
          {dictado.error}
        </p>
      )}
    </div>
  );

  const campo = (
    <label className={`block ${textoPrimero ? "" : "mt-5"}`}>
      <span className={textoPrimero ? "text-sm font-semibold text-ink-500" : "text-[15px] font-semibold text-ink"}>
        {etiqueta ?? (dictado.soportado ? "O escribilo" : "Escribilo acá")}
      </span>
      <textarea
        className={`${claseCampo} mt-2 resize-none ${textoPrimero ? "h-[132px] rounded-[18px] p-4 text-[17px] leading-[1.45]" : "min-h-24"}`}
        value={dictado.parcial ? `${valor} ${dictado.parcial}`.trim() : valor}
        onChange={(e) => {
          const escrito = e.target.value;
          texto.current = escrito;
          alCambiar(() => escrito);
        }}
        readOnly={dictado.escuchando}
        placeholder={ejemplo}
        maxLength={3000}
      />
    </label>
  );

  return textoPrimero ? (
    <div>
      {campo}
      {microfono}
    </div>
  ) : (
    <div>
      {microfono}
      {campo}
    </div>
  );
}
