// Ayudas compartidas por las tandas de pruebas.
// Las cuentas de prueba usan mails que terminan en .test: lo que crean no cuenta en las métricas
// y se puede borrar después sin tocar datos reales.

// Crea una cuenta nueva con mail y contraseña inventados (no se imprimen) y devuelve su llave.
export async function cuentaDePrueba(base, nombre = "prueba") {
  const marca = crypto.randomUUID().slice(0, 12);
  for (let intento = 0; ; intento += 1) {
    try {
      const respuesta = await fetch(`${base}/api/cuenta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${nombre}-${marca}@necesitoya.test`, contrasena: crypto.randomUUID() }),
      });
      const datos = await respuesta.json();
      if (!datos?.clave) throw new Error(`No se pudo crear la cuenta de prueba (${respuesta.status}).`);
      return datos.clave;
    } catch (error) {
      if (intento >= 2) throw error;
    }
  }
}
