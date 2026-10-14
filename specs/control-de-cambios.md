# Control de cambios · Estudio Pilates & Barre

Documento de seguimiento de modificaciones al proyecto `c:\proyectos\estudiopilates`.

- **Última actualización:** 2026-10-13
- **Estado del proyecto:** MVP funcional en local (PWA) con identidad visual, sesión con PIN y envío de ventas al cobrar; API ejecutándose sobre SQLite para pruebas, panel y MySQL aún sin ejecutar.
- **Rama:** `main` · **Remoto:** `https://github.com/SolisPDev/estudiopilates.git`

---

## 1. Cómo usar este documento

Cada vez que se modifique el código se agrega una fila a la **sección 3** con este formato:

| Columna | Contenido |
|---|---|
| ID | `CAM-###` correlativo |
| Fecha | `AAAA-MM-DD` |
| Tipo | `fix` · `feat` · `refactor` · `docs` · `infra` · `seguridad` |
| Archivo(s) | ruta relativa al proyecto |
| Estado | `Aplicado` · `En proceso` · `Pendiente` · `Descartado` |
| Descripción | qué cambió y por qué |
| Verificación | cómo se comprobó (prueba manual, build, etc.) |

Cuando un hallazgo de la **sección 4** se corrija, se registra su `CAM-###` en la tabla de cerrados (4.1) y se elimina de la lista de pendientes.

---

## 2. Leyenda de prioridad

- 🔴 **Crítico** — impide operar o corrompe/desincroniza datos.
- 🟠 **Alto** — afecta flujo real de trabajo o genera números incorrectos.
- 🟡 **Medio** — UX, higiene de código o riesgo de despliegue.
- 🔵 **Bajo** — cosmético.

---

## 3. Cambios aplicados

