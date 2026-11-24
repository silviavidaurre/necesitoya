import { normalizar, type RubroId } from "./catalogo";
import { limpiarTexto } from "./texto";
import type { Diagnostico, Riesgo } from "./tipos";

// Reglas del diagnóstico que no dependen de la IA. Se aplican siempre, venga de la IA, del modo básico
// o del celular: con gas o electricidad hace falta un matriculado y van primero los pasos de seguridad.

const RIESGOS: Riesgo[] = ["bajo", "medio", "alto"];

const PALABRAS_DE_GAS = ["gas", "calefon", "estufa", "garrafa", "termotanque a gas", "olor a gas", "hornalla", "piloto"];
const PALABRAS_ELECTRICAS = ["termica", "disyuntor", "cortocircuito", "chispa", "enchufe", "cable", "tablero", "se corta la luz", "electric", "toma corriente", "tomacorriente"];

export const SEGURIDAD_GAS = [
  "Cerrá la llave de paso del gas.",
  "Abrí puertas y ventanas para ventilar.",
  "No prendas fuego ni toques interruptores de luz.",
  "Si hay mucho olor, salí de la casa y llamá a la distribuidora de gas o a los bomberos (100).",
];

export const SEGURIDAD_ELECTRICA = [
  "Bajá la térmica o el disyuntor de esa parte de la casa.",
  "No toques cables ni enchufes con las manos mojadas.",
  "No vuelvas a usar ese enchufe o artefacto hasta que lo revisen.",
];

const PREGUNTAS_DE_SIEMPRE = ["¿Cuánto cobrás por ir a ver?", "¿El precio incluye materiales?", "¿Das garantía del trabajo?"];

// Qué matriculado hace falta según el oficio y lo que cuenta el vecino. "" si no hace falta.
export function matriculadoPara(rubro: RubroId, texto: string): Diagnostico["matriculado"] {
  const limpio = normalizar(texto);
  if (rubro === "gas" || PALABRAS_DE_GAS.some((p) => limpio.includes(p))) return "gasista";
  if (rubro === "electricidad" || PALABRAS_ELECTRICAS.some((p) => limpio.includes(p))) return "electricista";
  return "";
}

function lista(valor: unknown, maximoItems: number, maximoLargo: number) {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((v) => limpiarTexto(v, maximoLargo)).filter(Boolean))].slice(0, maximoItems);
}

// Deja el diagnóstico prolijo y con las reglas de seguridad aplicadas. Devuelve null si no hay nada que mostrar.
export function completarDiagnostico(crudo: unknown, rubro: RubroId, texto: string): Diagnostico | null {
  const d = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const matriculado = matriculadoPara(rubro, texto);
  let riesgo: Riesgo = RIESGOS.includes(d.riesgo as Riesgo) ? (d.riesgo as Riesgo) : "bajo";
  // Gas y electricidad nunca son de riesgo bajo.
  if (matriculado && riesgo === "bajo") riesgo = "medio";

  const causa = limpiarTexto(d.causa, 300);
  const queHacerYa = lista(d.queHacerYa, 4, 160);
  const materiales = lista(d.materiales, 6, 80);
  const preguntas = lista(d.preguntas, 4, 140);
  const seguridad = matriculado === "gasista" ? SEGURIDAD_GAS : matriculado === "electricista" ? SEGURIDAD_ELECTRICA : [];

  if (!causa && queHacerYa.length === 0 && materiales.length === 0 && seguridad.length === 0) return null;
  return {
    causa,
    riesgo,
    // Con gas o electricidad mandan los pasos de seguridad fijos: los de la IA suelen repetirlos con otras palabras.
    queHacerYa: seguridad.length > 0 ? [] : queHacerYa,
    materiales,
    preguntas: preguntas.length > 0 ? preguntas : PREGUNTAS_DE_SIEMPRE,
    matriculado,
    seguridad,
  };
}

// Diagnóstico mínimo sin IA: no adivina la causa, pero aplica las reglas de seguridad y sugiere preguntas.
export function diagnosticoBasico(rubro: RubroId, texto: string): Diagnostico | null {
  const matriculado = matriculadoPara(rubro, texto);
  return completarDiagnostico(
    {
      causa: "",
      riesgo: matriculado ? "medio" : "bajo",
      queHacerYa: [],
      materiales: [],
      preguntas: matriculado ? [`¿Tenés matrícula de ${matriculado}?`, ...PREGUNTAS_DE_SIEMPRE] : PREGUNTAS_DE_SIEMPRE,
    },
    rubro,
    texto,
  );
}
