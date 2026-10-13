import { useEffect, useState } from 'react'
import { db } from '../db/database.js'
import { obtenerToken, guardarToken, sincronizarPendientes, enviarLote, marcarLote } from '../api/sync.js'

export default function Sync() {
  const [token, setToken] = useState('')
  const [lotes, setLotes] = useState([])
  const [pendientes, setPendientes] = useState(0)
  const [estado, setEstado] = useState({ trabajando: false, mensaje: '' })
  const [online, setOnline] = useState(() => navigator.onLine)

  async function cargar() {
    setToken(await obtenerToken())
    const listaLotes = await db.lotes.toArray()
    setLotes(listaLotes.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')))
    setPendientes(listaLotes.filter((l) => l.estado !== 'enviado').length)
  }

  useEffect(() => {
    cargar()
    const t = window.setInterval(cargar, 4000)
    // El indicador se refresca al volver o caer la red (H-018).
    const refrescar = () => setOnline(navigator.onLine)
    window.addEventListener('online', refrescar)
    window.addEventListener('offline', refrescar)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('online', refrescar)
      window.removeEventListener('offline', refrescar)
    }
  }, [])

  async function guardar() {
    await guardarToken(token.trim())
    setEstado({ trabajando: false, mensaje: 'Token guardado' })
    await cargar()
  }

  async function sincronizarTodo() {
    setEstado({ trabajando: true, mensaje: 'Sincronizando...' })
    const resultados = await sincronizarPendientes()
    const ok = resultados.filter((r) => r.ok).length
    const fallos = resultados.length - ok
    setEstado({ trabajando: false, mensaje: `${ok} lote(s) enviados, ${fallos} fallaron` })
    await cargar()
  }

  async function reintentar(lote) {
    const caja = await db.cajas.get(lote.caja_id)
    if (!caja) return
    try {
      await enviarLote(caja)
      setEstado({ trabajando: false, mensaje: 'Lote enviado' })
    } catch (err) {
      await marcarLote(lote.caja_id, 'fallido', err.message)
      setEstado({ trabajando: false, mensaje: `Error: ${err.message}` })
    }
    await cargar()
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div
        className={`rounded-2xl p-4 text-crema font-bold ${online ? 'bg-exito' : 'bg-aviso'}`}
      >
        {online ? 'CONECTADO · la sincronización automática está activa' : 'SIN INTERNET · operando offline'}
      </div>

      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="font-bold text-marina mb-1">Token de la API</div>
        <p className="text-xs text-pizarra mb-2">
          Debe coincidir con el configurado en <code>cpanel/api/config.php</code> en el hosting.
        </p>
        <div className="flex gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1"
            placeholder="X-Api-Token"
          />
          <button onClick={guardar} className="bg-marina text-crema rounded-full px-4 py-2 font-bold uppercase tracking-wide">
            Guardar
          </button>
        </div>
      </div>

      <div className="bg-crema rounded-2xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-marina">Lotes de cierre de turno</div>
          <button
            onClick={sincronizarTodo}
            disabled={estado.trabajando || pendientes === 0}
            className="bg-marina disabled:bg-taupe/50 text-crema rounded-full px-4 py-2 font-bold uppercase tracking-wide text-xs"
          >
            Sincronizar pendientes ({pendientes})
          </button>
        </div>

        {estado.mensaje && <div className="text-sm text-pizarra mb-2">{estado.mensaje}</div>}

        {lotes.length === 0 && <div className="text-taupe text-sm">Aún no hay cierres de turno.</div>}

        <div className="space-y-2">
          {lotes.map((l) => (
            <div
              key={l.id}
              className={`border rounded-lg px-3 py-2 flex items-center justify-between ${
                l.estado === 'enviado' ? 'border-exito/30 bg-exito/10' : 'border-error/30 bg-error/10'
              }`}
            >
              <div>
                <div className="text-sm font-semibold">
                  {l.caja_id} · {l.estado.toUpperCase()}
                </div>
                <div className="text-xs text-pizarra">
                  {l.fecha ? new Date(l.fecha).toLocaleString('es-MX') : ''}
                  {l.error ? ` · ${l.error}` : ''}
                </div>
              </div>
              {l.estado !== 'enviado' && (
                <button onClick={() => reintentar(l)} className="bg-tinta text-crema rounded px-3 py-1 text-sm font-bold">
                  Reintentar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}