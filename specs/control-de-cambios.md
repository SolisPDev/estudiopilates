# Control de cambios · Estudio Pilates & Barre

Documento de seguimiento de modificaciones al proyecto `c:\proyectos\estudiopilates`.

- **Última actualización:** 2026-10-13
- **Estado del proyecto:** MVP funcional en local (PWA) con identidad visual aplicada; API y panel sin ejecutar todavía.
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
| H-007 | `pos/src/api/sync.js` | **Las ventas solo viajan al cerrar caja.** Sin sync por venta ni exportación de respaldo. | **Confirmado en vivo:** al cerrar la pestaña se borró IndexedDB y se perdieron la venta, el egreso y el estado de caja. |
| H-008 | `cpanel/api/public/index.php` + `pos/vite.config.js` | ~~La ruta `/api` no resuelve sin un `.htaccess` raíz~~ → cerrado en **CAM-011** + **CAM-013**. | — |
| H-009 | `pos/src/api/sync.js:29` · `pos/src/App.jsx:30` | **Sin usuario real en el POS.** No hay login; `usuario_id` siempre es `1` y `usuario_nombre` nunca se escribe. Toda venta queda atribuida al admin. | Revisión de código. |
| H-010 | `cpanel/panel/dashboard.php:3`, `stock.php:3` | ~~`require_admin()` nunca se llama~~ → cerrado en **CAM-012**. | — |
| H-011 | `cpanel/api/public/index.php:94` + `db/schema.sql:72` | **Colisión con 2 dispositivos:** `cajas.numero = C-AAAAAMMDD` es UNIQUE y el upsert sobrescribiría la caja del otro equipo; el folio (`Venta.jsx:105`) colisionaría y la venta se descartaría. | Revisión de código. |
| H-012 | `cpanel/api/public/index.php:34` | ~~Zona horaria~~ → cerrado en **CAM-011**. | — |

### 🟡 Medios

| ID | Archivo:línea | Hallazgo |
|---|---|---|
| H-013 | `pos/src/lib/impresora.js:125` | `conectarImpresora()` no está en ninguna pantalla: la impresora térmica nunca se conecta; siempre cae al `window.open`, que si el navegador lo bloquea → ticket solo en pantalla y sin aviso. |
| H-015 | `README.md` | ~~Vacío~~ → cerrado en **CAM-014**. |
| H-016 | `cpanel/panel/index.php:63` | La página de acceso anuncia los usuarios seed; `:37` filtra el mensaje de PDO y puede filtrar host/usuario de la BD. Sin límite de intentos de login. |
| H-017 | `cpanel/panel/stock.php:5-10`, `dashboard.php:5-10` | Duplican la conexión PDO en vez de usar `Database::pdo()`. |
| H-018 | `pos/src/pages/Sync.jsx:55` | ~~Indicador online sin listeners~~ → cerrado en **CAM-010**. |
| H-019 | `pos/vite.config.js:26` | Solo icono SVG en el manifest → sin `apple-touch-icon` para iOS. |
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
| H-008 | `/api` no resolvía en cPanel sin `.htaccess` raíz | **CAM-011** + **CAM-013** | 2026-10-13 |
| H-010 | Panel web sin autorización (`require_admin()` sin llamar) | **CAM-012** | 2026-10-13 |
| H-012 | Zona horaria de corte no fijada | **CAM-011** | 2026-10-13 |
| H-014 | Sin `.gitignore` (riesgo de commitear `node_modules` o `config.php`) | **CAM-006** | 2026-10-13 |
| H-015 | `README.md` vacío | **CAM-014** | 2026-10-13 |
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

---

## 6. Próximos pasos

1. ~~Corregir H-001, H-004, H-005 y H-006~~ → **hecho (CAM-002 … CAM-005)**.
2. ~~Agregar `.gitignore`~~ → **hecho (CAM-006)**.
3. ~~Documentar instalación/despliegue en `README.md` (H-015) y `.htaccess` raíz para `/api` (H-008)~~ → **hecho (CAM-013, CAM-014)**.
4. ~~Atacar H-002 y H-003~~ → **hecho y verificado en vivo (CAM-007, CAM-008)**.
5. ~~Nueva identidad visual~~ → **hecho y verificado (CAM-015)**.
6. Reintentar la prueba de UI de CAM-009 (tope de stock) y CAM-010 (indicador online) cuando el navegador vuelva a responder de forma estable.
7. Verificar CAM-011 y CAM-012 contra MySQL real (Opción B), que es lo único que faltaría para cerrar del todo H-008, H-010 y H-012.
8. Atacar H-011 (colisión multi-dispositivo), H-009 (login en PWA) y H-013 (impresora / popup bloqueado).
