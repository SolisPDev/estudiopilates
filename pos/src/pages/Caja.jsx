import { useEffect, useState } from 'react'
import { db, obtenerConfig, guardarConfig } from '../db/database.js'
import { uuid, enviarLote, marcarLote, obtenerToken, guardarToken } from '../api/sync.js'

export default function Caja({ caja, recargarCaja }) {
  const [fondo, setFondo] = useState('500')
  const [resumen, setResumen] = useState({ ventas: 0, efectivo: 0, transferencia: 0, tarjeta: 0, egresos: 0 })
  const [egreso, setEgreso] = useState({ categoria: 'insumos', concepto: '', monto: '', responsable: '' })
  const [cierre, setCierre] = useState({ contado: '', sincronizado: null, error: null })
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })

  async function cargarResumen(cajaId) {
    const ventas = await db.ventas.where('caja_id').equals(cajaId).toArray()
    let efectivo = 0
    let transferencia = 0
    let tarjeta = 0
    for (const v of ventas) {
      const pagos = await db.pagos.where('venta_id').equals(v.id).toArray()
      for (const p of pagos) {
        if (p.metodo === 'efectivo') efectivo += p.monto
        if (p.metodo === 'transferencia') transferencia += p.monto
        if (p.metodo === 'tarjeta') tarjeta += p.monto
      }
    }
    const egresosLista = await db.egresos.where('caja_id').equals(cajaId).toArray()
    const egresos = egresosLista.reduce((a, e) => a + Number(e.monto), 0)
    setResumen({ ventas: ventas.length, efectivo, transferencia, tarjeta, egresos })
    return { ventas: ventas.length, efectivo, transferencia, tarjeta, egresos }
  }

  useEffect(() => {
    if (caja) cargarResumen(caja.id)
  }, [caja?.id])

  async function abrirCaja() {
    const fondoNum = Number(fondo) || 0
    const fecha = new Date().toISOString()
    const numero = `C-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
    await db.cajas.add({
      id: uuid(),
      numero,
      fondo_inicial: fondoNum,
      fecha_apertura: fecha,
      fecha_cierre: null,
      estado: 'abierta',
      usuario_apertura: parseInt((await obtenerConfig('usuario_id')) ?? '1', 10)
    })
    setMensaje({ tipo: 'ok', texto: `Caja ${numero} abierta con fondo de $${fondoNum.toFixed(2)}` })
    await recargarCaja()
  }

  async function registrarEgreso() {
    if (!egreso.concepto.trim() || Number(egreso.monto) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Captura concepto y monto del egreso' })
      return
    }
    await db.egresos.add({
      id: uuid(),
      caja_id: caja.id,
      categoria: egreso.categoria,
      concepto: egreso.concepto.trim(),
      monto: Number(egreso.monto),
      responsable: egreso.responsable.trim() || null,
      fecha: new Date().toISOString(),
      enviado: 0
    })
    setEgreso({ categoria: egreso.categoria, concepto: '', monto: '', responsable: '' })
    setMensaje({ tipo: 'ok', texto: 'Egreso registrado' })
    await cargarResumen(caja.id)
  }

  async function cerrarCaja() {
    if (!cierre.contado) {
      setMensaje({ tipo: 'error', texto: 'Captura el efectivo contado en caja física' })
      return
    }
    const contado = Number(cierre.contado)
    const fecha = new Date().toISOString()
    const usuarioId = parseInt((await obtenerConfig('usuario_id')) ?? '1', 10)

    await db.cajas.update(caja.id, {
      estado: 'cerrada',
      fecha_cierre: fecha,
      usuario_cierre: usuarioId,
      efectivo_contado: contado
    })

    const cajaCerrada = await db.cajas.get(caja.id)
    const token = await obtenerToken()
    await db.config.put({ key: 'api_token', valor: token })
    if (token === 'cambiar-token') {
      setCierre({ contado: '', sincronizado: false, error: 'Configura el token de la API en la pestaña Sync antes de sincronizar' })
      await marcarLote(caja.id, 'fallido', 'token sin configurar')
    } else {
      try {
        await enviarLote(cajaCerrada)
        setCierre({ contado: '', sincronizado: true, error: null })
      } catch (err) {
        await marcarLote(caja.id, 'fallido', err.message)
        setCierre({ contado: '', sincronizado: false, error: err.message })
      }
    }
    setMensaje({ tipo: 'ok', texto: `Caja ${caja.numero} cerrada` })
    await recargarCaja()
    await cargarResumen(caja.id)
  }

  // ---------- Vista: sin caja abierta ----------
  if (!caja) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4">
        <h2 className="font-bold text-lg text-marina">Apertura de caja</h2>
        <div>
          <label className="text-sm text-pizarra">Fondo inicial (efectivo)</label>
          <input
            type="number"
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
            className="border rounded-lg px-3 py-3 w-full text-lg"
          />
        </div>
        <button onClick={abrirCaja} className="w-full bg-marina text-crema rounded-full py-4 font-bold text-lg uppercase tracking-wide">
          ABRIR CAJA
        </button>
        {mensaje.texto && (
          <div className={`text-sm rounded-lg px-3 py-2 ${mensaje.tipo === 'ok' ? 'bg-exito/15 text-exito' : 'bg-error/15 text-error'}`}>
            {mensaje.texto}
          </div>
        )}
        <div className="text-xs text-taupe mt-4">
          Para configurar tu token de sincronización ve a la pestaña Sync.
        </div>
      </div>
    )
  }

  // ---------- Vista: caja abierta ----------
  const efectivoEsperado = Number(caja.fondo_inicial ?? 0) + resumen.efectivo - resumen.egresos

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-bold text-marina">{caja.numero}</div>
            <div className="text-xs text-pizarra">Abierta {new Date(caja.fecha_apertura).toLocaleString('es-MX')}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-pizarra">Fondo inicial</div>
            <div className="font-bold">${Number(caja.fondo_inicial).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-crema rounded-xl p-3 shadow">
          <div className="text-xs text-pizarra">Ventas</div>
          <div className="font-bold text-lg">{resumen.ventas}</div>
        </div>
        <div className="bg-crema rounded-xl p-3 shadow">
          <div className="text-xs text-pizarra">Efectivo</div>
          <div className="font-bold text-lg text-exito">${resumen.efectivo.toFixed(2)}</div>
        </div>
        <div className="bg-crema rounded-xl p-3 shadow">
          <div className="text-xs text-pizarra">Transferencia</div>
          <div className="font-bold text-lg text-taupe-oscuro">${resumen.transferencia.toFixed(2)}</div>
        </div>
        <div className="bg-crema rounded-xl p-3 shadow">
          <div className="text-xs text-pizarra">Tarjeta (terminal)</div>
          <div className="font-bold text-lg text-marina">${resumen.tarjeta.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="font-bold text-marina mb-2">Egreso de caja chica</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={egreso.categoria}
            onChange={(e) => setEgreso({ ...egreso, categoria: e.target.value })}
            className="border rounded-lg px-3 py-2"
          >
            <option value="insumos">Insumos</option>
            <option value="limpieza">Limpieza</option>
            <option value="papeleria">Papelería</option>
            <option value="otro">Otro</option>
          </select>
          <input
            value={egreso.monto}
            onChange={(e) => setEgreso({ ...egreso, monto: e.target.value })}
            placeholder="Monto $"
            type="number"
            className="border rounded-lg px-3 py-2"
          />
          <input
            value={egreso.concepto}
            onChange={(e) => setEgreso({ ...egreso, concepto: e.target.value })}
            placeholder="Concepto"
            className="border rounded-lg px-3 py-2 col-span-2"
          />
          <input
            value={egreso.responsable}
            onChange={(e) => setEgreso({ ...egreso, responsable: e.target.value })}
            placeholder="Responsable (opcional)"
            className="border rounded-lg px-3 py-2 col-span-2"
          />
        </div>
        <button onClick={registrarEgreso} className="mt-2 bg-aviso text-crema rounded-full py-3 font-bold w-full uppercase tracking-wide">
          REGISTRAR EGRESO
        </button>
      </div>

      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="font-bold text-marina mb-1">Cierre de turno</div>
        <div className="text-sm text-pizarra mb-3">
          Efectivo físico esperado: <b className="text-marina">${efectivoEsperado.toFixed(2)}</b>
          <br />
          Al cerrar se genera el lote y se sincroniza con el hosting.
        </div>
        <input
          type="number"
          value={cierre.contado}
          onChange={(e) =>
            setCierre((prev) => ({ ...prev, contado: e.target.value, sincronizado: null, error: null }))
          }
          placeholder="Efectivo contado en caja física"
          className="border rounded-lg px-3 py-3 w-full"
        />
        {cierre.sincronizado !== null && (
          <div className={`text-sm rounded-lg px-3 py-2 mt-2 ${cierre.sincronizado ? 'bg-exito/15 text-exito' : 'bg-error/15 text-error'}`}>
            {cierre.sincronizado ? 'Lote sincronizado correctamente.' : `Lote pendiente: ${cierre.error}`}
          </div>
        )}
        <button onClick={cerrarCaja} className="mt-3 bg-error text-crema rounded-full py-4 font-bold text-lg w-full uppercase tracking-wide">
          CERRAR CAJA Y ENVIAR CORTE
        </button>
      </div>

      {mensaje.texto && (
        <div className={`text-sm rounded-lg px-3 py-2 ${mensaje.tipo === 'ok' ? 'bg-exito/15 text-exito' : 'bg-error/15 text-error'}`}>
          {mensaje.texto}
        </div>
      )}
    </div>
  )
}