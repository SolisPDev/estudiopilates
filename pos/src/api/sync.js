import { db, obtenerConfig, guardarConfig } from '../db/database.js'

// La PWA y la API viven en el mismo hosting cPanel:
//   PWA   -> /pos/
//   API   -> /api/cierres
// Por default se usa el mismo origen. En desarrollo se puede
// apuntar a otro host con VITE_API_BASE.
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const TOKEN_KEY = 'api_token'

export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function obtenerToken() {
  return (await obtenerConfig(TOKEN_KEY)) ?? 'cambiar-token'
}

export async function guardarToken(token) {
  await guardarConfig(TOKEN_KEY, token)
}

async function usuarioActual() {
  const id = parseInt((await obtenerConfig('usuario_id')) ?? '1', 10)
  return Number.isFinite(id) ? id : 1
}

async function detalleVenta(venta) {
  const usuarioId = await usuarioActual()
  const items = await db.venta_items.where('venta_id').equals(venta.id).toArray()
  const pagos = await db.pagos.where('venta_id').equals(venta.id).sortBy('venta_idx')

  return {
    id: venta.id,
    folio: venta.folio,
    caja_id: venta.caja_id,
    usuario_id: usuarioId,
    cliente: venta.cliente ?? null,
    fecha: venta.fecha,
    subtotal: Number(venta.subtotal),
    impuesto: Number(venta.impuesto ?? 0),
    total: Number(venta.total),
    items: items.map((i) => ({
      id: i.id,
      producto_id: i.producto_id,
      nombre: i.nombre,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario),
      subtotal: Number(i.subtotal)
    })),
    pagos: pagos.map((p) => ({
      id: p.id,
      metodo: p.metodo,
      monto: Number(p.monto),
      referencia: p.referencia ?? null,
      fecha: p.fecha
    }))
  }
}

// Construye el lote completo de cierre de turno para una caja.
// Cada venta/egreso/movimiento lleva su uuid: el servidor es
// idempotente, por lo que el lote puede reenviarse sin duplicar.
export async function construirLote(caja) {
  const usuarioId = await usuarioActual()
  const ventas = await db.ventas.where('caja_id').equals(caja.id).toArray()
  const egresos = await db.egresos.where('caja_id').equals(caja.id).toArray()
  const movimientos = await db.movimientos.where('caja_id').equals(caja.id).toArray()

  const ventasDetalle = []
  let totalIngresos = 0
  let efectivo = 0
  let transferencia = 0
  let tarjeta = 0

  for (const v of ventas) {
    const detalle = await detalleVenta(v)
    ventasDetalle.push(detalle)
    totalIngresos += detalle.total
    for (const p of detalle.pagos) {
      if (p.metodo === 'efectivo') efectivo += p.monto
      if (p.metodo === 'transferencia') transferencia += p.monto
      if (p.metodo === 'tarjeta') tarjeta += p.monto
    }
  }

  const totalEgresos = egresos.reduce((acc, e) => acc + Number(e.monto), 0)
  const efectivoEsperado = Number(caja.fondo_inicial ?? 0) + efectivo - totalEgresos

  return {
    lote_id: `CIERRE-${caja.id}`,
    caja: {
      id: caja.id,
      numero: caja.numero,
      usuario_id_apertura: caja.usuario_apertura ?? usuarioId,
      usuario_id_cierre: caja.usuario_cierre ?? usuarioId,
      fondo_inicial: Number(caja.fondo_inicial ?? 0),
      fecha_apertura: caja.fecha_apertura,
      fecha_cierre: caja.fecha_cierre,
      total_ventas: ventasDetalle.length,
      total_ingresos: totalIngresos,
      total_efectivo: efectivo,
      total_transferencia: transferencia,
      total_tarjeta: tarjeta,
      total_egresos: totalEgresos,
      efectivo_esperado: efectivoEsperado,
      efectivo_contado: caja.efectivo_contado != null ? Number(caja.efectivo_contado) : null,
      estado: 'cerrada'
    },
    ventas: ventasDetalle,
    egresos: egresos.map((e) => ({
      id: e.id,
      caja_id: e.caja_id,
      usuario_id: usuarioId,
      categoria: e.categoria,
      concepto: e.concepto,
      monto: Number(e.monto),
      responsable: e.responsable ?? null,
      fecha: e.fecha
    })),
    movimientos: movimientos.map((m) => ({
      id: m.id,
      venta_id: m.venta_id ?? null,
      producto_id: m.producto_id,
      tipo: m.tipo,
      cantidad: Number(m.cantidad),
      referencia: m.referencia ?? null,
      fecha: m.fecha
    })),
    totales: {
      ventas: ventasDetalle.length,
      total: totalIngresos,
      efectivo,
      transferencia,
      tarjeta,
      egresos: totalEgresos
    }
  }
}

export async function enviarLote(caja) {
  const token = await obtenerToken()
  const lote = await construirLote(caja)

  const res = await fetch(`${API_BASE}/cierres`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Token': token
    },
    body: JSON.stringify(lote)
  })

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j.error ?? msg
    } catch {
      /* sin cuerpo JSON */
    }
    throw new Error(msg)
  }

  const json = await res.json()

  await db.transaction('rw', db.ventas, db.egresos, db.movimientos, db.lotes, async () => {
    const ventas = await db.ventas.where('caja_id').equals(caja.id).toArray()
    for (const v of ventas) {
      await db.ventas.put({ ...v, enviada: 1 })
    }
    const egresos = await db.egresos.where('caja_id').equals(caja.id).toArray()
    for (const e of egresos) {
      await db.egresos.put({ ...e, enviado: 1 })
    }
    const movimientos = await db.movimientos.where('caja_id').equals(caja.id).toArray()
    for (const m of movimientos) {
      await db.movimientos.put({ ...m, enviado: 1 })
    }
    await db.lotes.put({
      id: `CIERRE-${caja.id}`,
      caja_id: caja.id,
      fecha: new Date().toISOString(),
      estado: 'enviado',
      error: null,
      reintentos: 0
    })
  })

  return json
}

// Registra el lote como pendiente/fallido segun el resultado.
export async function marcarLote(idCaja, estado, error) {
  const id = `CIERRE-${idCaja}`
  const actual = await db.lotes.get(id)
  await db.lotes.put({
    id,
    caja_id: idCaja,
    fecha: actual?.fecha ?? new Date().toISOString(),
    estado,
    error: error ?? null,
    reintentos: (actual?.reintentos ?? 0) + 1
  })
}

export async function lotesPendientes() {
  return (await db.lotes.toArray()).filter((l) => l.estado !== 'enviado')
}

export async function sincronizarPendientes() {
  const pendientes = await lotesPendientes()
  const resultados = []
  for (const lote of pendientes) {
    const caja = await db.cajas.get(lote.caja_id)
    if (!caja || caja.estado !== 'cerrada') continue
    try {
      await enviarLote(caja)
      resultados.push({ caja_id: lote.caja_id, ok: true })
    } catch (err) {
      await marcarLote(lote.caja_id, 'fallido', err.message)
      resultados.push({ caja_id: lote.caja_id, ok: false, error: err.message })
    }
  }
  return resultados
}