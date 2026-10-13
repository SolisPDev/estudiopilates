// Impresion de tickets: termica ESC/POS 80mm via Web Serial.
// Si no hay impresora conectada/con permiso, se ofrece una vista
// imprimible (PDF/hoja) como respaldo.

const TXT_NORMAL = 0x00
const TXT_BOLD = 0x08

function centro(bytes, ancho) {
  // no usado por ahora: reservado para formato de 2 columnas
  void ancho
  return bytes
}

function iniciar() {
  return new Uint8Array([0x1b, 0x40])
}

function fuente() {
  return new Uint8Array([0x1b, 0x4d, 0x00]) // fuente A (normal)
}

function alineacion(a) {
  // a: 0 izquierda, 1 centro, 2 derecha
  return new Uint8Array([0x1b, 0x61, a])
}

function estilo(bold) {
  return new Uint8Array([0x1b, 0x45, bold ? TXT_BOLD : TXT_NORMAL])
}

function tamanio(w, h) {
  const v = ((w & 0xf) << 4) | (h & 0xf)
  return new Uint8Array([0x1d, 0x21, v])
}

function corte() {
  return new Uint8Array([0x1d, 0x56, 0x42, 0x00])
}

function lineas(str) {
  return new TextEncoder().encode(str)
}

const SEP = '================================'

function textoPlano(venta, items, pagos, config) {
  const ts = new Date(venta.fecha)
  const fecha = ts.toLocaleDateString('es-MX')
  const hora = ts.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  let formato = `                ${config.nombre_estudio}\n`
  formato += `     ${config.direccion}\n\n`
  formato += `        TICKET DE VENTA\n`
  formato += `Folio: ${venta.folio}   Caja: ${config.numero_caja}\n`
  formato += `Fecha: ${fecha}  ${hora}\n`
  formato += SEP + '\n'
  for (const i of items) {
    formato += `${i.nombre}\n  ${i.cantidad} x $${i.precio_unitario.toFixed(2)}   $${i.subtotal.toFixed(2)}\n`
  }
  formato += SEP + '\n'
  formato += `SUBTOTAL          $${venta.subtotal.toFixed(2)}\n`
  formato += `TOTAL             $${venta.total.toFixed(2)}\n`
  formato += SEP + '\n'
  for (const p of pagos) {
    const etiqueta = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[p.metodo] ?? p.metodo
    let ln = `${etiqueta}      $${p.monto.toFixed(2)}`
    if (p.referencia) ln += `\nRef: ${p.referencia}`
    formato += ln + '\n'
  }
  formato += '\nGracias por tu visita\n'
  formato += '    Estudio Pilates & Barre\n'
  return formato
}

function bytesTicket(venta, items, pagos, config) {
  const partes = [
    iniciar(),
    fuente(),
    tamanio(1, 1),
    alineacion(1),
    estilo(true),
    lineas(config.nombre_estudio),
    estilo(false),
    lineas(`       ${config.direccion}`),
    lineas('\n'),
    lineas('TICKET DE VENTA'),
    lineas('\n'),
    alineacion(0),
    lineas(`Folio: ${venta.folio}   Caja: ${config.numero_caja}`),
    lineas(`Fecha: ${new Date(venta.fecha).toLocaleString('es-MX')}`),
    lineas(SEP),
    alineacion(0)
  ]
  for (const i of items) {
    partes.push(
      lineas(i.nombre),
      lineas(`  ${i.cantidad} x $${Number(i.precio_unitario).toFixed(2)}       $${Number(i.subtotal).toFixed(2)}`)
    )
  }
  partes.push(lineas(SEP), lineas(`SUBTOTAL                $${Number(venta.subtotal).toFixed(2)}`))
  partes.push(estilo(true), lineas(`TOTAL                   $${Number(venta.total).toFixed(2)}`), estilo(false))
  partes.push(lineas(SEP))
  for (const p of pagos) {
    const etiqueta = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[p.metodo] ?? p.metodo
    partes.push(lineas(`${etiqueta}               $${Number(p.monto).toFixed(2)}`))
    if (p.referencia) partes.push(lineas(`Ref: ${p.referencia}`))
  }
  partes.push(lineas('\nGracias por tu visita'), lineas('Estudio Pilates & Barre'))
  partes.push(centro([], 32), corte())

  const longitudes = partes.map((p) => p.length)
  const total = longitudes.reduce((a, b) => a + b, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of partes) {
    out.set(p, i)
    i += p.length
  }
  return out
}

let puertoSerial = null

export const tieneWebSerial = () => typeof navigator.serial !== 'undefined'

export async function conectarImpresora() {
  if (!tieneWebSerial()) throw new Error('Este navegador no soporta Web Serial')
  puertoSerial = await navigator.serial.requestPort()
  await puertoSerial.open({ baudRate: 9600 })
  return true
}

async function escribirPorSerial(bytes) {
  if (!puertoSerial) throw new Error('Impresora no conectada')
  try {
    const writer = puertoSerial.writable.getWriter()
    await writer.write(bytes)
    writer.releaseLock()
  } catch {
    await puertoSerial.close()
    puertoSerial = null
    throw new Error('Fallo la escritura a la impresora')
  }
}

export async function imprimirTicket(venta, items, pagos, config) {
  if (puertoSerial) {
    try {
      await escribirPorSerial(bytesTicket(venta, items, pagos, config))
      return { via: 'serial' }
    } catch {
      /* cae a respaldo */
    }
  }
  const w = window.open('', '_blank', 'width=420,height=600')
  if (w) {
    const txt = textoPlano(venta, items, pagos, config)
    w.document.write(`<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;">${txt.replace(/</g, '&lt;')}</pre>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
    return { via: 'hoja' }
  }
  return { via: 'solo-pantalla' }
}