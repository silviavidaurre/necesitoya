// Achica una foto en el celular antes de mandarla: lado mayor de 900 px y JPEG.
// Así pesa unas decenas de KB en vez de varios MB, que con poca señal es la diferencia entre que llegue o no.

export interface FotoLista {
  tipo: "image/jpeg";
  base64: string;
  vistaPrevia: string;
}

const LADO_MAXIMO = 900;
const TOPE_BASE64 = 560_000;

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("No pudimos abrir esa foto. Probá con otra."));
    };
    imagen.src = url;
  });
}

export async function achicarFoto(archivo: File): Promise<FotoLista> {
  if (!archivo.type.startsWith("image/")) throw new Error("Eso no es una foto.");
  const imagen = await cargarImagen(archivo);

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.naturalWidth, imagen.naturalHeight));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
  const contexto = lienzo.getContext("2d");
  if (!contexto) throw new Error("Este navegador no puede preparar la foto.");
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

  // Baja la calidad hasta que entre en el tope que acepta el servidor.
  for (const calidad of [0.72, 0.55, 0.4]) {
    const vistaPrevia = lienzo.toDataURL("image/jpeg", calidad);
    const base64 = vistaPrevia.slice(vistaPrevia.indexOf(",") + 1);
    if (base64.length <= TOPE_BASE64) return { tipo: "image/jpeg", base64, vistaPrevia };
  }
  throw new Error("La foto es muy pesada. Probá con otra.");
}