| ID | Fecha | Tipo | Archivo(s) | Estado | Descripción | Verificación |
|---|---|---|---|---|---|---|
| CAM-001 | 2026-10-13 | infra | `pos/package-lock.json` | Aplicado | Ejecución de `npm install` (358 paquetes) para correr la PWA en local. La única diferencia en el lock son campos `"peer": true` que normaliza npm 11. | `npm run dev` → Vite 5.4.21 en `http://localhost:5137/pos/` sin errores de consola. |
| CAM-002 | 2026-10-13 | fix | `pos/src/pages/Caja.jsx` | Aplicado | **Cierre de caja (H-001).** El `onChange` del campo "Efectivo contado" llamaba `setCierre(...)` y acto seguido `resetCierre()`, que ponía `contado: ''`; React agrupa los `setState` y ganaba el último → cada tecla se borraba y el cierre era imposible. Se reemplaza por un updater funcional `setCierre((prev) => ({ ...prev, contado, sincronizado: null, error: null }))` y se elimina la función `resetCierre()` (queda sin uso). | Prueba manual: se cerró `C-20261013` con $2500 contados → mensaje "Caja C-20261013 cerrada", estado **SIN CAJA**. |
| CAM-003 | 2026-10-13 | fix | `pos/src/pages/Venta.jsx` | Aplicado | **Cobro en efectivo (H-004).** `agregarPago` usaba `Math.min(restante, 500)`, dejando el cobro incompleto en totales > $500 sin aviso. Ahora llena el restante completo. | Prueba manual: Paquete $1500 → "+ Efectivo" → COBRAR **habilitado** con $1500. |
| CAM-004 | 2026-10-13 | fix | `pos/src/pages/Venta.jsx` | Aplicado | **Sobrepaga y vuelto (H-005).** La validación exigía `pagado === subtotal`, lo que bloqueaba el cobro cuando el cliente daba de más. Cambia a `pagado >= subtotal - 0.001` en `cobrar()` y en el `disabled` del botón; se agrega el aviso **"Faltan $X por pagar"** junto al total mientras no se cubra. | Prueba manual: total $1500, efectivo $2000 → COBRAR habilitado y "Vuelto $500.00". Con pago incompleto aparece "Faltan $1500.00 por pagar" y el botón queda deshabilitado. |
| CAM-005 | 2026-10-13 | fix | `pos/src/pages/Venta.jsx` | Aplicado | **Modal de recibo (H-006).** `cobrar()` llamaba `setRecibo(...)` antes que `limpiar()`, y `limpiar()` hace `setRecibo(null)`; ganaba `null` y el modal nunca se veía. Se invierte el orden (`limpiar()` primero). | Prueba manual: modal "Venta registrada · Folio V-10130001 · Vuelto: $500.00". |
| CAM-006 | 2026-10-13 | infra | `.gitignore` | Aplicado | Nuevo `.gitignore` con `node_modules/`, `pos/dist/`, `pos/dev-dist/`, `cpanel/api/config.php`, `.env*` y basura de sistema. Evita commitear credenciales y dependencias (H-014). | `git status` ya no lista `pos/node_modules/`. |
| CAM-007 | 2026-10-13 | fix | `pos/src/api/sync.js`, `cpanel/api/public/index.php` | Aplicado | **IDs de producto incompatibles (H-002).** El local usa strings (`'art-toalla'`) y el servidor espera `INT UNSIGNED`. Resolución **por `codigo`**: `detalleVenta` envía `producto_id: null` más el `codigo` del producto; `enviarLote` mapea el `codigo` en cada movimiento. El servidor agrega `$resolverProducto` que resuelve por id numérico **o** por `codigo`, y omite los movimientos sin producto (`sin_producto`). | **Verificado en vivo** con mock de API local: payload con `items_con_codigo: 1` y los items con `producto_id: null, codigo: 'ART-SHAKE'` / `'PK-PIL-10'`. |
| CAM-008 | 2026-10-13 | fix | `pos/src/api/sync.js` | Aplicado | **Ajustes de inventario no se sincronizan (H-003).** `construirLote` solo consultaba movimientos de la caja; los ajustes hechos sin caja abierta se quedaban locales. Ahora incluye `ajustesPendientes` (`caja_id` nulo y `enviado !== 1`) y `enviarLote` los marca como enviados. | **Verificado en vivo:** ajuste avulso +2 hecho sin caja abierta → el lote del cierre respondió `n_movimientos: 2, movs_avulsos: 1`. |
| CAM-009 | 2026-10-13 | fix | `pos/src/pages/Venta.jsx` | Aplicado | **Stock puede bajar de cero (H-020).** `agregar()` y `cambiarCantidad()` ahora limitan la cantidad al stock disponible del artículo. | ⚠️ **Aplicado y revisado en código; no probado en UI** — la automatización del navegador quedó errática (ventana no visible) y no se concluyó la prueba. |
| CAM-010 | 2026-10-13 | feat | `pos/src/pages/Sync.jsx` | Aplicado | **Indicador online sin listeners (H-018).** Se agregan `estado` con `navigator.onLine` y listeners `online`/`offline` para que el indicador se actualice. | ⚠️ **Aplicado y revisado en código; no probado en UI** (mismo motivo que CAM-009). |
| CAM-011 | 2026-10-13 | fix | `cpanel/api/public/index.php` | Aplicado | **Zona horaria (H-012)** + **ruteo (H-008).** `date_default_timezone_set('America/Mexico_City')` para que los cortes caigan en el día correcto; el ruteo acepta `/api/cierres` **y** `/cierres` por sufijo. | `php -l` limpio. ⚠️ No se ejecutó contra MySQL real. |
| CAM-012 | 2026-10-13 | seguridad | `cpanel/panel/dashboard.php`, `stock.php` | Aplicado | **Panel sin autorización (H-010).** Ambas páginas ahora llaman `require_admin()`; antes cualquiera con el link veía los reportes. | `php -l` limpio. ⚠️ No se ejecutó contra MySQL real. |
| CAM-013 | 2026-10-13 | infra | `cpanel/htaccess-raiz.example` (nuevo) | Aplicado | **`/api` no resolvía en cPanel (H-008).** Nuevo ejemplo de `.htaccess` raíz que reescribe `/api/*` → `api/public/index.php`, con nota de orden de copia a `public_html`. | Archivo presente en el repo; leído y revisado. |
| CAM-014 | 2026-10-13 | docs | `README.md` | Aplicado | **README vacío (H-015).** Documenta arquitectura, ejecución local, esquema de BD, endpoints de la API, panel, despliegue en cPanel y pendientes. | Revisado en el repo. |
| CAM-015 | 2026-10-13 | feat | `pos/src/styles.css`, `pos/src/App.jsx`, `pos/src/pages/{Venta,Caja,Inventario,Sync}.jsx`, `pos/index.html`, `pos/vite.config.js`, `pos/public/icons/icon.svg` | Aplicado | **Nueva identidad visual.** Se reemplaza la paleta genérica violeta/slate de Tailwind por tokens semánticos propios (`@theme`) tomados de **eastriverpilates.com**: marino `#1d2d44` (marca), marfil `#fffef5` (fondo), crema `#f6f5e9`, arena `#a59f8f`, pizarra `#555f61`, tinta `#333333`; estados apagados (`exito`/`aviso`/`error`) que no pelean con la paleta. Titulares en serif, botones principales en píldora con mayúsculas y `tracking-wide`. También se actualizan `theme_color`, `background_color` del manifest y el icono SVG. | **Verificado en vivo:** `getComputedStyle` confirma header `rgb(29,45,68)`, fondo `rgb(255,254,245)`, pestaña activa marino; capturas de Venta, Caja y Apertura. `npm run build` OK (PWA 282.75 KiB). |
| CAM-016 | 2026-10-13 | fix | `pos/src/pages/Venta.jsx`, `pos/src/App.jsx` | Aplicado | **Botón "Ir a Caja" no navegaba.** Fijaba `window.location.hash = ''`, pero la navegación por pestañas usa `useState` en `App.jsx`, no hash: el clic solo refrescaba la caja y la vista no cambiaba. Se pasa `irACaja={() => setTab('caja')}` a `Venta` y se usa como `onClick`. | **Verificado en vivo:** con la caja cerrada, el clic en "IR A CAJA" lleva a la pestaña Caja ("Apertura de caja"). |
| CAM-017 | 2026-10-13 | fix | `pos/src/db/database.js`, `pos/src/api/sync.js`, `pos/src/pages/Caja.jsx`, `pos/src/pages/Venta.jsx`, `cpanel/api/public/index.php` | Aplicado | **Colisión multi-dispositivo (H-011).** Cada equipo persiste un `dispositivo_id` (UUID) y usa su sufijo de 4 caracteres en los dos identificadores que no distinguían equipo: `cajas.numero` → `C-AAAAMMDD-XXXX` y `ventas.folio` → `V-MMDD-XXXX-NNNN`. En el servidor se sustituye el `INSERT ... ON DUPLICATE KEY UPDATE` de `cajas` (que se activa ante **cualquier** unique key y por tanto reescribía la caja del otro equipo) por `INSERT IGNORE` + detección vía `rowCount()` del `UPDATE ... WHERE id`, devolviendo `409 colision_caja`. Además `ventas` distingue ahora "ya sincronizada" de "descartada por folio ajeno" y responde `ventas_perdidas`, campo que la PWA usa para **no** marcar esas ventas como `enviada`. `uuid()` se unificó en `database.js` y se reexporta desde `sync.js`. | **Verificado en vivo (PWA):** la BD local tenía 3 cajas en `C-20261013`; la nueva quedó `C-20261013-973C` y la venta `V-1013-973C-0003`. **Verificado (servidor):** `php -l` limpio y prueba que ejecuta las sentencias SQL reales extraídas de `index.php` sobre SQLite con `UNIQUE(numero)`: 8/8 comprobaciones (colisión detectada, caja ajena **no** reescrita, reenvío idempotente). **No ejecutado contra MySQL real** (sin servidor disponible). |
| CAM-018 | 2026-10-13 | refactor | `cpanel/panel/stock.php`, `cpanel/panel/dashboard.php` | Aplicado | **Conexión PDO duplicada (H-017).** Ambos archivos del panel construían su propio `DSN` y `new PDO(...)` en vez de reutilizar la fábrica `Database::pdo()`, con un conjunto de atributos ligeramente distinto (faltaba `ATTR_EMULATE_PREPARES => false`). Se sustituyen por `require Database.php` + `Database::pdo()`. | `php -l` limpio en ambos archivos. **No ejecutado contra MySQL real.** |
| CAM-019 | 2026-10-13 | fix | `pos/index.html`, `pos/vite.config.js`, `pos/public/icons/{apple-touch-icon,icon-192,icon-512}.png` | Aplicado | **Sin icono para iOS (H-019).** El manifest solo declaraba `icon.svg`, y iOS **ignora** el SVG tanto en el manifest como en `apple-touch-icon`. Se rasteriza el propio `icon.svg` (canvas del navegador, mismo origen) a PNG 180×180, 192×192 y 512×512; se añaden al manifest (`any` y `maskable`) y se declara `<link rel="apple-touch-icon">` más las metas `apple-mobile-web-app-*` / `mobile-web-app-capable` para que la app instalada abra en standalone. | **Verificado:** cabeceras PNG de 180/192/512 px; análisis de píxeles del `apple-touch-icon` confirma 27 963 px en el marino exacto `rgb(29,45,68)`; `npm run build` OK (precache 7 → 13 entradas) y manifest generado con los 4 iconos. |
| CAM-020 | 2026-10-13 | feat | `cpanel/api/public/index.php`, `pos/src/api/sync.js`, `pos/src/pages/Venta.jsx` | Aplicado | **Las ventas solo viajan al cerrar caja (H-007).** Nuevo endpoint `POST /api/ventas` que registra la venta **en el momento del cobro**. Se extraen `registrarCajaAbierta()` y `registrarDetalles()` y se reutilizan en `/cierres` (569 → 452 líneas), de modo que ambos caminos comparten el alta de caja, detalles y movimientos. La caja viaja en estado `abierta`: `CONSTRAINT fk_ventas_caja` impediría insertar la venta si su caja aún no existe en el servidor. En la PWA, `Venta.jsx` llama `enviarVenta()` tras imprimir y `sincronizarPendientes()` reintenta las ventas de cajas aún abiertas, no solo los cierres. **Corrección derivada de la prueba:** al sustituirse el `INSERT ... ON DUPLICATE KEY UPDATE` de H-011 por `INSERT IGNORE`, el `UPDATE ... SET total_ventas` dejó de fijar `estado`; una caja creada antes por `/api/ventas` **nunca se cerraba**. Se devuelven `estado`, `fecha_cierre` y `usuario_id_cierre` a ese `UPDATE`. | **Verificado en servidor:** arnés que sirve el `index.php` real (idéntico por SHA-256) sobre SQLite con `UNIQUE` y `FOREIGN KEY` activas → **19/19 comprobaciones**: alta de caja + venta, stock aplicado, reenvío idempotente (0 duplicados, stock no vuelve a bajar), caja abierta tras `/ventas` y **cerrada** con totales correctos tras `/cierres`. **Verificado en vivo (PWA):** cobro de Shake $45 → en el servidor aparece la caja `C-20261014-F042` (`abierta`, fondo 500) y la venta `V-1014-F042-0001` con `usuario_id: 2`; stock 59 → 58 en servidor y 60 → 59 en local; Sync informa `Sincronizar pendientes (0)`. **No ejecutado contra MySQL real.** |
| CAM-021 | 2026-10-13 | feat | `pos/src/pages/Login.jsx` (nuevo), `pos/src/lib/pin.js` (nuevo), `pos/src/App.jsx`, `pos/src/api/sync.js`, `cpanel/api/public/index.php` | Aplicado | **Sin usuario real en el POS (H-009).** `App.jsx` pasa a exigir sesión: sin `usuario_id` se muestra `Login`, con botón **SALIR**. Cada persona elige su nombre y se identifica con un **PIN local** de 4 a 6 dígitos guardado como SHA-256 en IndexedDB (`pin.js`): los hashes seed son bcrypt `$2y$`, inverificables desde JS, y el POS es offline-first. El `usuario_id` que se persiste es el **real del servidor** para respetar `fk_ventas_usuario`. Nuevo `GET /api/usuarios` que devuelve **solo** `id`, `nombre`, `rol` (nunca `password_hash`), y `sincronizarUsuarios()` conserva el `pin_hash` local al refrescar el directorio. | **Verificado en servidor:** `GET /api/usuarios` → **401 sin token**, `200` con token y cuerpo limitado a `id`/`nombre`/`rol`. **Verificado en vivo (PWA):** descarga del directorio (aparecen Administrador y Recepción) → definición de PIN en el primer uso → **PIN erróneo rechazado** ("PIN incorrecto") → **PIN correcto aceptado** → sesión restaurada tras salir. Que la venta registrada haya quedado con `usuario_id: 2` (Recepción) y no `1` confirma que el id real del servidor fluye desde el login hasta el cobro. **No ejecutado contra MySQL real.** |
| CAM-022 | 2026-10-13 | infra | `pos/vite.config.js`, `pos/src/pages/Login.jsx` | Aplicado | **Dos bloqueos del primer arranque detectados al verificar H-009/H-007.** (1) *CORS*: el dev server corre en `localhost:5137` y la API en otro origen, cosa que en producción no ocurre (la PWA se publica en el mismo dominio que `/api`). En vez de añadir cabeceras CORS al código de producción se agrega un `server.proxy` **optativo** con `VITE_API_PROXY`, que reenvía `/api` bajo la misma ruta y mismo origen que en producción. (2) *Circuito cerrado del token*: `Sync` quedó detrás del login, pero entrar exige descargar el directorio, que a su vez exige el token → un equipo nuevo no podía configurarse. Se añade "Configurar token de la API" en la propia pantalla de acceso. | **Verificado en vivo:** `VITE_API_PROXY=http://127.0.0.1:8010` → `GET /api/usuarios` por el dev server responde **200 con token y 401 sin él**; token guardado desde el login y descarga de usuarios completada. `npm run dev` sin la variable queda sin proxy (comportamiento de producción intacto). |

