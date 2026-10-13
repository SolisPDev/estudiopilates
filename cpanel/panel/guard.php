<?php
declare(strict_types=1);

/** Resguardo de sesión para las páginas del panel. */
require_logged();

function require_logged(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (empty($_SESSION['uid'])) {
        header('Location: index.php');
        exit;
    }
}

function require_admin(): void
{
    require_logged();
    if (($_SESSION['rol'] ?? '') !== 'admin') {
        http_response_code(403);
        exit('Acceso restringido a administradores.');
    }
}