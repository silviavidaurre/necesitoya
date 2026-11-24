// Direcciones Stellar (cuentas G...): se controla el formato y el dígito verificador, para que un error al copiar
// no deje un pago yendo a una cuenta que no existe.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(texto: string): Uint8Array | null {
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const letra of texto) {
    const indice = ALFABETO.indexOf(letra);
    if (indice < 0) return null;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(salida);
}

function crc16xmodem(bytes: Uint8Array) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

export function billeteraValida(direccion: string) {
  if (!/^G[A-Z2-7]{55}$/.test(direccion)) return false;
  const bytes = base32(direccion);
  if (!bytes || bytes.length !== 35 || bytes[0] !== 6 << 3) return false;
  const cuerpo = bytes.slice(0, 33);
  const control = bytes[33] | (bytes[34] << 8);
  return crc16xmodem(cuerpo) === control;
}

// Para mostrarla sin ocupar toda la pantalla: GABC…WXYZ.
export function billeteraCorta(direccion: string) {
  return direccion.length > 12 ? `${direccion.slice(0, 4)}…${direccion.slice(-4)}` : direccion;
}