---

## 4. Hallazgos pendientes (backlog)

### 🔴 Críticos

| ID | Archivo:línea | Hallazgo | Evidencia |
|---|---|---|---|
| H-002 | `pos/src/db/database.js:36-43` vs `db/schema.sql:110,166` | ~~IDs de producto incompatibles~~ → cerrado en **CAM-007**. | — |
| H-003 | `pos/src/pages/Inventario.jsx:33` vs `pos/src/api/sync.js:73` | ~~Ajustes de inventario no se sincronizan~~ → cerrado en **CAM-008**. | — |

### 🟠 Altos

| ID | Archivo:línea | Hallazgo | Evidencia |
|---|---|---|---|
| H-007 | `pos/src/api/sync.js` | ~~Las ventas solo viajan al cerrar caja~~ → cerrado en **CAM-020**. | — |
| H-008 | `cpanel/api/public/index.php` + `pos/vite.config.js` | ~~La ruta `/api` no resuelve sin un `.htaccess` raíz~~ → cerrado en **CAM-011** + **CAM-013**. | — |
| H-009 | `pos/src/api/sync.js:29` · `pos/src/App.jsx:30` | ~~Sin usuario real en el POS~~ → cerrado en **CAM-021**. | — |
| H-010 | `cpanel/panel/dashboard.php:3`, `stock.php:3` | ~~`require_admin()` nunca se llama~~ → cerrado en **CAM-012**. | — |
| H-011 | `cpanel/api/public/index.php:94` + `db/schema.sql:72` | ~~Colisión con 2 dispositivos~~ → cerrado en **CAM-017**. | — |
| H-012 | `cpanel/api/public/index.php:34` | ~~Zona horaria~~ → cerrado en **CAM-011**. | — |

