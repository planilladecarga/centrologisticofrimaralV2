<?php
// ═══════════════════════════════════════════════════════
// OBTENER DATOS DE TEMPERATURA
// ═══════════════════════════════════════════════════════
// POST /TemperaturaWeb/temperatura.php
// Parámetros: sensor, start_date, end_date

require_once 'db_config.php';
setCORS();

$conn = getDB();

if (!$conn) {
    echo json_encode([
        'error' => 'No se pudo conectar a la base de datos. Verificá db_config.php',
        'temperatures' => [],
        'graph_labels' => [],
        'graph_data' => [],
    ]);
    exit;
}

// Leer parámetros
$sensor = $_POST['sensor'] ?? '';
$start_date = $_POST['start_date'] ?? date('Y-m-d');
$end_date = $_POST['end_date'] ?? date('Y-m-d');

if (empty($sensor)) {
    echo json_encode([
        'error' => 'Falta el parámetro "sensor"',
        'temperatures' => [],
        'graph_labels' => [],
        'graph_data' => [],
    ]);
    exit;
}

// Buscar sensor por nombre
$stmt = $conn->prepare("SELECT id, nombre FROM sensores WHERE nombre = ? AND activo = 1 LIMIT 1");
$stmt->bind_param('s', $sensor);
$stmt->execute();
$sensorResult = $stmt->get_result();

if ($sensorResult->num_rows === 0) {
    // Si no existe, buscar por coincidencia parcial
    $like = '%' . $sensor . '%';
    $stmt2 = $conn->prepare("SELECT id, nombre FROM sensores WHERE nombre LIKE ? AND activo = 1 LIMIT 1");
    $stmt2->bind_param('s', $like);
    $stmt2->execute();
    $sensorResult = $stmt2->get_result();
    $stmt2->close();

    if ($sensorResult->num_rows === 0) {
        echo json_encode([
            'error' => "Sensor '$sensor' no encontrado en la base de datos",
            'temperatures' => [],
            'graph_labels' => [],
            'graph_data' => [],
        ]);
        $conn->close();
        exit;
    }
}

$sensorRow = $sensorResult->fetch_assoc();
$sensorId = $sensorRow['id'];
$sensorName = $sensorRow['nombre'];
$stmt->close();

// Obtener lecturas en el rango de fechas
$stmt = $conn->prepare("
    SELECT
        s.nombre as sensor,
        l.temperatura,
        l.valor_real,
        l.fecha,
        l.hora
    FROM lecturas l
    JOIN sensores s ON l.sensor_id = s.id
    WHERE l.sensor_id = ?
      AND l.fecha BETWEEN ? AND ?
    ORDER BY l.fecha_hora ASC
");
$stmt->bind_param('iss', $sensorId, $start_date, $end_date);
$stmt->execute();
$result = $stmt->get_result();

$temperatures = [];
$graphLabels = [];
$graphData = [];
$temps = [];

while ($row = $result->fetch_assoc()) {
    $temperatures[] = [
        'sensor' => $row['sensor'],
        'fecha' => $row['fecha'],
        'hora' => $row['hora'],
        'temperatura' => $row['temperatura'],
        'valorreal' => $row['valor_real'],
    ];

    // Solo agregar al gráfico si es la última fecha seleccionada
    if ($row['fecha'] === $end_date || count($result->fetch_all()) <= 200) {
        $horaParts = explode(':', $row['hora']);
        $graphLabels[] = $horaParts[0] . ':' . $horaParts[1];
        $graphData[] = floatval($row['temperatura']);
        $temps[] = floatval($row['temperatura']);
    }
}

// Reset y obtener todos los datos para el gráfico
$graphLabels = [];
$graphData = [];
$temps = [];
$result->data_seek(0);
while ($row = $result->fetch_assoc()) {
    $horaParts = explode(':', $row['hora']);
    $graphLabels[] = $horaParts[0] . ':' . $horaParts[1];
    $graphData[] = floatval($row['temperatura']);
    $temps[] = floatval($row['temperatura']);
}

// Calcular estadísticas
$stats = null;
if (!empty($temps)) {
    $stats = [
        'min_temp' => round(min($temps), 2),
        'max_temp' => round(max($temps), 2),
        'avg_temp' => round(array_sum($temps) / count($temps), 2),
    ];
}

$stmt->close();
$conn->close();

echo json_encode([
    'stats' => $stats,
    'temperatures' => $temperatures,
    'graph_labels' => $graphLabels,
    'graph_data' => $graphData,
]);
