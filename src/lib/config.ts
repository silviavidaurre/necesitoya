// Claves y ajustes del servidor. En Cloudflare los entrega el Worker en cada pedido (secretos y `vars`);
// en desarrollo salen de .env.local, que vite.config.ts vuelca en process.env.
// Ningún valor de acá se imprime ni se manda al navegador, salvo los que dicen "público".

type Entorno = Record<string, unknown>;

let entorno: Entorno = {};

export function configurarEntorno(nuevo: Entorno) {
  entorno = nuevo;
}

export function variable(nombre: string): string | undefined {
  const valor = entorno[nombre];
  if (typeof valor === "string" && valor.trim()) return valor.trim();
  if (typeof process === "undefined") return undefined;
  const local = process.env?.[nombre];
  return local && local.trim() ? local.trim() : undefined;
}

export const claveDeIa = () => variable("ANTHROPIC_API_KEY");
export const claveDeVoz = () => variable("ELEVENLABS_API_KEY");
// Identificador público de la app en Google, para "Continuar con Google". No es secreto: viaja al navegador.
export const idDeGoogle = () => variable("GOOGLE_CLIENT_ID");
// Secreto del panel interno de moderación y métricas.
export const secretoDeAdministracion = () => variable("ADMIN_SECRET");
