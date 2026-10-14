// PIN local del equipo (H-009).
//
// El POS es offline-first y no consulta el servidor en cada cobro, asi que el
// PIN se guarda y se verifica en el propio equipo. No es una contrasena de
// servidor: gatea el dispositivo y hace que cada venta quede atribuida a un
// usuario real, usando el id que viene del servidor (respeta
// fk_ventas_usuario en vez de inventar usuarios locales).
//
// Se almacena como SHA-256 en hex. Web Crypto solo existe en contexto seguro
// (HTTPS o localhost), que es como se despliega la PWA.

export function pinValido(pin) {
  return /^\d{4,6}$/.test(String(pin ?? ''))
}

export async function hashPin(pin) {
  const datos = new TextEncoder().encode(String(pin))
  const buf = await crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
