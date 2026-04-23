<?php
// ═══════════════════════════════════════════════════════
// REGISTRAR UNA LECTURA NUEVA
// ═══════════════════════════════════════════════════════
// POST /TemperaturaWeb/registrar.php
// Parámetros: sensor_id, temperatura, valor_real (opcional)

require_once 'db_config.php';
setCORS();

$conn = getDB();

if (!$conn) {
    echo json_encode(['error' => true, 'message' => 'No se pudo conectar a la base de datos']);
    exit;
}

$sensorId = intval($_POST['sensor_id'] ?? 0);
$temperatura = floatval($_POST['temperatura'] ?? 0);
$valorReal = isset($_POST['valor_real']) ? floatval($_POST['valor_real']) : null;

if ($sensorId <= 0 || $temperatura == 0) {
    echo json_encode(['error' => true, 'message' => 'Faltan parámetros: sensor_id y temperatura']);
    exit;
}

$now = new DateTime();
$fecha = $now->format('Y-m-d');
$hora = $now->format('H:i:s');
$fechaHora = $now->format('Y-m-d H:i:s');

if ($valorReal !== null) {
    $stmt = $conn->prepare("INSERT INTO lecturas (sensor_id, temperatura, valor_real, fecha, hora, fecha_hora) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('iddsss', $sensorId, $temperatura, $valorReal, $fecha, $hora, $fechaHora);
} else {
    $stmt = $conn->prepare("INSERT INTO lecturas (sensor_id, temperatura, fecha, hora, fecha_hora) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('idsss', $sensorId, $temperatura, $fecha, $hora, $fechaHora);
}

$ok = $stmt->execute();
$stmt->close();
$conn->close();

if ($ok) {
    echo json_encode(['success' => true, 'message' => 'Lectura registrada']);
} else {
    echo json_encode(['error' => true, 'message' => 'Error al registrar lectura']);
}
