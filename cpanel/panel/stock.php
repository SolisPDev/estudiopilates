<?php
declare(strict_types=1);
require __DIR__ . '/guard.php';
require_admin(); // el panel de reportes es solo para el duenio (H-010)

require __DIR__ . '/../api/src/Database.php';
$pdo = Database::pdo(); // una sola fabrica de conexion (H-017)

$productos = $pdo
    ->query("SELECT * FROM productos WHERE tipo = 'articulo' ORDER BY nombre")
    ->fetchAll();
$bajos = array_filter($productos, fn ($p) => (float) $p['stock'] <= (float) $p['stock_minimo']);

function fmt2(float $v): string
{
    return number_format($v, 2);
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inventario · Estudio Pilates</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="topbar">
    <div class="titulo">Control de inventario</div>
    <nav>
      <a href="dashboard.php">Cortes</a>
      <a href="stock.php">Stock</a>
      <a href="logout.php">Salir</a>
    </nav>
  </div>
  <div class="wrap">
    <?php if ($bajos): ?>
      <div class="card" style="border-left:4px solid #ef4444;">
        <b>Alerta:</b> <?= count($bajos) ?> producto(s) por agotarse.
        <table class="detalle">
          <?php foreach ($bajos as $p): ?>
            <tr>
              <td><?= htmlspecialchars($p['nombre']) ?></td>
              <td style="text-align:right;">Stock: <b><?= fmt2((float) $p['stock']) ?></b> / Mínimo: <?= fmt2((float) $p['stock_minimo']) ?></td>
            </tr>
          <?php endforeach; ?>
        </table>
      </div>
    <?php endif; ?>

    <div class="card">
      <table>
        <thead>
          <tr><th>Producto</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Precio</th></tr>
        </thead>
        <tbody>
          <?php foreach ($productos as $p):
            $estado = (float) $p['stock'] <= (float) $p['stock_minimo'] ? 'alert' : 'ok'; ?>
            <tr>
              <td><?= htmlspecialchars($p['nombre']) ?></td>
              <td><?= htmlspecialchars($p['categoria']) ?></td>
              <td><span class="tag <?= $estado ?>"><?= fmt2((float) $p['stock']) ?></span></td>
              <td><?= fmt2((float) $p['stock_minimo']) ?></td>
              <td><?= fmt2((float) $p['precio_venta']) ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>