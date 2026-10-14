import { useEffect, useState } from 'react'
import { db, obtenerConfig, guardarConfig, sufijoDispositivo } from '../db/database.js'
import { uuid } from '../api/sync.js'
import { imprimirTicket } from '../lib/impresora.js'

const METODOS = [
  { id: 'efectivo', label: 'Efectivo', color: 'bg-exito' },
  { id: 'transferencia', label: 'Transferencia', color: 'bg-pizarra' },
  { id: 'tarjeta', label: 'Tarjeta', color: 'bg-marina-claro' }
]

export default function Venta({ caja, recargarCaja, irACaja }) {
  const [productos, setProductos] = useState([])
  const [categoria, setCategoria] = useState('todas')
  const [cart, setCart] = useState([])
  const [cliente, setCliente] = useState('')
  const [pagos, setPagos] = useState([])
  const [referencia, setReferencia] = useState('')
  const [recibo, setRecibo] = useState(null)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })

  useEffect(() => {
    ;(async () => {
      const lista = await db.productos.where('activo').equals(1).toArray()
      setProductos(lista)
    })()
  }, [])

  const categorias = ['todas', ...new Set(productos.map((p) => p.categoria))]
  const visibles = categoria === 'todas' ? productos : productos.filter((p) => p.categoria === categoria)

  const subtotal = cart.reduce((acc, i) => acc + i.precio * i.cantidad, 0)

  function agregar(p) {
    if (p.tipo === 'articulo' && p.stock <= 0) return
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.producto_id === p.id)
      if (idx >= 0) {
        const copia = [...prev]
        const limite = p.tipo === 'articulo' ? Math.max(1, p.stock) : Infinity
        if (copia[idx].cantidad >= limite) return prev
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + 1 }
        return copia
      }
      return [...prev, { producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 }]
    })
  }

  function cambiarCantidad(idx, delta) {
    setCart((prev) => {
      const copia = [...prev]
      let cantidad = Math.max(1, copia[idx].cantidad + delta)
      const prod = productos.find((p) => p.id === copia[idx].producto_id)
      if (prod && prod.tipo === 'articulo') cantidad = Math.min(cantidad, Math.max(1, prod.stock))
      copia[idx] = { ...copia[idx], cantidad }
      return copia
    })
  }

  function quitar(idx) {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const pagado = pagos.reduce((a, p) => a + p.monto, 0)

  function agregarPago(metodo) {
    const restante = subtotal - pagado
    if (restante <= 0) return
    // Se llena el restante completo; el monto puede editarse a mano
    // (p. ej. si el cliente paga de mas y pide vuelto).
    setPagos((prev) => [...prev, { id: uuid(), metodo, monto: restante, venta_idx: prev.length }])
  }

  function editarMonto(id, monto) {
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, monto: Math.max(0, Number(monto) || 0) } : p)))
  }

  // referencia de ultimo pago de transferencia/tarjeta
  useEffect(() => {
    const ultimo = [...pagos].reverse().find((p) => p.metodo !== 'efectivo')
    setReferencia(ultimo?.referencia ?? '')
  }, [pagos])

  function limpiar() {
    setCart([])
    setPagos([])
    setCliente('')
    setReferencia('')
    setRecibo(null)
  }

  async function cobrar() {
    if (!caja) {
      setMensaje({ tipo: 'error', texto: 'Abre una caja antes de cobrar' })
      return
    }
    if (cart.length === 0 || pagos.length === 0 || pagado < subtotal - 0.001) {
      setMensaje({ tipo: 'error', texto: 'Completa el carrito y cubre el total con pagos' })
      return
    }
    if (pagos.some((p) => p.metodo !== 'efectivo' && !referencia.trim())) {
      setMensaje({ tipo: 'error', texto: 'Captura la referencia (clave de rastreo / tarjeta)' })
      return
    }

    const ventaId = uuid()
    const fecha = new Date().toISOString()
    const contador = (parseInt((await obtenerConfig('ultimo_folio')) ?? '0', 10)) + 1
    await guardarConfig('ultimo_folio', String(contador))
    // El folio lleva el sufijo del equipo: dos dispositivos que cobran el mismo
    // dia no pueden chocar el consecutivo local (H-011).
    const sufijo = await sufijoDispositivo()

    const venta = {
      id: ventaId,
      caja_id: caja.id,
      folio: `V-${new Date().toISOString().slice(5, 10).replace('-', '')}-${sufijo}-${String(
        contador
      ).padStart(4, '0')}`,
      cliente: cliente.trim() || null,
      fecha,
      subtotal,
      impuesto: 0,
      total: subtotal,
      enviada: 0
    }

    const itemsDelCarrito = cart.map((i) => ({
      id: uuid(),
      venta_id: ventaId,
      producto_id: i.producto_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.precio,
      subtotal: i.precio * i.cantidad
    }))

    const pagosFinales = pagos.map((p) => ({
      id: p.id,
      venta_id: ventaId,
      venta_idx: p.venta_idx,
      metodo: p.metodo,
      monto: Math.round(p.monto * 100) / 100,
      referencia: p.metodo === 'efectivo' ? null : referencia.trim(),
      fecha
    }))

    try {
      await db.transaction(
        'rw',
        [db.ventas, db.venta_items, db.pagos, db.movimientos, db.productos],
        async () => {
          await db.ventas.add(venta)
          await db.venta_items.bulkAdd(itemsDelCarrito)
          await db.pagos.bulkAdd(pagosFinales)
          for (const i of cart) {
            const prod = await db.productos.get(i.producto_id)
            if (prod && prod.tipo === 'articulo') {
              await db.productos.update(i.producto_id, { stock: prod.stock - i.cantidad })
              await db.movimientos.add({
                id: uuid(),
                venta_id: ventaId,
                caja_id: caja.id,
                producto_id: i.producto_id,
                tipo: 'venta',
                cantidad: -i.cantidad,
                fecha,
                enviado: 0
              })
            }
          }
        }
      )
      const config = {
        nombre_estudio: 'Estudio Pilates & Barre',
        direccion: 'Recepción',
        numero_caja: caja.numero
      }
      await imprimirTicket(venta, itemsDelCarrito, pagosFinales, config)
      limpiar()
      setRecibo({ venta, items: itemsDelCarrito, pagos: pagosFinales, vuelto: Math.max(0, pagado - subtotal) })
      setMensaje({ tipo: 'ok', texto: `Venta ${venta.folio} registrada` })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    }
  }

  if (!caja) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center">
          <div className="text-xl font-bold text-tinta mb-2">No hay caja abierta</div>
          <button
            onClick={irACaja}
            className="bg-marina text-crema px-6 py-3 rounded-full font-bold uppercase tracking-wide"
          >
            Ir a Caja
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* Catalogo */}
      <section>
        <div className="flex gap-1 flex-wrap mb-2">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`px-3 py-1 rounded-full text-sm font-bold ${
                categoria === c ? 'bg-marina text-crema' : 'bg-crema text-pizarra border'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visibles.map((p) => {
            const bajoStock = p.tipo === 'articulo' && p.stock <= p.stock_minimo
            return (
              <button
                key={p.id}
                onClick={() => agregar(p)}
                disabled={p.tipo === 'articulo' && p.stock <= 0}
                className={`rounded-xl p-3 text-left border-2 bg-crema ${
                  bajoStock
                    ? 'border-aviso'
                    : p.tipo === 'articulo' && p.stock <= 0
                      ? 'border-taupe/40 opacity-40'
                      : 'border-transparent hover:border-taupe'
                }`}
              >
                <div className="font-bold text-marina leading-tight">{p.nombre}</div>
                <div className="text-marina font-bold mt-1">${p.precio.toFixed(2)}</div>
                {p.tipo === 'articulo' && (
                  <div className={`text-xs ${bajoStock ? 'text-aviso' : 'text-taupe'}`}>
                    Stock: {p.stock}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Carrito / cobro */}
      <section className="bg-crema rounded-2xl shadow p-4 flex flex-col gap-3 h-full">
        <input
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          placeholder="Cliente (opcional)"
          className="border rounded-lg px-3 py-2 w-full"
        />

        <div className="flex-1 overflow-y-auto max-h-64">
          {cart.length === 0 && <div className="text-taupe text-sm text-center py-8">Carrito vacío</div>}
          {cart.map((i, idx) => (
            <div key={i.producto_id} className="flex items-center gap-2 py-2 border-b">
              <div className="flex-1">
                <div className="font-semibold text-sm">{i.nombre}</div>
                <div className="text-xs text-pizarra">${i.precio.toFixed(2)} c/u</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => cambiarCantidad(idx, -1)} className="w-8 h-8 rounded bg-hueso font-bold">-</button>
                <span className="w-8 text-center">{i.cantidad}</span>
                <button onClick={() => cambiarCantidad(idx, 1)} className="w-8 h-8 rounded bg-hueso font-bold">+</button>
                <button onClick={() => quitar(idx)} className="w-8 h-8 rounded bg-error/15 text-error font-bold">x</button>
              </div>
            </div>
          ))}
        </div>

        <div className="font-bold text-lg flex justify-between">
          <span>TOTAL</span>
          <span className="text-marina">${subtotal.toFixed(2)}</span>
        </div>

        {cart.length > 0 && subtotal - pagado > 0.001 && (
          <div className="text-sm font-semibold text-aviso -mt-1">
            Faltan ${(subtotal - pagado).toFixed(2)} por pagar
          </div>
        )}

        {pagos.length > 0 && (
          <div className="border rounded-lg p-2 space-y-1">
            {pagos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="w-28 font-semibold">{METODOS.find((m) => m.id === p.metodo)?.label}</span>
                <input
                  type="number"
                  value={p.monto}
                  onChange={(e) => editarMonto(p.id, e.target.value)}
                  className="border rounded px-2 py-1 w-24 text-right"
                />
                {p.metodo === 'efectivo' && pagado > subtotal && (
                  <span className="text-exito text-xs">Vuelto ${(pagado - subtotal).toFixed(2)}</span>
                )}
                <button onClick={() => setPagos((prev) => prev.filter((q) => q.id !== p.id))} className="text-error ml-auto">Quitar</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {METODOS.map((m) => (
            <button
              key={m.id}
              onClick={() => agregarPago(m.id)}
              className={`${m.color} text-crema rounded-full py-3 font-bold text-sm uppercase tracking-wide`}
            >
              + {m.label}
            </button>
          ))}
        </div>

        <input
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Ref: clave de rastreo / últimos 4 de tarjeta"
          className="border rounded-lg px-3 py-2 w-full"
        />

        {mensaje.texto && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              mensaje.tipo === 'ok' ? 'bg-exito/15 text-exito' : 'bg-error/15 text-error'
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        <button
          onClick={cobrar}
          disabled={!(cart.length > 0 && pagos.length > 0 && pagado >= subtotal - 0.001)}
          className="bg-marina disabled:bg-taupe/50 text-crema rounded-full py-4 text-lg font-bold uppercase tracking-wide"
        >
          COBRAR ${subtotal.toFixed(2)}
        </button>
      </section>

      {/* Modal recibo */}
      {recibo && (
        <div className="fixed inset-0 bg-marina/70 grid place-items-center p-4 z-50">
          <div className="bg-crema rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">Venta registrada</h3>
            <p className="text-sm text-pizarra">Folio {recibo.venta.folio}</p>
            {recibo.vuelto > 0 && (
              <p className="mt-2 text-exito font-bold">Vuelto: ${recibo.vuelto.toFixed(2)}</p>
            )}
            <button onClick={() => setRecibo(null)} className="mt-4 w-full bg-marina text-crema rounded-lg py-3 font-bold">
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}