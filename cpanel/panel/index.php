<?php
declare(strict_types=1);

// Login del panel de reportes (dueño / admin).
session_start();

$config = require __DIR__ . '/../api/config.php';

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $pass = $_POST['pass'] ?? '';

    if ($email === '' || $pass === '') {
        $error = 'Captura correo y contraseña.';
    } else {
        try {
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']);
            $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1');
            $stmt->execute([$email]);
            $usuario = $stmt->fetch();

            if ($usuario && password_verify($pass, $usuario['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['uid'] = (int) $usuario['id'];
                $_SESSION['nombre'] = $usuario['nombre'];
                $_SESSION['rol'] = $usuario['rol'];
                header('Location: dashboard.php');
                exit;
            }
            $error = 'Credenciales inválidas.';
        } catch (PDOException $ex) {
            $error = 'Error conectando a la base de datos: ' . htmlspecialchars($ex->getMessage());
        }
    }
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acceso · Estudio Pilates &amp; Barre</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="wrap" style="max-width:380px;margin-top:10vh;">
    <div class="card">
      <h2>Estudio Pilates &amp; Barre</h2>
      <p style="color:#64748b;font-size:14px;">Panel de reportes operativos</p>
      <?php if ($error !== ''): ?>
        <p style="background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:8px;font-size:14px;"><?= htmlspecialchars($error) ?></p>
      <?php endif; ?>
      <form method="post">
        <p><input type="email" name="email" placeholder="Correo" required style="width:100%;"></p>
        <p><input type="password" name="pass" placeholder="Contraseña" required style="width:100%;"></p>
        <p><button type="submit" class="btn" style="width:100%;">Entrar</button></p>
      </form>
      <p style="font-size:12px;color:#94a3b8;">Usuarios seed: admin@estudio.mx / recepcion@estudio.mx — cambiar al primer ingreso.</p>
    </div>
  </div>
</body>
</html>