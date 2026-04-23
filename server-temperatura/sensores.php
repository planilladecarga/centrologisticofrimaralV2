<?php
// ═══════════════════════════════════════════════════════
// OBTENER LISTA DE SENSORES
// ═══════════════════════════════════════════════════════
// GET /TemperaturaWeb/sensores.php
// POST /TemperaturaWeb/sensores.php (para compatibilidad)

require_once 'db_config.php';
setCORS();

$conn = getDB();

if (!$conn) {
    echo json_encode([
        'error' => true,
        'message' => 'No se pudo conectar a la base de datos. Verificá db_config.php',
        'sensors' => []
    ]);
    exit;
}

// Obtener sensores activos
$result = $conn->query("SELECT id, nombre, ubicacion FROM sensores WHERE activo = 1 ORDER BY id");

$sensors = [];
while ($row = $result->fetch_assoc()) {
    $sensors[] = $row['nombre'];
}

// Si no hay sensores en la BD, devolver lista por defecto
if (empty($sensors)) {
    $sensors = [
        'Camara Frigorifica 1 - Congelados',
        'Camara Frigorifica 2 - Refrigerados',
        'Camara Frigorifica 3 - Lacteos',
        'Camara Frigorifica 4 - Carnes',
    ];
}

echo json_encode(['sensors' => $sensors]);

$conn->close();
