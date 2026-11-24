import { leerFoto } from "@/lib/db";

// Devuelve la foto de un pedido. El id es un UUID que solo aparece dentro del pedido.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return Response.json({ error: "Foto inválida." }, { status: 400 });

  const foto = await leerFoto(id);
  if (!foto) return Response.json({ error: "No encontramos esa foto." }, { status: 404 });

  const binario = atob(foto.base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);

  return new Response(bytes, {
    headers: { "content-type": foto.tipo, "x-content-type-options": "nosniff", "cache-control": "public, max-age=86400, immutable" },
  });
}
