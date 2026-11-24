import { usarAlmacen } from "@/lib/db";
import { almacenArchivo } from "./almacen-archivo";
import { atender } from "./rutas";

// Entrada de la API en desarrollo: guarda los datos en un archivo local.
usarAlmacen(almacenArchivo);

export { atender };
