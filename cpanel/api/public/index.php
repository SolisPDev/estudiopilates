<?php

declare(strict_types=1);

// API REST del sistema POS (PHP puro + PDO, sin dependencias externas).
// Publicar este directorio (cpanel/api/public) como raiz de la app en cPanel.
//
// Endpoints:
//   GET  /api/health      -> verificacion de salud
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

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rtrim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
if ($path === '') {
    $path = '/';
}

if ($metodo === 'GET' && $path === '/api/health') {
    resp_json(['ok' => true, 'time' => date('c')]);
}

if ($metodo === 'POST' && $path === '/api/cierres') {
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

    $upsertCaja = $pdo->prepare(
        "INSERT INTO cajas
            (id, numero, usuario_id_apertura, usuario_id_cierre, fondo_inicial,
             fecha_apertura, fecha_cierre, total_ventas, total_ingresos, total_efectivo,
             total_transferencia, total_tarjeta, total_egresos, efectivo_esperado,
             efectivo_contado, diferencia, estado)
         VALUES
            (:id, :numero, :u_apertura, :u_cierre, :fondo, :f_apertura, :f_cierre,
             :t_ventas, :t_ingresos, :t_efectivo, :t_transf, :t_tarjeta, :t_egresos,
             :e_esperado, :e_contado, :diferencia, 'cerrada')
         ON DUPLICATE KEY UPDATE
            fecha_cierre = VALUES(fecha_cierre),
            usuario_id_cierre = VALUES(usuario_id_cierre),
            total_ventas = VALUES(total_ventas),
            total_ingresos = VALUES(total_ingresos),
            total_efectivo = VALUES(total_efectivo),
            total_transferencia = VALUES(total_transferencia),
            total_tarjeta = VALUES(total_tarjeta),
            total_egresos = VALUES(total_egresos),
            efectivo_esperado = VALUES(efectivo_esperado),
            efectivo_contado = VALUES(efectivo_contado),
            diferencia = VALUES(diferencia),
            estado = 'cerrada'"
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
    $insertEgreso = $pdo->prepare(
        "INSERT IGNORE INTO egresos
            (id, caja_id, usuario_id, categoria, concepto, monto, responsable, fecha)
         VALUES
            (:id, :caja_id, :usuario_id, :categoria, :concepto, :monto, :responsable, :fecha)"
    );
    $insertMov = $pdo->prepare(
        "INSERT IGNORE INTO movimientos_inventario
            (id, producto_id, tipo, cantidad, referencia, fecha)
         VALUES
            (:id, :producto_id, :tipo, :cantidad, :referencia, :fecha)"
    );

    $verificaProd = $pdo->prepare('SELECT id, stock FROM productos WHERE id = :id FOR UPDATE');
    $updateStock = $pdo->prepare('UPDATE productos SET stock = :stock WHERE id = :id AND stock <> :stock');

    $nuevos = ['caja' => true, 'ventas' => 0, 'egresos' => 0, 'movimientos' => 0];

    foreach ($ventas as $v) {
        $okVenta = $insertVenta->execute([
            ':id' => (string) ($v['id'] ?? ''),
            ':folio' => (string) ($v['folio'] ?? ('V-' . substr((string) ($v['id'] ?? ''), 0, 8))),
            ':caja_id' => $cajaId,
            ':usuario_id' => $v['usuario_id'] ?? null,
            ':cliente' => $v['cliente'] ?? null,
            ':fecha' => dt($v['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
            ':subtotal' => redondear($v['subtotal'] ?? 0),
            ':impuesto' => redondear($v['impuesto'] ?? 0),
            ':total' => redondear($v['total'] ?? 0),
        ]);
        if ($okVenta && $insertVenta->rowCount() > 0) {
            $nuevos['ventas']++;
        }
        foreach (($v['items'] ?? []) as $i) {
            $insertItem->execute([
                ':id' => (string) ($i['id'] ?? ''),
                ':venta_id' => (string) ($v['id'] ?? ''),
                ':producto_id' => $i['producto_id'] ?? null,
                ':nombre' => (string) ($i['nombre'] ?? 'Producto'),
                ':cantidad' => $i['cantidad'] ?? 1,
                ':precio' => redondear($i['precio_unitario'] ?? 0),
                ':subtotal' => redondear($i['subtotal'] ?? 0),
            ]);
        }
        foreach (($v['pagos'] ?? []) as $p) {
            $insertPago->execute([
                ':id' => (string) ($p['id'] ?? ''),
                ':venta_id' => (string) ($v['id'] ?? ''),
                ':metodo' => (string) ($p['metodo'] ?? 'efectivo'),
                ':monto' => redondear($p['monto'] ?? 0),
                ':referencia' => $p['referencia'] ?? null,
                ':fecha' => dt($p['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
            ]);
        }
    }

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

    foreach ($movimientos as $m) {
        if ($insertMov->execute([
            ':id' => (string) ($m['id'] ?? ''),
            ':producto_id' => $m['producto_id'] ?? 0,
            ':tipo' => (string) ($m['tipo'] ?? 'venta'),
            ':cantidad' => redondear($m['cantidad'] ?? 0),
            ':referencia' => $m['referencia'] ?? null,
            ':fecha' => dt($m['fecha'] ?? null) ?? date('Y-m-d H:i:s'),
        ]) && $insertMov->rowCount() > 0) {
            $nuevos['movimientos']++;
            $pid = (int) ($m['producto_id'] ?? 0);
            $verificaProd->execute([':id' => $pid]);
            $prod = $verificaProd->fetch();
            if ($prod) {
                $nuevoStock = max(0.0, (float) $prod['stock'] + (float) $m['cantidad']);
                $updateStock->execute([':stock' => $nuevoStock, ':id' => $pid]);
            }
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

    $updateTotales = $pdo->prepare(
        'UPDATE cajas SET
            total_ventas = :t_ventas, total_ingresos = :t_ingresos,
            total_efectivo = :t_efectivo, total_transferencia = :t_transf,
            total_tarjeta = :t_tarjeta, total_egresos = :t_egresos,
            efectivo_esperado = :e_esperado, diferencia = :diferencia
          WHERE id = :id'
    );
    $updateTotales->execute([
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
    ]);
}

resp_json(['error' => 'Ruta no encontrada'], 404);