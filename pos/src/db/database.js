import Dexie from 'dexie'

// Base de datos local (offline-first).
// Es la fuente de verdad durante la operacion; el hosting recibe
// un lote de cierre de turno (ver api/sync.js) con sincronizacion idempotente.
export const db = new Dexie('estudiopilates_pos')

db.version(1).stores({
  config: 'key',
  usuarios: 'id, nombre, rol',
  productos: 'id, codigo, nombre, categoria, tipo, activo',
  cajas: 'id, numero, estado, fecha_apertura',
  ventas: 'id, caja_id, folio, fecha, enviada',
  venta_items: 'id, venta_id, producto_id',
  pagos: 'id, venta_id, venta_idx, metodo',
  egresos: 'id, caja_id, fecha, enviado',
  movimientos: 'id, venta_id, caja_id, producto_id, tipo, fecha, enviado',
  lotes: 'id, caja_id, fecha, estado, error, reintentos'
})

export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function obtenerConfig(key) {
  const fila = await db.config.get(key)
  return fila ? fila.valor : null
}

export async function guardarConfig(key, valor) {
  await db.config.put({ key, valor })
}

// Identificador propio de cada equipo (receptor/tablet). Se genera una sola vez
// y se conserva: distingue el numero de caja y el folio de las ventas entre
// varios dispositivos que operan el mismo dia (H-011).
const CLAVE_DISPOSITIVO = 'dispositivo_id'
let cacheDispositivo = null

export async function dispositivoId() {
  if (cacheDispositivo) return cacheDispositivo
  let id = await obtenerConfig(CLAVE_DISPOSITIVO)
  if (!id) {
    id = uuid()
    await guardarConfig(CLAVE_DISPOSITIVO, id)
  }
  cacheDispositivo = id
  return id
}

// Sufijo corto de 4 caracteres, en mayusculas, usado en numero y folio.
export async function sufijoDispositivo() {
  const id = await dispositivoId()
  return id.replace(/-/g, '').slice(0, 4).toUpperCase()
}

export async function semillaInicial() {
  const existe = await db.productos.count()
  if (existe > 0) return

  await db.transaction('rw', db.productos, async () => {
    await db.productos.bulkAdd([
      { id: 'pk-pil-10', codigo: 'PK-PIL-10', nombre: 'Paquete 10 clases Pilates', categoria: 'Clases', tipo: 'paquete_clases', precio: 1500, stock: 0, stock_minimo: 0, activo: 1 },
      { id: 'pk-bar-10', codigo: 'PK-BAR-10', nombre: 'Paquete 10 clases Barre', categoria: 'Clases', tipo: 'paquete_clases', precio: 1500, stock: 0, stock_minimo: 0, activo: 1 },
      { id: 'pk-unlim', codigo: 'PK-UNLIM', nombre: 'Suscripción mensual ilimitada', categoria: 'Clases', tipo: 'paquete_clases', precio: 2800, stock: 0, stock_minimo: 0, activo: 1 },
      { id: 'ins', codigo: 'INS', nombre: 'Inscripción anual', categoria: 'Inscripción', tipo: 'inscripcion', precio: 300, stock: 0, stock_minimo: 0, activo: 1 },
      { id: 'art-toalla', codigo: 'ART-TOALLA', nombre: 'Toalla deportiva', categoria: 'Prendas', tipo: 'articulo', precio: 250, stock: 30, stock_minimo: 5, activo: 1 },
      { id: 'art-botella', codigo: 'ART-BOTELLA', nombre: 'Botella de agua', categoria: 'Bebidas', tipo: 'articulo', precio: 25, stock: 100, stock_minimo: 20, activo: 1 },
      { id: 'art-shake', codigo: 'ART-SHAKE', nombre: 'Shake proteico', categoria: 'Suplementos', tipo: 'articulo', precio: 45, stock: 60, stock_minimo: 10, activo: 1 },
      { id: 'art-mania', codigo: 'ART-MANIA', nombre: 'Mancuernas ligeras', categoria: 'Accesorios', tipo: 'articulo', precio: 180, stock: 15, stock_minimo: 3, activo: 1 }
    ])
  })
}