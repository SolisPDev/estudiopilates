<?php
/** PDO factory (conexion MySQL del hosting cPanel). */
final class Database
{
    public static function pdo(): PDO
    {
        $cfg = require __DIR__ . '/../config.php';
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            $cfg['db_host'],
            $cfg['db_name']
        );
        return new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}