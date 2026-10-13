import { useEffect, useState } from 'react'
import { db } from '../db/database.js'
import { uuid } from '../api/sync.js'

export default function Inventario() {
  const [productos, setProductos] = useState([])
  const [ajuste, setAjuste] = useState({ producto_id: '', tipo: 'entrada', cantidad: '' })

  async function cargar() {
    const lista = await db.productos.toArray()
    setProductos(lista.sort((a, b) => a.nombre.localeCompare(b.nombre)))
  }

  useEffect(() => {
    cargar()
  }, [])

  const articulos = productos.filter((p) => p.tipo === 'articulo')
  const bajos = articulos.filter((p) => p.stock <= p.stock_minimo)

  async function aplicarAjuste() {
    const cantidad = Number(ajuste.cantidad)
    if (!ajuste.producto_id || cantidad <= 0) return
    const dir = ajuste.tipo === 'entrada' ? 1 : -1
    const prod = await db.productos.get(ajuste.producto_id)

    await db.transaction('rw', [db.productos, db.movimientos], async () => {
      await db.productos.update(ajuste.producto_id, { stock: prod.stock + dir * cantidad })
      await db.movimientos.add({
        id: uuid(),
        venta_id: null,
        caja_id: null,
        producto_id: ajuste.producto_id,
        tipo: ajuste.tipo === 'entrada' ? 'entrada' : 'ajuste_out',
        cantidad: dir * cantidad,
        referencia: 'ajuste manual',
        fecha: new Date().toISOString(),
        enviado: 0
      })
    })
    setAjuste({ producto_id: '', tipo: 'entrada', cantidad: '' })
    await cargar()
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {bajos.length > 0 && (
        <div className="bg-aviso/10 border-l-4 border-aviso text-aviso rounded-lg px-4 py-3">
          <b>Alerta:</b> {bajos.length} producto(s) por agotarse.
        </div>
      )}

      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="font-bold text-marina mb-2">Ajuste de inventario</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={ajuste.producto_id}
            onChange={(e) => setAjuste({ ...ajuste, producto_id: e.target.value })}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">Producto...</option>
            {articulos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={ajuste.tipo}
            onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value })}
            className="border rounded-lg px-3 py-2"
          >
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
          <input
            type="number"
            value={ajuste.cantidad}
            onChange={(e) => setAjuste({ ...ajuste, cantidad: e.target.value })}
            placeholder="Cantidad"
            className="border rounded-lg px-3 py-2"
          />
          <button onClick={aplicarAjuste} className="bg-marina text-crema rounded-full px-4 py-2 font-bold uppercase tracking-wide">
            APLICAR
          </button>
        </div>
      </div>

      <div className="bg-crema rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-hueso text-pizarra">
              <th className="text-left px-4 py-2">Producto</th>
              <th className="text-left px-4 py-2">Categoría</th>
              <th className="text-right px-4 py-2">Stock</th>
              <th className="text-right px-4 py-2">Mínimo</th>
              <th className="text-right px-4 py-2">Precio</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const bajo = p.tipo === 'articulo' && p.stock <= p.stock_minimo
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-semibold">{p.nombre}</td>
                  <td className="px-4 py-2 text-pizarra">{p.categoria}</td>
                  <td className={`px-4 py-2 text-right font-bold ${bajo ? 'text-error' : 'text-tinta'}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-2 text-right text-taupe">{p.tipo === 'articulo' ? p.stock_minimo : '—'}</td>
                  <td className="px-4 py-2 text-right">${Number(p.precio).toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}