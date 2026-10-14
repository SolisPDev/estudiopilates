import { useEffect, useState } from 'react'
import { db, semillaInicial, obtenerConfig, guardarConfig } from './db/database.js'
import { sincronizarPendientes } from './api/sync.js'
import Venta from './pages/Venta.jsx'
import Caja from './pages/Caja.jsx'
import Inventario from './pages/Inventario.jsx'
import Sync from './pages/Sync.jsx'
import Login from './pages/Login.jsx'

const TABS = [
  { id: 'venta', label: 'Venta' },
  { id: 'caja', label: 'Caja' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'sync', label: 'Sync' }
]

export default function App() {
  const [tab, setTab] = useState('venta')
  const [caja, setCaja] = useState(null)
  // null = sin sesion: no se opera nadie sin identificarse (H-009).
  const [usuario, setUsuario] = useState(null)
  const [listo, setListo] = useState(false)

  async function refreshCaja() {
    const activa = await db.cajas.where('estado').equals('abierta').first()
    setCaja(activa ?? null)
  }

  async function cargarSesion() {
    const id = await obtenerConfig('usuario_id')
    if (!id) {
      setUsuario(null)
      return
    }
    const nombre = await obtenerConfig('usuario_nombre')
    const rol = await obtenerConfig('usuario_rol')
    setUsuario({ id, nombre: nombre ?? 'Recepción', rol: rol ?? 'recepcionista' })
  }

  async function salir() {
    await guardarConfig('usuario_id', '')
    await guardarConfig('usuario_nombre', '')
    await guardarConfig('usuario_rol', '')
    setUsuario(null)
    setTab('venta')
  }

  useEffect(() => {
    ;(async () => {
      await semillaInicial()
      await cargarSesion()
      await refreshCaja()
      setListo(true)
    })()

    const alVolverLinea = () => {
      if (navigator.onLine) sincronizarPendientes()
    }
    window.addEventListener('online', alVolverLinea)
    return () => window.removeEventListener('online', alVolverLinea)
  }, [])

  if (!listo) {
    return <div className="h-full grid place-items-center text-pizarra">Cargando...</div>
  }

  if (!usuario) {
    return <Login alEntrar={cargarSesion} />
  }

  return (
    <div className="h-full flex flex-col bg-hueso">
      <header className="bg-marina text-crema px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-serif text-lg font-bold leading-tight">Estudio Pilates &amp; Barre</div>
          <div className="text-xs text-crema/70">
            {usuario.nombre}
            {caja ? ` · Caja ${caja.numero}` : ' · Sin caja abierta'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`text-xs font-bold px-3 py-1 rounded-full ${
              caja ? 'bg-exito/20 text-crema' : 'bg-aviso/30 text-crema'
            }`}
          >
            {caja ? 'CAJA ABIERTA' : 'SIN CAJA'}
          </div>
          <button
            onClick={salir}
            title="Cerrar sesión"
            className="text-xs font-bold px-3 py-1 rounded-full bg-crema/15 text-crema"
          >
            SALIR
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === 'venta' && (
          <Venta caja={caja} recargarCaja={refreshCaja} irACaja={() => setTab('caja')} />
        )}
        {tab === 'caja' && <Caja caja={caja} recargarCaja={refreshCaja} />}
        {tab === 'inventario' && <Inventario />}
        {tab === 'sync' && <Sync />}
      </main>

      <nav className="grid grid-cols-4 gap-1 bg-crema border-t border-taupe/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-3 rounded-lg text-sm font-bold transition ${
              tab === t.id ? 'bg-marina text-crema' : 'bg-hueso text-pizarra'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