### 🟡 Medios

| ID | Archivo:línea | Hallazgo |
|---|---|---|
| H-013 | `pos/src/lib/impresora.js:125` | `conectarImpresora()` no está en ninguna pantalla: la impresora térmica nunca se conecta; siempre cae al `window.open`, que si el navegador lo bloquea → ticket solo en pantalla y sin aviso. |
| H-015 | `README.md` | ~~Vacío~~ → cerrado en **CAM-014**. |
| H-016 | `cpanel/panel/index.php:63` | La página de acceso anuncia los usuarios seed; `:37` filtra el mensaje de PDO y puede filtrar host/usuario de la BD. Sin límite de intentos de login. |
| H-017 | `cpanel/panel/stock.php:5-10`, `dashboard.php:5-10` | ~~Duplican la conexión PDO en vez de usar `Database::pdo()`~~ → cerrado en **CAM-018**. |
| H-018 | `pos/src/pages/Sync.jsx:55` | ~~Indicador online sin listeners~~ → cerrado en **CAM-010**. |
| H-019 | `pos/vite.config.js:26` | ~~Solo icono SVG en el manifest → sin `apple-touch-icon` para iOS~~ → cerrado en **CAM-019**. |
| H-020 | `pos/src/pages/Venta.jsx:151` | ~~Stock local puede bajar de cero~~ → cerrado en **CAM-009** (pendiente de prueba en UI). |
| H-021 | proyecto | Sin tests, sin linter, sin CI. |
| H-022 | `pos/src/pages/Venta.jsx:189` | ~~"Ir a Caja" no navegaba (usaba `location.hash` con navegación por `useState`)~~ → cerrado en **CAM-016**. |

