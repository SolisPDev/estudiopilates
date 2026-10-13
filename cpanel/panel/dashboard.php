<?php
declare(strict_types=1);
require __DIR__ . '/guard.php';

$config = require __DIR__ . '/../api/config.php';
$dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']);
$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// Rango por defecto: hoy.
$hoy = date('Y-m-d');
$desde = $_GET['desde'] ?? $hoy;
$hasta = $_GET['hasta'] ?? $hoy;

$stmt = $pdo->prepare(
    'SELECT c.numero, c.fecha_apertura, c.fecha_cierre, c.fondo_inicial,
       c.total_ventas, c.total_ingresos, c.total_efectivo, c.total_transferencia,
       c.total_tarjeta, c.total_egresos, c.efectivo_esperado, c.efectivo_contado,
       c.diferencia
     FROM cajas c
     WHERE c.fecha_cierre IS NOT NULL AND DATE(c.fecha_cierre) BETWEEN :desde AND :hasta
     ORDER BY c.fecha_cierre DESC'
);
$stmt->execute([':desde' => $desde, ':hasta' => $hasta]);
$cajas = $stmt->fetchAll();

$tot = ['ventas' => 0, 'ingresos' => 0.0, 'efectivo' => 0.0, 'transf' => 0.0, 'tarjeta' => 0.0, 'egresos' => 0.0, 'esperado' => 0.0, 'contado' => 0.0, 'dif' => 0.0];
foreach ($cajas as $c) {
    $tot['ventas'] += (int) $c['total_ventas'];
    $tot['ingresos'] += (float) $c['total_ingresos'];
    $tot['efectivo'] += (float) $c['total_efectivo'];
    $tot['transf'] += (float) $c['total_transferencia'];
    $tot['tarjeta'] += (float) $c['total_tarjeta'];
    $tot['egresos'] += (float) $c['total_egresos'];
    $tot['esperado'] += (float) $c['efectivo_esperado'];
    $tot['contado'] += (float) ($c['efectivo_contado'] ?? 0);
    $tot['dif'] += (float) ($c['diferencia'] ?? 0);
}

function fmt(float $v): string
{
    return '$' . number_format($v, 2);
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte de cortes · Estudio Pilates</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="topbar">
    <div class="titulo">Cortes de caja</div>
    <nav>
      <a href="dashboard.php">Cortes</a>
      <a href="stock.php">Stock</a>
      <a href="logout.php">Salir (<?= htmlspecialchars($_SESSION['nombre'] ?? '') ?>)</a>
    </nav>
  </div>
  <div class="wrap">
    <div class="card">
      <form method="get" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label>Desde <input type="date" name="desde" value="<?= htmlspecialchars($desde) ?>"></label>
        <label>Hasta <input type="date" name="hasta" value="<?= htmlspecialchars($hasta) ?>"></label>
        <button class="btn" type="submit">Filtrar</button>
        <button class="btn" type="button" onclick="window.print()" style="background:#334155;">Imprimir</button>
      </form>
    </div>

    <?php if (!$cajas): ?>
      <div class="card">Sin cierres de turno en el rango seleccionado.</div>
    <?php else: ?>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Caja</th><th>Cierre</th><th>Ventas</th><th>Ingresos</th>
              <th>Efectivo</th><th>Transferencia</th><th>Tarjeta</th><th>Egresos</th>
              <th>Esperado</th><th>Contado</th><th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <?php foreach ($cajas as $c): ?>
              <tr>
                <td><?= htmlspecialchars($c['numero']) ?></td>
                <td><?= htmlspecialchars((string) $c['fecha_cierre']) ?></td>
                <td><?= (int) $c['total_ventas'] ?></td>
                <td><?= fmt((float) $c['total_ingresos']) ?></td>
                <td><?= fmt((float) $c['total_efectivo']) ?></td>
                <td><?= fmt((float) $c['total_transferencia']) ?></td>
                <td><?= fmt((float) $c['total_tarjeta']) ?></td>
                <td><?= fmt((float) $c['total_egresos']) ?></td>
                <td><?= fmt((float) $c['efectivo_esperado']) ?></td>
                <td><?= $c['efectivo_contado'] !== null ? fmt((float) $c['efectivo_contado']) : '—' ?></td>
                <td>
                  <?php $dif = (float) $c['diferencia']; ?>
                  <span class="tag <?= $dif === 0.0 ? 'ok' : 'alert' ?>"><?= fmt($dif) ?></span>
                </td>
              </tr>
            <?php endforeach; ?>
            <tr class="total">
              <td>TOTALES</td><td></td>
              <td><?= $tot['ventas'] ?></td>
              <td><?= fmt($tot['ingresos']) ?></td>
              <td><?= fmt($tot['efectivo']) ?></td>
              <td><?= fmt($tot['transf']) ?></td>
              <td><?= fmt($tot['tarjeta']) ?></td>
              <td><?= fmt($tot['egresos']) ?></td>
              <td><?= fmt($tot['esperado']) ?></td>
              <td><?= fmt($tot['contado']) ?></td>
              <td><span class="tag <?= $tot['dif'] === 0.0 ? 'ok' : 'alert' ?>"><?= fmt($tot['dif']) ?></span></td>
            </tr>
          </tbody>
        </table>
      </div>
    <?php endif; ?>
  </div>
</body>
</html>