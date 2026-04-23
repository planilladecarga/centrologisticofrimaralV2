<?php
// ═══════════════════════════════════════════════════════
// INSTALADOR AUTOMÁTICO
// ═══════════════════════════════════════════════════════
// Este archivo crea la base de datos y las tablas necesarias.
// Ejecutá UNA SOLA VEZ desde el navegador:
// http://192.168.150.31/TemperaturaWeb/install.php
//
// DESPUES de ejecutar, BORRÁ este archivo del servidor por seguridad.

require_once 'db_config.php';

setCORS();

// Si viene por POST con datos, procesar la instalación
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    $dbHost = $input['db_host'] ?? 'localhost';
    $dbPort = intval($input['db_port'] ?? 3306);
    $dbUser = $input['db_user'] ?? 'root';
    $dbPass = $input['db_pass'] ?? '';
    $dbName = $input['db_name'] ?? 'temperatura';

    $conn = new mysqli($dbHost, $dbUser, $dbPass, '', $dbPort);

    if ($conn->connect_error) {
        echo json_encode(['error' => true, 'message' => 'Error de conexión: ' . $conn->connect_error]);
        exit;
    }

    // Crear base de datos
    $conn->query("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $conn->select_db($dbName);

    // Crear tabla de sensores
    $conn->query("CREATE TABLE IF NOT EXISTS `sensores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `nombre` VARCHAR(200) NOT NULL,
        `ubicacion` VARCHAR(200) DEFAULT '',
        `activo` TINYINT(1) DEFAULT 1,
        `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Crear tabla de lecturas
    $conn->query("CREATE TABLE IF NOT EXISTS `lecturas` (
        `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
        `sensor_id` INT NOT NULL,
        `temperatura` DECIMAL(6,2) NOT NULL,
        `valor_real` DECIMAL(6,2) DEFAULT NULL,
        `fecha` DATE NOT NULL,
        `hora` TIME NOT NULL,
        `fecha_hora` DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (`sensor_id`) REFERENCES `sensores`(`id`) ON DELETE CASCADE,
        INDEX `idx_sensor_fecha` (`sensor_id`, `fecha`),
        INDEX `idx_fecha_hora` (`fecha_hora`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Insertar sensores de ejemplo si la tabla está vacía
    $result = $conn->query("SELECT COUNT(*) as total FROM sensores");
    $row = $result->fetch_assoc();
    if ($row['total'] == 0) {
        $conn->query("INSERT INTO `sensores` (`nombre`, `ubicacion`) VALUES
            ('Camara Frigorifica 1 - Congelados', 'Cámara 1'),
            ('Camara Frigorifica 2 - Refrigerados', 'Cámara 2'),
            ('Camara Frigorifica 3 - Lacteos', 'Cámara 3'),
            ('Camara Frigorifica 4 - Carnes', 'Cámara 4')
        ");
    }

    // Insertar datos de ejemplo (últimas 24 horas) si no hay datos
    $result = $conn->query("SELECT COUNT(*) as total FROM lecturas");
    $row = $result->fetch_assoc();
    if ($row['total'] == 0) {
        $sensores = $conn->query("SELECT id, nombre FROM sensores");
        $bases = [
            'Congelados' => -20.5,
            'Refrigerados' => 2.0,
            'Lacteos' => 4.0,
            'Carnes' => -1.5,
        ];
        $now = new DateTime();
        $interval30min = new DateInterval('PT30M');

        while ($sensor = $sensores->fetch_assoc()) {
            $base = -20.5;
            foreach ($bases as $key => $val) {
                if (stripos($sensor['nombre'], $key) !== false) {
                    $base = $val;
                    break;
                }
            }

            for ($i = 47; $i >= 0; $i--) {
                $readingTime = clone $now;
                $readingTime->sub(new DateInterval("PT" . ($i * 30) . "M"));

                $sinusoidal = sin(($i * 0.5 / 6) * M_PI * 2) * 1.8;
                $noise = (mt_rand() - mt_rand()) / mt_getrandmax() * 1.2;

                $temp = round($base + $sinusoidal + $noise, 2);
                $fecha = $readingTime->format('Y-m-d');
                $hora = $readingTime->format('H:i:s');

                $conn->query("INSERT INTO `lecturas` (`sensor_id`, `temperatura`, `fecha`, `hora`, `fecha_hora`)
                    VALUES ({$sensor['id']}, $temp, '$fecha', '$hora', '$fecha $hora')");
            }
        }
    }

    // Actualizar db_config.php con los datos proporcionados
    $configContent = "<?php
// ═══════════════════════════════════════════════════════
// CONFIGURACION BASE DE DATOS
// ═══════════════════════════════════════════════════════

\$DB_HOST = '$dbHost';
\$DB_PORT = $dbPort;
\$DB_USER = '$dbUser';
\$DB_PASS = '$dbPass';
\$DB_NAME = '$dbName';

function getDB() {
    global \$DB_HOST, \$DB_PORT, \$DB_USER, \$DB_PASS, \$DB_NAME;
    \$conn = new mysqli(\$DB_HOST, \$DB_USER, \$DB_PASS, \$DB_NAME, \$DB_PORT);
    if (\$conn->connect_error) return null;
    \$conn->set_charset('utf8mb4');
    return \$conn;
}

function setCORS() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Content-Type: application/json; charset=utf-8');
    if (\$_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
}
";
    file_put_contents('db_config.php', $configContent);

    echo json_encode([
        'success' => true,
        'message' => 'Base de datos creada correctamente con tablas, sensores y datos de ejemplo.'
    ]);
    $conn->close();
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Instalador - Sistema de Temperaturas</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #171717; border: 1px solid #333; border-radius: 12px; padding: 40px; max-width: 480px; width: 90%; }
        h1 { font-size: 20px; font-family: monospace; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 8px; color: #60a5fa; }
        p.desc { font-size: 13px; color: #888; margin-bottom: 30px; line-height: 1.5; }
        label { display: block; font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 6px; margin-top: 16px; }
        input { width: 100%; padding: 10px 14px; background: #0a0a0a; border: 1px solid #444; border-radius: 6px; color: #e5e5e5; font-size: 14px; }
        input:focus { outline: none; border-color: #60a5fa; }
        button { width: 100%; margin-top: 28px; padding: 14px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 13px; font-family: monospace; text-transform: uppercase; letter-spacing: 2px; cursor: pointer; }
        button:hover { background: #1d4ed8; }
        button:disabled { background: #333; color: #666; cursor: not-allowed; }
        .result { margin-top: 20px; padding: 14px; border-radius: 6px; font-size: 13px; display: none; }
        .result.ok { display: block; background: #065f46; border: 1px solid #059669; color: #6ee7b7; }
        .result.err { display: block; background: #7f1d1d; border: 1px solid #dc2626; color: #fca5a5; }
        .warn { font-size: 11px; color: #f59e0b; margin-top: 20px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="card">
        <h1>TemperaturaWeb</h1>
        <p class="desc">Instalador automático. Creá la base de datos y tablas para el sistema de monitoreo de temperaturas.</p>

        <label>Servidor MySQL</label>
        <input type="text" id="db_host" value="localhost" placeholder="localhost">

        <label>Puerto</label>
        <input type="number" id="db_port" value="3306" placeholder="3306">

        <label>Usuario</label>
        <input type="text" id="db_user" value="root" placeholder="root">

        <label>Contraseña</label>
        <input type="password" id="db_pass" placeholder="(dejar vacío si no tiene)">

        <label>Nombre de la base de datos</label>
        <input type="text" id="db_name" value="temperatura" placeholder="temperatura">

        <button id="btn_install" onclick="install()">Instalar base de datos</button>

        <div id="result" class="result"></div>

        <p class="warn">⚠ Después de instalar, borrá este archivo (install.php) del servidor por seguridad.</p>
    </div>

    <script>
    function install() {
        const btn = document.getElementById('btn_install');
        const result = document.getElementById('result');
        btn.disabled = true;
        btn.textContent = 'Instalando...';
        result.className = 'result';

        fetch('install.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_host: document.getElementById('db_host').value,
                db_port: parseInt(document.getElementById('db_port').value),
                db_user: document.getElementById('db_user').value,
                db_pass: document.getElementById('db_pass').value,
                db_name: document.getElementById('db_name').value,
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                result.className = 'result err';
                result.textContent = 'Error: ' + data.message;
                btn.disabled = false;
                btn.textContent = 'Reintentar';
            } else {
                result.className = 'result ok';
                result.textContent = '✓ ' + data.message;
                btn.textContent = 'Instalado correctamente';
            }
        })
        .catch(err => {
            result.className = 'result err';
            result.textContent = 'Error de conexión: ' + err.message;
            btn.disabled = false;
            btn.textContent = 'Reintentar';
        });
    }
    </script>
</body>
</html>