### 4.1 Hallazgos cerrados

| ID | Hallazgo | Cerrado en | Fecha |
|---|---|---|---|
| H-001 | Cierre de caja imposible (campo borrado en cada tecla) | **CAM-002** | 2026-10-13 |
| H-002 | IDs de producto incompatibles entre local y servidor | **CAM-007** | 2026-10-13 |
| H-003 | Ajustes de inventario no se sincronizan | **CAM-008** | 2026-10-13 |
| H-004 | Cobro en efectivo no completaba el total (> $500) | **CAM-003** | 2026-10-13 |
| H-005 | Sobrepaga/vuelto bloqueado | **CAM-004** | 2026-10-13 |
| H-006 | Modal de recibo nunca aparecía | **CAM-005** | 2026-10-13 |
| H-007 | Las ventas solo viajan al cerrar caja (pérdida de datos) | **CAM-020** | 2026-10-13 |
| H-008 | `/api` no resolvía en cPanel sin `.htaccess` raíz | **CAM-011** + **CAM-013** | 2026-10-13 |
| H-009 | Sin usuario real en el POS (`usuario_id` siempre 1) | **CAM-021** | 2026-10-13 |
| H-010 | Panel web sin autorización (`require_admin()` sin llamar) | **CAM-012** | 2026-10-13 |
| H-011 | Colisión multi-dispositivo en `cajas.numero` y `ventas.folio` | **CAM-017** | 2026-10-13 |
| H-012 | Zona horaria de corte no fijada | **CAM-011** | 2026-10-13 |
| H-014 | Sin `.gitignore` (riesgo de commitear `node_modules` o `config.php`) | **CAM-006** | 2026-10-13 |
| H-015 | `README.md` vacío | **CAM-014** | 2026-10-13 |
| H-017 | Panel duplicaba la conexión PDO | **CAM-018** | 2026-10-13 |
| H-019 | Sin `apple-touch-icon` para iOS (solo SVG) | **CAM-019** | 2026-10-13 |
| H-018 | Indicador online sin listeners `online`/`offline` | **CAM-010** | 2026-10-13 |
| H-020 | Stock local puede bajar de cero (pendiente prueba UI) | **CAM-009** | 2026-10-13 |
| H-022 | "Ir a Caja" no navegaba | **CAM-016** | 2026-10-13 |

