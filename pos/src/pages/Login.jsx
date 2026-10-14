import { useEffect, useState } from 'react'
import { db, guardarConfig } from '../db/database.js'
import { hashPin, pinValido } from '../lib/pin.js'
import { obtenerToken, guardarToken, sincronizarUsuarios } from '../api/sync.js'

// Acceso al POS (H-009).
//
// Cada persona entra con su nombre y su PIN. El id que se guarda es el del
// servidor, de modo que toda venta queda atribuida a un usuario real y no al
// admin por defecto.
export default function Login({ alEntrar }) {
  const [usuarios, setUsuarios] = useState([])
  const [sel, setSel] = useState(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [definiendo, setDefiniendo] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })
  const [ocupado, setOcupado] = useState(false)
  // El token se puede configurar aqui mismo porque en un equipo nuevo todavia no
  // se ha entrado y, por tanto, no se llega a la pestaña Sync. Sin este acceso el
  // primer arranque quedaba bloqueado: descargar usuarios exige el token y el
  // token se pedia tras entrar.
  const [mostrarToken, setMostrarToken] = useState(false)
  const [token, setToken] = useState('')

  async function recargar() {
    setUsuarios(await db.usuarios.orderBy('nombre').toArray())
  }

  useEffect(() => {
    recargar()
    obtenerToken().then(setToken)
  }, [])

  async function guardarApiToken() {
    await guardarToken(token.trim())
    setMensaje({ tipo: 'ok', texto: 'Token guardado. Ya puedes descargar los usuarios.' })
    setMostrarToken(false)
  }

  async function descargar() {
    setOcupado(true)
    setMensaje({ tipo: '', texto: '' })
    try {
      const n = await sincronizarUsuarios()
      await recargar()
      setMensaje({ tipo: 'ok', texto: `${n} usuarios descargados del servidor` })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: `No se pudo descargar: ${err.message}` })
    } finally {
      setOcupado(false)
    }
  }

  function elegir(u) {
    setSel(u)
    setPin('')
    setPin2('')
    setDefiniendo(!u.pin_hash)
    setMensaje({ tipo: '', texto: '' })
  }

  async function entrarComo(u) {
    await guardarConfig('usuario_id', String(u.id))
    await guardarConfig('usuario_nombre', u.nombre)
    await guardarConfig('usuario_rol', u.rol ?? 'recepcionista')
    alEntrar()
  }

  async function entrar() {
    if (!sel) return
    if (!pinValido(pin)) {
      setMensaje({ tipo: 'error', texto: 'El PIN debe tener de 4 a 6 dígitos' })
      return
    }
    if (definiendo) {
      if (pin !== pin2) {
        setMensaje({ tipo: 'error', texto: 'Los PIN no coinciden' })
        return
      }
      await db.usuarios.update(sel.id, { pin_hash: await hashPin(pin) })
      await entrarComo(sel)
      return
    }
    if ((await hashPin(pin)) !== sel.pin_hash) {
      setMensaje({ tipo: 'error', texto: 'PIN incorrecto' })
      setPin('')
      return
    }
    await entrarComo(sel)
  }

  const estiloInput =
    'border rounded-lg px-3 py-3 w-full text-center text-2xl tracking-[0.5em] bg-crema'

  return (
    <div className="h-full flex flex-col bg-hueso">
      <header className="bg-marina text-crema px-4 py-6 text-center">
        <div className="font-serif text-xl font-bold">Estudio Pilates &amp; Barre</div>
        <div className="text-xs text-crema/70 mt-1">Acceso al punto de venta</div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-pizarra uppercase tracking-wide">
          {sel ? sel.nombre : '¿Quién está en recepción?'}
        </div>

        {!sel && (
          <>
            <div className="grid grid-cols-1 gap-2">
              {usuarios.map((u) => (
                <button
                  key={u.id}
                  onClick={() => elegir(u)}
                  className="bg-crema rounded-xl p-4 text-left border-2 border-transparent hover:border-taupe"
                >
                  <div className="font-bold text-marina">{u.nombre}</div>
                  <div className="text-xs text-taupe">{u.rol}</div>
                </button>
              ))}
            </div>

            {usuarios.length === 0 && (
              <div className="text-sm text-pizarra">
                Aún no hay usuarios en este equipo. Conéctalo a la red una vez para
                descargar el directorio del servidor.
              </div>
            )}

            <button
              onClick={descargar}
              disabled={ocupado}
              className="border border-marina text-marina rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
            >
              {ocupado ? 'Descargando...' : 'Descargar usuarios'}
            </button>

            {!mostrarToken ? (
              <button
                onClick={() => setMostrarToken(true)}
                className="text-xs text-taupe underline self-start"
              >
                Configurar token de la API
              </button>
            ) : (
              <div className="bg-crema rounded-xl p-3 border border-taupe/40 flex flex-col gap-2">
                <div className="text-xs text-pizarra">
                  Debe coincidir con el de <code>cpanel/api/config.php</code> en el hosting.
                </div>
                <div className="flex gap-2">
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="border rounded-lg px-3 py-2 flex-1 text-sm"
                    placeholder="X-Api-Token"
                  />
                  <button
                    onClick={guardarApiToken}
                    disabled={!token.trim()}
                    className="bg-marina text-crema rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {sel && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-pizarra">
              {definiendo
                ? 'Define tu PIN para este equipo (4 a 6 dígitos).'
                : 'Escribe tu PIN.'}
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className={estiloInput}
              placeholder="••••"
            />
            {definiendo && (
              <input
                type="password"
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                className={estiloInput}
                placeholder="••••"
              />
            )}
            <button
              onClick={entrar}
              className="bg-marina text-crema rounded-full px-6 py-3 font-bold uppercase tracking-wide"
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setSel(null)
                setMensaje({ tipo: '', texto: '' })
              }}
              className="text-sm text-pizarra underline"
            >
              Elegir otra persona
            </button>
          </div>
        )}

        {mensaje.texto && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              mensaje.tipo === 'error' ? 'bg-error/10 text-error' : 'bg-exito/10 text-exito'
            }`}
          >
            {mensaje.texto}
          </div>
        )}
      </main>
    </div>
  )
}
