<?php
// Copia este archivo como config.php y rellena con los datos reales.
return [
    'db_host' => 'localhost',
    'db_name' => 'tu_usuario_pilates',
    'db_user' => 'tu_usuario_pilates',
    'db_pass' => 'cambiar',
    // Token compartido: debe coincidir con el de la pestaña Sync de la PWA.
    // Genera uno largo:  php -r "echo bin2hex(random_bytes(24));"
    'api_token' => 'cambiar-token-largo-aleatorio',
    // Usado por el panel de reportes (dashboard).
    'directorio_api' => __DIR__ . '/..',
];