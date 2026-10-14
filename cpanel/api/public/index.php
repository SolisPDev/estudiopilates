<?php

declare(strict_types=1);

// Zona horaria local del estudio: los ISO-8601 que envia la PWA vienen en UTC
// y las fechas del panel se muestran tal cual (H-012).
date_default_timezone_set('America/Mexico_City');

// API REST del sistema POS (PHP puro + PDO, sin dependencias externas).
// Publicar este directorio (cpanel/api/public) como raiz de la app en cPanel.
//
// Endpoints:
//   GET  /api/health      -> verificacion de salud
//   GET  /api/usuarios    -> id, nombre y rol para el login de la PWA (H-009)
//   POST /api/ventas      -> registra una venta en el momento del cobro (H-007)
//   POST /api/cierres     -> recepcion del lote de cierre de turno (idempotente)
//
// Todas las rutas (excepto health) exigen el header:
//   X-Api-Token: <token>   (mismo valor que config.php y la pestaña Sync de la PWA)

require __DIR__ . '/../src/Database.php';

$config = require __DIR__ . '/../config.php';

function resp_json(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Convierte ISO 8601 de la PWA a DATETIME de MySQL.
function dt(?string $iso): ?string
{
    if ($iso === null || $iso === '') {
        return null;
    }
    $t = strtotime($iso);
    return $t === false ? null : date('Y-m-d H:i:s', $t);
}

function autorizar(array $config): void
{
    $token = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    if (!hash_equals((string) $config['api_token'], $token)) {
        resp_json(['error' => 'Token invalido'], 401);
    }
}

function redondear(mixed $v): float
{
    return round((float) $v, 2);
}

/**
 * Registra la caja del equipo como "abierta" si aun no existe en el servidor.
 *
 * Viaja en cada venta individual: la FK fk_ventas_caja impide insertar una
 * venta cuya caja no este dada de alta. Se usa INSERT IGNORE para no tocar
 * nunca una caja ya cerrada (el cierre llega despues, con /cierres) ni la
 * caja de otro dispositivo (H-007, H-011).
 *
 * @return bool false si el id no quedo registrado (colision de "numero").
 */
function registrarCajaAbierta(PDO $pdo, array $caja): bool
{
    $id = (string) $caja['id'];
    $pdo->prepare(
        "INSERT IGNORE INTO cajas
            (id, numero, usuario_id_apertura, fondo_inicial, fecha_apertura, estado)
         VALUES
            (:id, :numero, :u_apertura, :fondo, :f_apertura, 'abierta')"
    )->execute([
        ':id' => $id,
        ':numero' => (string) ($caja['numero'] ?? $id),
        ':u_apertura' => $caja['usuario_id_apertura'] ?? null,
        ':fondo' => redondear($caja['fondo_inicial'] ?? 0),
        ':f_apertura' => dt($caja['fecha_apertura'] ?? null) ?? date('Y-m-d H:i:s'),
    ]);

    $existe = $pdo->prepare('SELECT COUNT(*) AS n FROM cajas WHERE id = :id');
    $existe->execute([':id' => $id]);
    return (int) $existe->fetch()['n'] > 0;
}

/**
 * Inserta ventas, items, pagos y movimientos de forma idempotente.
 *
 * Compartido por /cierres y /ventas (H-007): cada fila lleva su uuid, de modo
 * que enviar la misma venta dos veces no duplica ni el stock ni los importes.
 *
 * @return array{ventas:int, movimientos:int, sin_producto:int, ventas_perdidas:array}
 */
function registrarDetalles(PDO $pdo, array $ventas, array $movimientos): array
{
    $insertVenta = $pdo->prepare(
        "INSERT IGNORE INTO ventas
            (id, folio, caja_id, usuario_id, cliente, fecha, subtotal, impuesto, total)
         VALUES
            (:id, :folio, :caja_id, :usuario_id, :cliente, :fecha, :subtotal, :impuesto, :total)"
    );
    $insertItem = $pdo->prepare(
        "INSERT IGNORE INTO venta_items
            (id, venta_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
         VALUES
            (:id, :venta_id, :producto_id, :nombre, :cantidad, :precio, :subtotal)"
    );
    $insertPago = $pdo->prepare(
        "INSERT IGNORE INTO pagos
            (id, venta_id, metodo, monto, referencia, fecha)
         VALUES
            (:id, :venta_id, :metodo, :monto, :referencia, :fecha)"
    );
    $insertMov = $pdo->prepare(
        "INSERT IGNORE INTO movimientos_inventario
            (id, producto_id, tipo, cantidad, referencia, fecha)
         VALUES
            (:id, :producto_id, :tipo, :cantidad, :referencia, :fecha)"
    );

    $verificaProd = $pdo->prepare('SELECT id, stock FROM productos WHERE id = :id FOR UPDATE');
    $updateStock = $pdo->prepare('UPDATE productos SET stock = :stock WHERE id = :id AND stock <> :stock');

    $buscarPorId = $pdo->prepare('SELECT id FROM productos WHERE id = :id LIMIT 1');
    $buscarPorCodigo = $pdo->prepare('SELECT id FROM productos WHERE codigo = :codigo LIMIT 1');
    // Permite distinguir una venta ya sincronizada de una descartada por
    // colision de folio (INSERT IGNORE las oculta en silencio) (H-011).
    $ventaExiste = $pdo->prepare('SELECT id FROM ventas WHERE id = :id LIMIT 1');

    // Acepta tanto el id numerico como el codigo: los ids locales de la PWA
    // pueden ser textuales ('art-toalla') y la columna es INT UNSIGNED (H-002).
    $resolverProducto = function ($idCrudo, $codigo) use ($buscarPorId, $buscarPorCodigo): ?int {
        if ($idCrudo !== null && $idCrudo !== '' && is_numeric((string) $idCrudo)) {
            $buscarPorId->execute([':id' => (int) $idCrudo]);
            $fila = $buscarPorId->fetch();
            if ($fila) {
                return (int) $fila['id'];
            }
        }
        if ($codigo !== null && $codigo !== '') {
            $buscarPorCodigo->execute([':codigo' => (string) $codigo]);
            $fila = $buscarPorCodigo->fetch();
            if ($fila) {
                return (int) $fila['id'];
            }
        }
        return null;
    };

    $nuevos = ['ventas' => 0, 'movimientos' => 0, 'sin_producto' => 0];
    $ventasPerdidas = [];

    foreach ($ventas as $v) {
        $ventaId = (string) ($v['id'] ?? '');
        $ventaExiste->execute([':id' => $ventaId]);
        $yaEnviada = (bool) $ventaExiste->fetch();

        $okVenta = $insertVenta->execute([
            ':id' => $ventaId,
            ':folio' => (string) ($v['folio'] ?? ('V-' . substr($ventaId, 0, 8))),
            ':caja_id' => (string) ($v['caja_id'] ?? ''),
            ':usuario_id' => $v['usuario_id'] ?? null,
            ':cliente' => $v['cliente'] ?? null,
            ':fecha' => dt($v['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
            ':subtotal' => redondear($v['subtotal'] ?? 0),
            ':impuesto' => redondear($v['impuesto'] ?? 0),
            ':total' => redondear($v['total'] ?? 0),
        ]);
        if ($okVenta && $insertVenta->rowCount() > 0) {
            $nuevos['ventas']++;
        } elseif (!$yaEnviada && $ventaId !== '') {
            // No existia antes y tampoco se escribio: su folio pertenece a otra
            // venta. Se reporta en vez de descartarla en silencio (H-011).
            $ventasPerdidas[] = ['id' => $ventaId, 'folio' => $v['folio'] ?? null];
        }
        foreach (($v['items'] ?? []) as $i) {
            $insertItem->execute([
                ':id' => (string) ($i['id'] ?? ''),
                ':venta_id' => $ventaId,
                ':producto_id' => $resolverProducto($i['producto_id'] ?? null, $i['codigo'] ?? null),
                ':nombre' => (string) ($i['nombre'] ?? 'Producto'),
                ':cantidad' => $i['cantidad'] ?? 1,
                ':precio' => redondear($i['precio_unitario'] ?? 0),
                ':subtotal' => redondear($i['subtotal'] ?? 0),
            ]);
        }
        foreach (($v['pagos'] ?? []) as $p) {
            $insertPago->execute([
                ':id' => (string) ($p['id'] ?? ''),
                ':venta_id' => $ventaId,
                ':metodo' => (string) ($p['metodo'] ?? 'efectivo'),
                ':monto' => redondear($p['monto'] ?? 0),
                ':referencia' => $p['referencia'] ?? null,
                ':fecha' => dt($p['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
            ]);
        }
    }

    foreach ($movimientos as $m) {
        $pidMov = $resolverProducto($m['producto_id'] ?? null, $m['codigo'] ?? null);
        if ($pidMov === null) {
            // Sin producto equivalente en el servidor: no se aplica al stock.
            $nuevos['sin_producto']++;
            continue;
        }
        if ($insertMov->execute([
            ':id' => (string) ($m['id'] ?? ''),
            ':producto_id' => $pidMov,
            ':tipo' => (string) ($m['tipo'] ?? 'venta'),
            ':cantidad' => redondear($m['cantidad'] ?? 0),
            ':referencia' => $m['referencia'] ?? null,
            ':fecha' => dt($m['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
        ]) && $insertMov->rowCount() > 0) {
            $nuevos['movimientos']++;
            $verificaProd->execute([':id' => $pidMov]);
            $prod = $verificaProd->fetch();
            if ($prod) {
                $nuevoStock = max(0.0, (float) $prod['stock'] + (float) $m['cantidad']);
                $updateStock->execute([':stock' => $nuevoStock, ':id' => $pidMov]);
            }
        }
    }

    return [
        'ventas' => $nuevos['ventas'],
        'movimientos' => $nuevos['movimientos'],
        'sin_producto' => $nuevos['sin_producto'],
        'ventas_perdidas' => $ventasPerdidas,
    ];
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rtrim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
if ($path === '') {
    $path = '/';
}

// Se compara por sufijo para que funcione igual con cualquiera de estos
// despliegues (H-008):
//   https://dominio/api/cierres          (reescritura en la raiz del sitio)
//   https://dominio/cierres              (virtual host apuntando a public/)
$ruta = '/';
if (preg_match('#/api/health$|^/health$#', $path)) {
    $ruta = '/health';
} elseif (preg_match('#/api/cierres$|^/cierres$#', $path)) {
    $ruta = '/cierres';
} elseif (preg_match('#/api/ventas$|^/ventas$#', $path)) {
    $ruta = '/ventas';
} elseif (preg_match('#/api/usuarios$|^/usuarios$#', $path)) {
    $ruta = '/usuarios';
}

if ($metodo === 'GET' && $ruta === '/health') {
    resp_json(['ok' => true, 'time' => date('c')]);
}

// Directorio de usuarios para el login de la PWA (H-009).
// Devuelve solo id, nombre y rol: NUNCA el hash de contrasena, que no debe
// salir del servidor. El PIN del POS se guarda localmente en cada equipo.
if ($metodo === 'GET' && $ruta === '/usuarios') {
    autorizar($config);
    $filas = Database::pdo()
        ->query('SELECT id, nombre, rol FROM usuarios ORDER BY nombre')
        ->fetchAll();
    resp_json(['ok' => true, 'usuarios' => $filas]);
}

// Registro de una venta en el momento del cobro, sin esperar al cierre (H-007).
// La caja viaja "abierta"; su cierre y sus totales llegan despues, con /cierres.
if ($metodo === 'POST' && $ruta === '/ventas') {
    autorizar($config);

    $raw = file_get_contents('php://input');
    $b = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($b)) {
        resp_json(['error' => 'JSON invalido'], 400);
    }

    $caja = $b['caja'] ?? null;
    $ventas = $b['ventas'] ?? [];
    $movimientos = $b['movimientos'] ?? [];

    if (!is_array($caja) || empty($caja['id'])) {
        resp_json(['error' => 'Venta sin caja'], 400);
    }
    if (!is_array($ventas) || $ventas === []) {
        resp_json(['error' => 'Solicitud sin ventas'], 400);
    }
    if (!is_array($movimientos)) {
        resp_json(['error' => 'Estructura invalida'], 400);
    }

    $pdo = Database::pdo();
    $pdo->beginTransaction();

    // fk_ventas_caja exige que la caja exista antes que sus ventas.
    if (!registrarCajaAbierta($pdo, $caja)) {
        $pdo->rollBack();
        resp_json([
            'ok' => false,
            'error' => 'colision_caja',
            'detalle' => 'La caja no quedo registrada. Su numero "'
                . ($caja['numero'] ?? $caja['id']) . '" puede pertenecer a otro dispositivo.',
            'caja_id' => (string) $caja['id'],
        ], 409);
    }

    $detalles = registrarDetalles($pdo, $ventas, $movimientos);
    $pdo->commit();

    resp_json([
        'ok' => true,
        'caja_id' => (string) $caja['id'],
        'nuevos' => [
            'ventas' => $detalles['ventas'],
            'movimientos' => $detalles['movimientos'],
            'sin_producto' => $detalles['sin_producto'],
        ],
        'ventas_perdidas' => $detalles['ventas_perdidas'],
    ]);
}

if ($metodo === 'POST' && $ruta === '/cierres') {
    autorizar($config);

    $raw = file_get_contents('php://input');
    $b = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($b)) {
        resp_json(['error' => 'JSON invalido'], 400);
    }

    $caja = $b['caja'] ?? null;
    $ventas = $b['ventas'] ?? [];
    $egresos = $b['egresos'] ?? [];
    $movimientos = $b['movimientos'] ?? [];

    if (!is_array($caja) || empty($caja['id'])) {
        resp_json(['error' => 'Lote sin caja'], 400);
    }
    if (!is_array($ventas) || !is_array($egresos) || !is_array($movimientos)) {
        resp_json(['error' => 'Estructura de lote invalida'], 400);
    }

    $pdo = Database::pdo();
    $pdo->beginTransaction();

    // La caja se registra con INSERT IGNORE y nunca con ON DUPLICATE KEY UPDATE:
    // ese upsert se activa ante CUALQUIER unique key (no solo la PK), de modo que
    // un "numero" repetido por otro dispositivo habria reescrito su fila. Con
    // INSERT IGNORE la colision simplemente no escribe y la deteccion posterior
    // (ver $filasCaja) la reporta en vez de corromper datos (H-011).
    $upsertCaja = $pdo->prepare(
        "INSERT IGNORE INTO cajas
            (id, numero, usuario_id_apertura, usuario_id_cierre, fondo_inicial,
             fecha_apertura, fecha_cierre, total_ventas, total_ingresos, total_efectivo,
             total_transferencia, total_tarjeta, total_egresos, efectivo_esperado,
             efectivo_contado, diferencia, estado)
         VALUES
            (:id, :numero, :u_apertura, :u_cierre, :fondo, :f_apertura, :f_cierre,
             :t_ventas, :t_ingresos, :t_efectivo, :t_transf, :t_tarjeta, :t_egresos,
             :e_esperado, :e_contado, :diferencia, 'cerrada')"
    );

    $cajaId = (string) $caja['id'];
    $contado = isset($caja['efectivo_contado']) ? redondear($caja['efectivo_contado']) : null;
    $upsertCaja->execute([
        ':id' => $cajaId,
        ':numero' => (string) ($caja['numero'] ?? $cajaId),
        ':u_apertura' => $caja['usuario_id_apertura'] ?? null,
        ':u_cierre' => $caja['usuario_id_cierre'] ?? null,
        ':fondo' => redondear($caja['fondo_inicial'] ?? 0),
        ':f_apertura' => dt($caja['fecha_apertura'] ?? null),
        ':f_cierre' => dt($caja['fecha_cierre'] ?? null),
        ':t_ventas' => 0,
        ':t_ingresos' => 0,
        ':t_efectivo' => 0,
        ':t_transf' => 0,
        ':t_tarjeta' => 0,
        ':t_egresos' => 0,
        ':e_esperado' => 0,
        ':e_contado' => $contado,
        ':diferencia' => null,
    ]);

    // Ventas, items, pagos y movimientos: logica compartida con /ventas (H-007).
    $detalles = registrarDetalles($pdo, $ventas, $movimientos);
    $nuevos = [
        'caja' => true,
        'ventas' => $detalles['ventas'],
        'egresos' => 0,
        'movimientos' => $detalles['movimientos'],
        'sin_producto' => $detalles['sin_producto'],
    ];
    $ventasPerdidas = $detalles['ventas_perdidas'];

    $insertEgreso = $pdo->prepare(
        "INSERT IGNORE INTO egresos
            (id, caja_id, usuario_id, categoria, concepto, monto, responsable, fecha)
         VALUES
            (:id, :caja_id, :usuario_id, :categoria, :concepto, :monto, :responsable, :fecha)"
    );
    foreach ($egresos as $e) {
        if ($insertEgreso->execute([
            ':id' => (string) ($e['id'] ?? ''),
            ':caja_id' => $cajaId,
            ':usuario_id' => $e['usuario_id'] ?? null,
            ':categoria' => (string) ($e['categoria'] ?? 'otro'),
            ':concepto' => (string) ($e['concepto'] ?? ''),
            ':monto' => redondear($e['monto'] ?? 0),
            ':responsable' => $e['responsable'] ?? null,
            ':fecha' => dt($e['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
        ]) && $insertEgreso->rowCount() > 0) {
            $nuevos['egresos']++;
        }
    }

    // Totales autoritativos recalculados en el servidor para el arqueo de caja.
    $totMetodos = $pdo->prepare(
        'SELECT metodo, COALESCE(SUM(monto),0) AS t FROM pagos
          WHERE venta_id IN (SELECT id FROM ventas WHERE caja_id = :caja)
          GROUP BY metodo'
    );
    $totMetodos->execute([':caja' => $cajaId]);
    $totales = ['efectivo' => 0.0, 'transferencia' => 0.0, 'tarjeta' => 0.0];
    foreach ($totMetodos->fetchAll() as $fila) {
        if (isset($totales[$fila['metodo']])) {
            $totales[$fila['metodo']] = redondear($fila['t']);
        }
    }

    $totEgresos = $pdo->prepare('SELECT COALESCE(SUM(monto),0) AS t FROM egresos WHERE caja_id = :caja');
    $totEgresos->execute([':caja' => $cajaId]);
    $totalEgresos = redondear((string) $totEgresos->fetch()['t']);

    $totVentas = $pdo->prepare('SELECT COUNT(*) AS n FROM ventas WHERE caja_id = :caja');
    $totVentas->execute([':caja' => $cajaId]);
    $totalVentas = (int) $totVentas->fetch()['n'];

    $totalIngresos = redondear($totales['efectivo'] + $totales['transferencia'] + $totales['tarjeta']);
    $esperado = redondear((float) $caja['fondo_inicial'] ?? 0) + $totales['efectivo'] - $totalEgresos;
    $diferencia = $contado !== null ? redondear((string) ($contado - $esperado)) : null;

    // Este UPDATE es el que realmente cierra la caja. Cuando la caja ya existia
    // (la registro /api/ventas al cobrar, H-007) el INSERT IGNORE de arriba no
    // escribe nada, de modo que estado, fecha y usuario de cierre tienen que
    // fijarse aqui y no en el INSERT (H-011 + H-007).
    $updateTotales = $pdo->prepare(
        'UPDATE cajas SET
            estado = \'cerrada\', fecha_cierre = :f_cierre,
            usuario_id_cierre = :u_cierre,
            total_ventas = :t_ventas, total_ingresos = :t_ingresos,
            total_efectivo = :t_efectivo, total_transferencia = :t_transf,
            total_tarjeta = :t_tarjeta, total_egresos = :t_egresos,
            efectivo_esperado = :e_esperado, diferencia = :diferencia
          WHERE id = :id'
    );
    $updateTotales->execute([
        ':f_cierre' => dt($caja['fecha_cierre'] ?? null) ?? date('Y-m-d H:i:s'),
        ':u_cierre' => $caja['usuario_id_cierre'] ?? null,
        ':t_ventas' => $totalVentas,
        ':t_ingresos' => $totalIngresos,
        ':t_efectivo' => $totales['efectivo'],
        ':t_transf' => $totales['transferencia'],
        ':t_tarjeta' => $totales['tarjeta'],
        ':t_egresos' => $totalEgresos,
        ':e_esperado' => $esperado,
        ':diferencia' => $diferencia,
        ':id' => $cajaId,
    ]);
    // Si ninguna fila coincide con el id, la caja nunca se registro: o bien el
    // lote llego sin ella o bien su "numero" choco con el de otro dispositivo.
    // Se reporta en lugar de responder ok silenciosamente (H-011).
    $filasCaja = $updateTotales->rowCount();
    if ($filasCaja === 0) {
        $existe = $pdo->prepare('SELECT COUNT(*) AS n FROM cajas WHERE id = :id');
        $existe->execute([':id' => $cajaId]);
        if ((int) $existe->fetch()['n'] === 0) {
            $pdo->rollBack();
            resp_json([
                'ok' => false,
                'error' => 'colision_caja',
                'detalle' => 'La caja no quedo registrada. Su numero "' . ($caja['numero'] ?? $cajaId)
                    . '" puede pertenecer a otro dispositivo.',
                'caja_id' => $cajaId,
            ], 409);
        }
    }

    $insertCierre = $pdo->prepare(
        "INSERT IGNORE INTO cierres (id, caja_id, usuario_id_cierre, fecha_cierre, resumen)
         VALUES (:id, :caja_id, :usuario, :fecha, :resumen)"
    );
    $insertCierre->execute([
        ':id' => (string) ($b['lote_id'] ?? ('CIERRE-' . $cajaId)),
        ':caja_id' => $cajaId,
        ':usuario' => $caja['usuario_id_cierre'] ?? null,
        ':fecha' => dt($caja['fecha_cierre'] ?? null) ?? date('Y-m-d H:i:s'),
        ':resumen' => json_encode([
            'ventas' => $totalVentas,
            'ingresos' => $totalIngresos,
            'efectivo' => $totales['efectivo'],
            'transferencia' => $totales['transferencia'],
            'tarjeta' => $totales['tarjeta'],
            'egresos' => $totalEgresos,
        ]),
    ]);

    $pdo->commit();

    resp_json([
        'ok' => true,
        'caja_id' => $cajaId,
        'numero' => $caja['numero'] ?? $cajaId,
        'totales' => [
            'ventas' => $totalVentas,
            'ingresos' => $totalIngresos,
            'efectivo' => $totales['efectivo'],
            'transferencia' => $totales['transferencia'],
            'tarjeta' => $totales['tarjeta'],
            'egresos' => $totalEgresos,
            'efectivo_esperado' => $esperado,
            'diferencia' => $diferencia,
        ],
        'nuevos' => $nuevos,
        // Ventas que el servidor no pudo registrar (folio ajeno). La PWA debe
        // reenviarlas o escalarlas; nunca quedar ocultas (H-011).
        'ventas_perdidas' => $ventasPerdidas,
    ]);
}

resp_json(['error' => 'Ruta no encontrada'], 404);
