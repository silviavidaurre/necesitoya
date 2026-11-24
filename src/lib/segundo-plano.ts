// Tareas que siguen después de responder (mandar avisos al celular, por ejemplo): la respuesta no las espera.
// En Cloudflare el Worker registra cómo mantenerlas vivas (waitUntil); en desarrollo simplemente corren.

type Mantener = (tarea: Promise<unknown>) => void;

let mantener: Mantener | null = null;

export function configurarSegundoPlano(nuevo: Mantener | null) {
  mantener = nuevo;
}

export function enSegundoPlano(tarea: Promise<unknown>) {
  const segura = tarea.catch((error) => console.error("[segundo plano]", error));
  if (mantener) mantener(segura);
}