---

## 5. Registro de pruebas

Entorno: `pos/` con `npm run dev` en `http://localhost:5137/pos/`, Chrome, sin API ni MySQL.

| # | Prueba | Antes | Después |
|---|---|---|---|
| 1 | Arranque y seed de catálogo | ✅ 8 productos, 0 errores de consola | ✅ |
| 2 | Apertura de caja con fondo $500 | ✅ `C-20261013` | ✅ |
| 3 | Venta: 2 × Botella de agua ($50) en efectivo | ✅ Folio `V-10130001` | ✅ |
| 4 | Descuento de stock por venta | ✅ 100 → 98 | ✅ |
| 5 | Ajuste de inventario (entrada +10) | ✅ 98 → 108 | ✅ |
| 6 | Resumen de caja | ✅ 1 venta, efectivo $50 | ✅ 1 venta, efectivo $2000 |
| 7 | Egreso de caja chica | ✅ esperado $550 → $430 | ✅ |
| 8 | Persistencia tras recargar | ✅ datos intactos | ✅ |
| 9 | Pestaña Sync | ✅ renderiza | ✅ |
| 10 | Cobro en efectivo > $500 | ❌ `H-004` | ✅ **CAM-003** (total $1500 → habilitado) |
| 11 | Cobro con sobrepaga (vuelto) | ❌ `H-005` | ✅ **CAM-004** (`Vuelto $500.00`) |
| 12 | Modal de recibo | ❌ `H-006` | ✅ **CAM-005** (folio + vuelto) |
| 13 | Cierre de caja | ❌ `H-001` | ✅ **CAM-002** ("Caja C-20261013 cerrada" → SIN CAJA) |
| 14 | Impresión de ticket | ❌ `H-013` | ❌ sin corregir (popup bloqueado, sin aviso) |
| 15 | Aviso de pago incompleto | — (no existía) | ✅ "Faltan $1500.00 por pagar" |
| 16 | Lote de cierre pendiente | — | ✅ lote `63dd7777-…` **FALLIDO** "token sin configurar", `Sincronizar pendientes (1)` |
| 17 | `npm run build` | — | ✅ 41 módulos, PWA generada (281 KB precache) |

### Lote 2 · sincronización y correcciones (con mock de API local en `127.0.0.1:8000`)

| # | Prueba | Resultado |
|---|---|---|
| 18 | Payload de lote: `producto_id` + `codigo` | ✅ **H-002** — `items_con_codigo: 1`, items con `producto_id: null, codigo: 'ART-SHAKE'` / `'PK-PIL-10'` |
| 19 | Ajuste de inventario sin caja abierta viaja en el lote | ✅ **H-003** — `n_movimientos: 2, movs_avulsos: 1` |
| 20 | Cierre de caja end-to-end (apertura → venta → corte) | ✅ lote `enviado`, respuesta del servidor correcta |
| 21 | `php -l` en `index.php`, `dashboard.php`, `stock.php`, `guard.php`, `Database.php` | ✅ sin errores de sintaxis |
| 22 | Tope de stock al vender | ⚠️ **no concluido** — la automatización del navegador quedó errática (ver nota) |

### Lote 3 · identidad visual (paleta de eastriverpilates.com)

| # | Prueba | Resultado |
|---|---|---|
| 23 | `getComputedStyle` del header | ✅ `rgb(29, 45, 68)` (marino) |
| 24 | `getComputedStyle` del fondo de la app | ✅ `rgb(255, 254, 245)` (marfil) |
| 25 | Pestaña activa / inactiva del nav | ✅ marino activo, crema inactiva |
| 26 | Capturas de pantalla: Venta, Caja, Apertura | ✅ revisadas visualmente |
| 27 | `npm run build` | ✅ PWA 282.75 KiB, 7 entradas de precache |
| 28 | Botón "IR A CAJA" | ✅ **H-022** — navega a la pestaña Caja |

