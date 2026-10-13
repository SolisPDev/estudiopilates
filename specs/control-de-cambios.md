# Control de cambios · Estudio Pilates & Barre

Documento de seguimiento de modificaciones al proyecto `c:\proyectos\estudiopilates`.

- **Última actualización:** 2026-10-13
- **Estado del proyecto:** MVP funcional en local (PWA); API y panel sin ejecutar todavía.
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

---

## 4. Hallazgos pendientes (backlog)

### 🔴 Críticos

| ID | Archivo:línea | Hallazgo | Evidencia |
|---|---|---|---|
| H-002 | `pos/src/db/database.js:36-43` vs `db/schema.sql:110,166` | **IDs de producto incompatibles.** Local usa strings (`'art-toalla'`); el servidor espera `INT UNSIGNED`. Al sincronizar, `producto_id` llega como texto → se coagera a `0` o falla la FK. | Revisión de código. El stock del servidor nunca se actualizaría. |
| H-003 | `pos/src/pages/Inventario.jsx:33` vs `pos/src/api/sync.js:73` | **Ajustes de inventario no se sincronizan.** Se crean con `caja_id: null` y `construirLote` solo consulta movimientos de la caja. | Revisión de código. El stock del panel web divergirá del real. |

### 🟠 Altos

| ID | Archivo:línea | Hallazgo | Evidencia |
|---|---|---|---|
| H-007 | `pos/src/api/sync.js` | **Las ventas solo viajan al cerrar caja.** Sin sync por venta ni exportación de respaldo. | **Confirmado en vivo:** al cerrar la pestaña se borró IndexedDB y se perdieron la venta, el egreso y el estado de caja. |
| H-008 | `cpanel/api/public/index.php` + `pos/vite.config.js` | **La ruta `/api` no resuelve sin un `.htaccess` raíz** que reescriba `/api/* → api/public/*`. No existe ese archivo, y el README no documenta el orden de copia a `public_html`. | Revisión de código. |
| H-009 | `pos/src/api/sync.js:29` · `pos/src/App.jsx:30` | **Sin usuario real en el POS.** No hay login; `usuario_id` siempre es `1` y `usuario_nombre` nunca se escribe. Toda venta queda atribuida al admin. | Revisión de código. |
| H-010 | `cpanel/panel/dashboard.php:3`, `stock.php:3` | **`require_admin()` nunca se llama** (`guard.php:18`): recepcionistas pueden entrar al reporte del dueño. | Búsqueda de usos. |
| H-011 | `cpanel/api/public/index.php:94` + `db/schema.sql:72` | **Colisión con 2 dispositivos:** `cajas.numero = C-AAAAAMMDD` es UNIQUE y el upsert sobrescribiría la caja del otro equipo; el folio (`Venta.jsx:105`) colisionaría y la venta se descartaría. | Revisión de código. |
| H-012 | `cpanel/api/public/index.php:34` | **Zona horaria:** `dt()` convierte ISO-8601 UTC a `DATETIME` con la TZ de PHP. Sin `date_default_timezone_set('America/Mexico_City')` los cortes pueden caer en el día siguiente. | Revisión de código. |

### 🟡 Medios

| ID | Archivo:línea | Hallazgo |
|---|---|---|
| H-013 | `pos/src/lib/impresora.js:125` | `conectarImpresora()` no está en ninguna pantalla: la impresora térmica nunca se conecta; siempre cae al `window.open`, que si el navegador lo bloquea → ticket solo en pantalla y sin aviso. |
| H-015 | `README.md` | Vacío (1 línea). Sin pasos de instalación ni despliegue. |
| H-016 | `cpanel/panel/index.php:63` | La página de acceso anuncia los usuarios seed; `:37` filtra el mensaje de PDO y puede filtrar host/usuario de la BD. Sin límite de intentos de login. |
| H-017 | `cpanel/panel/stock.php:5-10`, `dashboard.php:5-10` | Duplican la conexión PDO en vez de usar `Database::pdo()`. |
| H-018 | `pos/src/pages/Sync.jsx:55` | Lee `navigator.onLine` sin listeners `online/offline`: el indicador puede quedar desactualizado. |
| H-019 | `pos/vite.config.js:26` | Solo icono SVG en el manifest → sin `apple-touch-icon` para iOS. |
| H-020 | `pos/src/pages/Venta.jsx:151` | El stock local puede bajar de cero (incremento sin tope) y el servidor clampa con `max(0,…)` → divergencia local/servidor. |
| H-021 | proyecto | Sin tests, sin linter, sin CI. |

### 4.1 Hallazgos cerrados

| ID | Hallazgo | Cerrado en | Fecha |
|---|---|---|---|
| H-001 | Cierre de caja imposible (campo borrado en cada tecla) | **CAM-002** | 2026-10-13 |
| H-004 | Cobro en efectivo no completaba el total (> $500) | **CAM-003** | 2026-10-13 |
| H-005 | Sobrepaga/vuelto bloqueado | **CAM-004** | 2026-10-13 |
| H-006 | Modal de recibo nunca aparecía | **CAM-005** | 2026-10-13 |
| H-014 | Sin `.gitignore` (riesgo de commitear `node_modules` o `config.php`) | **CAM-006** | 2026-10-13 |

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

> **Observación:** al cerrar la pestaña del navegador se borró IndexedDB y se perdieron los datos de la primera tanda de pruebas. Es la evidencia en vivo de **H-007** (las ventas solo se envían al cerrar caja).

---

## 6. Próximos pasos

1. ~~Corregir H-001, H-004, H-005 y H-006~~ → **hecho (CAM-002 … CAM-005)**.
2. Agregar `.gitignore` → **hecho (CAM-006)**.
3. Documentar instalación/despliegue en `README.md` (H-015) y `.htaccess` raíz para `/api` (H-008).
4. Opción B: levantar MySQL (XAMPP) + API PHP + proxy de Vite → probar venta → cierre → MySQL → panel, validando H-002 en vivo.
5. Atacar H-002 y H-003 (sin esto el stock del servidor nunca cuadra).
6. H-013: botón de conexión de impresora y manejo explícito del popup bloqueado.
