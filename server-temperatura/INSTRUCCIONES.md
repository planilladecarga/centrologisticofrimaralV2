# Servidor de Temperatura - Instrucciones de Instalación

## En el servidor 192.168.150.31

### Paso 1: Copiar los archivos PHP

Copiá todos los archivos de esta carpeta al servidor:

```bash
scp *.php root@192.168.150.31:/var/www/html/TemperaturaWeb/
```

O manualmente:
- `db_config.php`
- `sensores.php`
- `temperatura.php`
- `registrar.php`
- `install.php`

### Paso 2: Verificar PHP y MySQL

En el servidor, verificá que PHP esté instalado:

```bash
php -v
```

Si no está instalado:

```bash
apt update
apt install php php-mysql libapache2-mod-php -y
systemctl restart apache2
```

Verificar MySQL:

```bash
mysql -u root -p -e "SELECT 1"
```

### Paso 3: Ejecutar el instalador

Abrí en el navegador:

```
http://192.168.150.31/TemperaturaWeb/install.php
```

Completá los datos:
- Servidor: `localhost`
- Puerto: `3306`
- Usuario: `root`
- Contraseña: (la de MySQL)
- Base de datos: `temperatura`

Hacé clic en **"Instalar base de datos"**.

### Paso 4: Borrar el instalador

Por seguridad, después de instalar:

```bash
rm /var/www/html/TemperaturaWeb/install.php
```

### Paso 5: Verificar que funciona

Abrí en el navegador:

```
http://192.168.150.31/TemperaturaWeb/sensores.php
```

Debería mostrar algo como:
```json
{"sensors":["Camara Frigorifica 1 - Congelados",...]}
```

---

## Estructura de la base de datos

### Tabla `sensores`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INT | ID autoincremental |
| nombre | VARCHAR(200) | Nombre del sensor |
| ubicacion | VARCHAR(200) | Ubicación física |
| activo | TINYINT | 1 = activo, 0 = inactivo |

### Tabla `lecturas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | BIGINT | ID autoincremental |
| sensor_id | INT | FK a sensores |
| temperatura | DECIMAL(6,2) | Temperatura leída |
| valor_real | DECIMAL(6,2) | Valor real (opcional) |
| fecha | DATE | Fecha de la lectura |
| hora | TIME | Hora de la lectura |
| fecha_hora | DATETIME | Timestamp completo |

---

## Endpoints disponibles

### GET/POST `/TemperaturaWeb/sensores.php`
Devuelve la lista de sensores activos.

### POST `/TemperaturaWeb/temperatura.php`
Parámetros:
- `sensor` - Nombre del sensor
- `start_date` - Fecha desde (YYYY-MM-DD)
- `end_date` - Fecha hasta (YYYY-MM-DD)

### POST `/TemperaturaWeb/registrar.php`
Parámetros:
- `sensor_id` - ID del sensor
- `temperatura` - Valor de temperatura
- `valor_real` - Valor real (opcional)