> **Observaciones:** (1) al cerrar la pestaña del navegador se borró IndexedDB y se perdieron los datos de la primera tanda de pruebas: es la evidencia en vivo de **H-007**. (2) Durante el lote 2 la ventana de escritorio del navegador dejó de estar visible, lo que provocó interacciones parciales de la automatización (`click`/`fill` incompletos). Por eso CAM-009 y CAM-010 quedan marcados como aplicados pero **no probados en UI**, y la prueba 22 no se concluyó.

### Lote 4 · colisión multi-dispositivo (H-011)

| # | Prueba | Resultado |
|---|---|---|
| 29 | Estado previo de la BD local | ✅ evidencia del bug: **3 cajas con el mismo `numero` `C-20261013`** |
| 30 | `numero` de caja con código nuevo | ✅ **`C-20261013-973C`** (sufijo del equipo `973C`) |
| 31 | `folio` de venta con código nuevo | ✅ **`V-1013-973C-0003`** (antes `V-10130003`) |
| 32 | `php -l` sobre `index.php` | ✅ sin errores de sintaxis |
| 33 | Prueba que ejecuta las sentencias SQL **reales** de `index.php` sobre SQLite con `UNIQUE(numero)` | ✅ **8/8**: colisión detectada (`rowCount=0`), caja ajena **no** reescrita, reenvío idempotente sin duplicar |
| 34 | `npm run build` | ✅ PWA generada, service worker precacheado |

> **Nota de verificación:** no hay servidor MySQL disponible en esta máquina (Docker Desktop instalado pero demonio apagado), por lo que la parte del servidor se verificó con las sentencias extraídas del propio `index.php` ejecutadas sobre SQLite. Queda pendiente de confirmar contra MySQL real.

### Lote 5 · panel e iconos (H-017, H-019)

| # | Prueba | Resultado |
|---|---|---|
| 35 | `php -l` sobre `stock.php` y `dashboard.php` tras usar `Database::pdo()` | ✅ sin errores de sintaxis |
| 36 | Dimensiones de los PNG rasterizados | ✅ 180×180, 192×192, 512×512 |
| 37 | Análisis de píxeles del `apple-touch-icon` | ✅ 27 963 px en el marino exacto `rgb(29,45,68)` + 2 818 px de figura blanca |
| 38 | `manifest.webmanifest` generado | ✅ 4 iconos (`svg any`, `192 any`, `512 any`, `512 maskable`) |
| 39 | `dist/index.html` generado | ✅ `apple-touch-icon` y metas `apple-mobile-web-app-*` presentes |
| 40 | `npm run build` | ✅ precache 7 → 13 entradas (314.62 KiB) |

> **Nota de verificación (H-017):** el cambio es un refactoring de una sola línea por archivo con comportamiento equivalente al anterior (de hecho corrige el que faltara `ATTR_EMULATE_PREPARES => false`), pero **no se ejecutó contra MySQL real** por la misma razón del lote 4.

### Lote 6 · sync por venta y sesión con PIN (H-007, H-009)

Entorno: `php -S 127.0.0.1:8010` sirviendo el **`index.php` real** (verificado idéntico por SHA-256) sobre SQLite con `UNIQUE` y `FOREIGN KEY` activas, más la PWA en `http://localhost:5137/pos/` con `VITE_API_PROXY` apuntando a ese servidor.

| # | Prueba | Resultado |
|---|---|---|
| 41 | `GET /health` | ✅ `200 {"ok":true}` |
| 42 | `GET /api/usuarios` sin token | ✅ `401` |
| 43 | `GET /api/usuarios` con token | ✅ `200`, cuerpo **solo** con `id`/`nombre`/`rol` — ningún `password_hash` se fuga |
| 44 | `POST /api/ventas` con caja inexistente en el servidor | ✅ `200`, `nuevos.ventas: 1`, 1 movimiento de stock, `ventas_perdidas: []` — la FK `fk_ventas_caja` se satisface porque la caja viaja en el payload |
| 45 | Reenvío idéntico de la misma venta | ✅ `200`, `nuevos.ventas: 0`, `nuevos.movimientos: 0` (sin duplicar ni bajar el stock dos veces) |
| 46 | Estado de la caja tras `/api/ventas` | ✅ `abierta`, `total_ventas: 0` (el cierre no se adelanta) |
| 47 | Stock aplicado | ✅ `ART-SHAKE` 60 → 59 |
| 48 | `POST /api/cierres` con la misma venta | ✅ `200`, no duplica, caja → **`cerrada`**, `total_ventas: 1`, `total_efectivo: 45`, `efectivo_esperado: 545` (fondo 500 + 45), stock sigue en 59 |
| 49 | **Regresión detectada por la prueba 48** | ❌→✅ la caja **no se marcaba `cerrada`**: el `INSERT IGNORE` de H-011 no reescribía una fila existente y el `UPDATE` de totales ya no fijaba `estado`. Corregido en **CAM-020**. **19/19** tras el arreglo |
| 50 | PWA: configurar token desde la pantalla de acceso | ✅ "Token guardado. Ya puedes descargar los usuarios." |
| 51 | PWA: descarga del directorio | ✅ aparecen **Administrador (admin)** y **Recepción (recepcionista)** |
| 52 | PWA: definir PIN en el primer uso | ✅ "Define tu PIN para este equipo (4 a 6 dígitos)" → entrada directa |
| 53 | PWA: PIN incorrecto | ✅ rechazado con "PIN incorrecto", sin entrar |
| 54 | PWA: PIN correcto | ✅ dentro, cabecera "Recepción · Caja C-20261014-F042" |
| 55 | PWA: sesión restaurada al volver a entrar | ✅ vuelve a pedir PIN (hash persistido), no ofrece definirlo |
| 56 | PWA: apertura de caja | ✅ `C-20261014-F042`, fondo $500 |
| 57 | PWA: cobro de Shake $45 en efectivo | ✅ servidor con caja `C-20261014-F042` (`abierta`) + venta `V-1014-F042-0001` con **`usuario_id: 2`** |
| 58 | Stock local y de servidor tras la venta | ✅ local 60 → 59; servidor 60 → 58 (incluye la venta del arnés del nº 47) |
| 59 | Pestaña Sync tras el cobro | ✅ `Sincronizar pendientes (0)` — sin lotes fallidos |
| 60 | `php -l` sobre `index.php` | ✅ sin errores de sintaxis |

