import { usarAlmacen } from "@/lib/db";
import { almacenArchivo } from "@/servidor/local/almacen-archivo";
import { atender } from "@/servidor/rutas";

// Entrada de la API en desarrollo: guarda los datos en un archivo local.
usarAlmacen(almacenArchivo);

export { atender };
