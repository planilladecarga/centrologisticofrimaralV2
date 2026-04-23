<?php
// ═══════════════════════════════════════════════════════
// CONFIGURACION BASE DE DATOS
// ═══════════════════════════════════════════════════════
// Modificá estos valores según tu servidor MySQL

$DB_HOST = 'localhost';
$DB_PORT = 3306;
$DB_USER = 'root';
$DB_PASS = '';          // ← Poné la contraseña aquí si tiene
$DB_NAME = 'temperatura'; // ← Nombre de la base de datos

// Intentar conexión
function getDB() {
    global $DB_HOST, $DB_PORT, $DB_USER, $DB_PASS, $DB_NAME;

    $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT);

    if ($conn->connect_error) {
        return null;
    }

    $conn->set_charset('utf8mb4');
    return $conn;
}

// Headers CORS para que la app pueda consumir desde cualquier origen
function setCORS() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Content-Type: application/json; charset=utf-8');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