> **Bugs encontrados al verificar y corregidos:** (1) la caja nunca se cerraba (prueba 49, CAM-020); (2) **circuito cerrado del token**: `Sync` quedó tras el login, pero entrar exige descargar el directorio, que exige el token → un equipo nuevo no podía configurarse (CAM-022); (3) el dev server no podía alcanzar la API por CORS, resuelto con el proxy optativo `VITE_API_PROXY` en vez de añadir cabeceras CORS a producción (CAM-022).
>
> **Nota de verificación:** el servidor se ejecutó sobre **SQLite**, no MySQL. Las sentencias las emite el `index.php` real, pero faltan diferencias propias de MySQL (`rowCount()` en `INSERT IGNORE`, manejo de tipos y de `FOR UPDATE`). **Queda pendiente de confirmar contra MySQL real**, igual que CAM-011, CAM-012, CAM-017 y CAM-018.
>
> **Observación menor (no corregida):** `cajas.numero` se construye con `toISOString()` (UTC) y `fecha_apertura` con hora local, de modo que en horario nocturno el número puede llevar la fecha del día siguiente. No afecta la unicidad por equipo, pero conviene unificarlo.

---

## 6. Próximos pasos

1. ~~Corregir H-001, H-004, H-005 y H-006~~ → **hecho (CAM-002 … CAM-005)**.
2. ~~Agregar `.gitignore`~~ → **hecho (CAM-006)**.
3. ~~Documentar instalación/despliegue en `README.md` (H-015) y `.htaccess` raíz para `/api` (H-008)~~ → **hecho (CAM-013, CAM-014)**.
4. ~~Atacar H-002 y H-003~~ → **hecho y verificado en vivo (CAM-007, CAM-008)**.
5. ~~Nueva identidad visual~~ → **hecho y verificado (CAM-015)**.
6. ~~Atacar H-011 (colisión multi-dispositivo)~~ → **hecho y verificado (CAM-017)**.
7. ~~Atacar H-017 (PDO duplicado) e H-019 (icono iOS)~~ → **hecho (CAM-018, CAM-019)**.
8. ~~Atacar **H-007** (sync por venta)~~ → **hecho y verificado (CAM-020)**.
9. ~~Atacar **H-009** (login real en la PWA)~~ → **hecho y verificado (CAM-021)**.
10. Atacar **H-013** (impresora / popup bloqueado) — al cobrar se abrió una pestaña `about:blank` que la automatización tuvo que cerrar a mano; sigue sin aviso al usuario si el navegador lo bloquea.
11. Reintentar la prueba de UI de CAM-009 (tope de stock) y CAM-010 (indicador online) cuando el navegador vuelva a responder de forma estable.
12. Verificar CAM-011, CAM-012, CAM-017, CAM-018, CAM-020 y CAM-021 contra **MySQL real** (Opción B) — es lo único que falta para dar por cerrados H-007, H-009, H-011, H-017 y H-019 sin reservas.
13. Unificar la fecha de `cajas.numero` (UTC) con la de `fecha_apertura` (local), observada en el lote 6.
14. Atacar H-016 (endurecer el login del panel) y H-021 (tests, linter, CI).
