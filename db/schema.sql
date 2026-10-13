-- ============================================================
-- Estudio Pilates & Barre | POS y Control Operativo (MVP)
-- Esquema MySQL para hosting cPanel (MySQL 5.7+ / MariaDB 10.2+)
--
-- IMPORTANTE:
--   1. Crear la base de datos desde el cPanel (MySQL Databases)
--      con el usuario con permisos completos.
--   2. Importar este archivo en esa base.
--   3. Cambiar las contrasenas de los usuarios seed al primer ingreso.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Usuarios del sistema
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','recepcionista') NOT NULL DEFAULT 'recepcionista',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Productos y servicios vendibles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  categoria VARCHAR(60) NOT NULL DEFAULT 'articulo',
  tipo ENUM('paquete_clases','inscripcion','articulo') NOT NULL DEFAULT 'articulo',
  precio_venta DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock DECIMAL(10,3) NOT NULL DEFAULT 0,
  stock_minimo DECIMAL(10,3) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_codigo (codigo),
  KEY idx_productos_categoria (categoria),
  KEY idx_productos_tipo (tipo)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Cajas (apertura / cierre de turno)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cajas (
  id CHAR(36) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  usuario_id_apertura INT UNSIGNED NULL,
  usuario_id_cierre INT UNSIGNED NULL,
  fondo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
  fecha_apertura DATETIME NOT NULL,
  fecha_cierre DATETIME NULL,
  total_ventas INT UNSIGNED NOT NULL DEFAULT 0,
  total_ingresos DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_efectivo DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_transferencia DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_tarjeta DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_egresos DECIMAL(10,2) NOT NULL DEFAULT 0,
  efectivo_esperado DECIMAL(10,2) NOT NULL DEFAULT 0,
  efectivo_contado DECIMAL(10,2) NULL,
  diferencia DECIMAL(10,2) NULL,
  estado ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  PRIMARY KEY (id),
  UNIQUE KEY uq_cajas_numero (numero),
  KEY idx_cajas_fecha (fecha_cierre),
  KEY idx_cajas_estado (estado),
  CONSTRAINT fk_cajas_apertura FOREIGN KEY (usuario_id_apertura)
    REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_cajas_cierre FOREIGN KEY (usuario_id_cierre)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Ventas (cada ticket de recepcion)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ventas (
  id CHAR(36) NOT NULL,
  folio VARCHAR(20) NOT NULL,
  caja_id CHAR(36) NOT NULL,
  usuario_id INT UNSIGNED NULL,
  cliente VARCHAR(160) NULL,
  fecha DATETIME NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  impuesto DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ventas_folio (folio),
  KEY idx_ventas_caja (caja_id),
  KEY idx_ventas_fecha (fecha),
  CONSTRAINT fk_ventas_caja FOREIGN KEY (caja_id)
    REFERENCES cajas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Partidas de cada venta
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venta_items (
  id CHAR(36) NOT NULL,
  venta_id CHAR(36) NOT NULL,
  producto_id INT UNSIGNED NULL,
  nombre VARCHAR(160) NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_items_venta (venta_id),
  CONSTRAINT fk_items_venta FOREIGN KEY (venta_id)
    REFERENCES ventas(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Pagos (puede haber varios por venta)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
  id CHAR(36) NOT NULL,
  venta_id CHAR(36) NOT NULL,
  metodo ENUM('efectivo','transferencia','tarjeta') NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  referencia VARCHAR(80) NULL COMMENT 'Clave de rastreo (transf.) o ultimos 4 digitos (tarjeta)',
  fecha DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pagos_venta (venta_id),
  KEY idx_pagos_metodo (metodo),
  CONSTRAINT fk_pagos_venta FOREIGN KEY (venta_id)
    REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Egresos de caja chica
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS egresos (
  id CHAR(36) NOT NULL,
  caja_id CHAR(36) NOT NULL,
  usuario_id INT UNSIGNED NULL,
  categoria VARCHAR(60) NOT NULL,
  concepto VARCHAR(200) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  responsable VARCHAR(120) NULL,
  fecha DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_egresos_caja (caja_id),
  KEY idx_egresos_fecha (fecha),
  CONSTRAINT fk_egresos_caja FOREIGN KEY (caja_id)
    REFERENCES cajas(id) ON DELETE CASCADE,
  CONSTRAINT fk_egresos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Movimientos de inventario (venta, entrada, ajuste)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id CHAR(36) NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  tipo ENUM('venta','entrada','ajuste_in','ajuste_out') NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL COMMENT 'Signo: + entrada / - salida',
  referencia VARCHAR(100) NULL,
  fecha DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_mov_producto (producto_id),
  KEY idx_mov_fecha (fecha),
  CONSTRAINT fk_mov_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Lotes de cierre de turno (sync PWA -> hosting)
-- Cada "cierre de turno" genera un lote idempotente.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cierres (
  id CHAR(36) NOT NULL,
  caja_id CHAR(36) NOT NULL,
  usuario_id_cierre INT UNSIGNED NULL,
  fecha_cierre DATETIME NOT NULL,
  recibido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resumen JSON NULL,
  PRIMARY KEY (id),
  KEY idx_cierres_caja (caja_id),
  KEY idx_cierres_fecha (fecha_cierre),
  CONSTRAINT fk_cierres_caja FOREIGN KEY (caja_id)
    REFERENCES cajas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SEED
-- Contrasenas DEFAULT (CAMBIAR al primer ingreso):
--   admin      -> Admin123!
--   recepcion  -> Recepcion123!
-- ------------------------------------------------------------
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
('Administrador', 'admin@estudio.mx', '$2y$10$55ElOfG/Amv5T4ujEDL6TuYbWbrBYcHESm0O9ZnHRDEwBHtEVal0.', 'admin'),
('Recepción', 'recepcion@estudio.mx', '$2y$10$Y6aLDGuPmya8O5.fo/et7e0gZeL3IIvyOfcAefQ4KQ7b3vCxXAifa', 'recepcionista');

INSERT INTO productos (codigo, nombre, categoria, tipo, precio_venta, stock, stock_minimo) VALUES
('PK-PIL-10', 'Paquete 10 clases Pilates', 'clases', 'paquete_clases', 1500.00, 0, 0),
('PK-BAR-10', 'Paquete 10 clases Barre', 'clases', 'paquete_clases', 1500.00, 0, 0),
('PK-UNLIM', 'Suscripción mensual ilimitada', 'clases', 'paquete_clases', 2800.00, 0, 0),
('INS', 'Inscripción anual', 'inscripcion', 'inscripcion', 300.00, 0, 0),
('ART-TOALLA', 'Toalla deportiva', 'prendas', 'articulo', 250.00, 30, 5),
('ART-BOTELLA', 'Botella de agua', 'bebidas', 'articulo', 25.00, 100, 20),
('ART-SHAKE', 'Shake proteico', 'suplementos', 'articulo', 45.00, 60, 10),
('ART-MANIA', 'Mancuernas ligeras', 'accesorios', 'articulo', 180.00, 15, 3);

SET FOREIGN_KEY_CHECKS = 1;