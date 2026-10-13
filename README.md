# Estudio Pilates & Barre — POS y control operativo

Punto de venta **offline-first** para un estudio de Pilates y Barre, con cierre
de turno, control de inventario y panel de reportes para el dueño.

| Componente | Tecnología | Carpeta | Función |
|---|---|---|---|
| PWA de mostrador | React 18 · Vite · Tailwind 4 · Dexie (IndexedDB) | `pos/` | Venta, caja, inventario y sync. Opera **sin internet**. |
| API de sincronización | PHP 8 puro + PDO | `cpanel/api/` | Recibe el lote idempotente de cierre de turno. |
| Panel de reportes | PHP + sesiones | `cpanel/panel/` | Cortes de caja y control de stock (solo administrador). |
| Base de datos | MySQL 5.7+ / MariaDB 10.2+ | `db/schema.sql` | Esquema y datos semilla. |

---

## 1. Requisitos

- Node.js 18+ y npm (para la PWA)
- PHP 8.1+ con `pdo_mysql` (para API y panel)
- MySQL 5.7+ o MariaDB 10.2+

---

## 2. Ejecutar la PWA en local

```bash
cd pos
npm install
npm run dev
```

Abre **http://localhost:5137/pos/**

Flujo mínimo para probar:

1. **Caja** → `ABRIR CAJA` (fondo inicial, p. ej. 500).
2. **Venta** → toca un producto → `+ Efectivo` → `COBRAR`.
3. **Inventario** → ajusta stock (entrada/salida).
4. **Caja** → registra egresos → `CERRAR CAJA Y ENVIAR CORTE`.
5. **Sync** → ahí aparece el lote del cierre, con estado y reintentos.

Sin API configurada el lote queda en `FALLIDO` (estado esperado), y se
reintenta desde **Sync** cuando conectes el hosting.

```bash
npm run build   # genera pos/dist listo para subir a /pos/
```

---

## 3. Base de datos

1. Crea la base y un usuario con permisos completos desde **cPanel → MySQL Databases**.
2. Importa `db/schema.sql` desde **phpMyAdmin**.
3. Cambia las contraseñas de los usuarios semilla al primer ingreso:

| Rol | Email | Contraseña seed |
|---|---|---|
| admin | admin@estudio.mx | `Admin123!` |
| recepcionista | recepcion@estudio.mx | `Recepcion123!` |

---

## 4. API de sincronización

Copia la configuración y genera un token largo:

```bash
cp cpanel/api/config.example.php cpanel/api/config.php
php -r "echo bin2hex(random_bytes(24));"   # valor para 'api_token'
```

Endpoints (todos salvo `health` exigen el header `X-Api-Token`):

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Verificación de salud. |
| `POST` | `/api/cierres` | Lote de cierre de turno. **Idempotente**: reenviar no duplica. |

Notas del lote:

- Cada venta, egreso y movimiento lleva su UUID, por eso el servidor usa
  `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE`.
- Los productos se resuelven **por `producto_id` o por `codigo`**, porque los
  IDs locales de la PWA pueden ser textuales (`art-toalla`).
- Los totales se recalculan **en el servidor**: lo que muestra el panel no
  depende de lo que envió el cliente.
- El token debe coincidir con el de la pestaña **Sync** de la PWA.

---

## 5. Panel de reportes

Sube `cpanel/panel/` tal cual. Rutas:

- `/panel/index.php` — acceso.
- `/panel/dashboard.php` — cortes de caja por rango de fechas (imprimible).
- `/panel/stock.php` — inventario y alertas de mínimo.

Solo el rol `admin` puede entrar (`require_admin()`).

---

## 6. Despliegue en cPanel

1. **Sube los archivos** a `public_html/`:

   | Destino | Origen |
   |---|---|
   | `public_html/pos/` | `pos/dist/` (tras `npm run build`) |
   | `public_html/api/` | `cpanel/api/` completa |
   | `public_html/panel/` | `cpanel/panel/` completa |
   | `public_html/.htaccess` | `cpanel/htaccess-raiz.example` |

2. **Crea** `public_html/api/config.php` **en el hosting** (no lo subas desde
   tu equipo): host, base, usuario, contraseña y `api_token`.
3. Importa `db/schema.sql`.
4. Activa **mod_rewrite / AllowOverride** si tu plan lo requiere
   (cPanel → MultiPHP Manager o `.htaccess` en la raíz).
5. Verifica: `https://tu-dominio/api/health` debe devolver `{"ok":true,...}`.
6. En la PWA, pestaña **Sync**, pega el mismo token y guarda.

> `config.php` y `.env*` están en `.gitignore`: nunca se commitean.

---

## 7. Estructura del repositorio

```
estudiopilates/
├── db/schema.sql              # esquema + seed MySQL
├── cpanel/
│   ├── api/                   # API PHP (public/ es el front controller)
│   ├── panel/                 # panel de reportes
│   └── htaccess-raiz.example  # .htaccess para public_html/
├── pos/                       # PWA (React + Vite)
├── specs/control-de-cambios.md  # control de cambios y registro de pruebas
└── README.md
```

---

## 8. Control de cambios y pendientes

El seguimiento de modificaciones, las pruebas realizadas y el backlog de
hallazgos está en [`specs/control-de-cambios.md`](specs/control-de-cambios.md).
Ahí están marcados como abiertos, entre otros:

- **H-007** — las ventas solo se envían al cerrar caja (sin sync por venta).
- **H-009** — no hay login en la PWA; todas las ventas quedan como `usuario_id = 1`.
- **H-011** — colisión de `cajas.numero` / folio si se usan dos equipos el mismo día.
- **H-013** — no hay botón para conectar la impresora térmica.
