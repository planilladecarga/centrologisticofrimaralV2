import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getDB() {
  const mysql = await import('mysql2/promise');
  return mysql.createConnection({
    host: process.env.DB_HOST || '192.168.150.31',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'temperatura',
    connectTimeout: 5000,
  });
}

export async function GET() {
  try {
    const conn = await getDB();

    const [tables] = await conn.query("SHOW TABLES");
    const tableNames = (tables as any[]).map((t: any) => Object.values(t)[0] as string);

    let sensorTable = tableNames.find(t => /sensor/i.test(t));

    if (!sensorTable) {
      const lecturaTable = tableNames.find(t => /lectura|temperatura|temp|dato/i.test(t));
      if (lecturaTable) {
        const [rows] = await conn.query(`SELECT DISTINCT sensor FROM \`${lecturaTable}\` LIMIT 50`);
        const sensors = (rows as any[]).map((r: any) => r.sensor || r.nombre || r.dispositivo || '').filter(Boolean);
        await conn.end();
        return NextResponse.json({ sensors });
      }
      await conn.end();
      return NextResponse.json({ error: true, message: 'No se encontraron tablas de temperatura', sensors: [] });
    }

    const [rows] = await conn.query(`SELECT nombre, ubicacion FROM \`${sensorTable}\` WHERE activo = 1 ORDER BY id`);
    let sensors = (rows as any[]).map((r: any) => r.nombre).filter(Boolean);

    if (sensors.length === 0) {
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${sensorTable}\``);
      const colNames = (cols as any[]).map((c: any) => c.Field);
      const nameCol = colNames.find(c => /nombre|name|sensor|descripcion|ubicacion|dispositivo/i.test(c)) || colNames[0];
      const [rows2] = await conn.query(`SELECT \`${nameCol}\` as nombre FROM \`${sensorTable}\` LIMIT 50`);
      sensors = (rows2 as any[]).map((r: any) => r.nombre).filter(Boolean);
    }

    await conn.end();

    if (sensors.length === 0) {
      sensors = ['Camara Frigorifica 1 - Congelados', 'Camara Frigorifica 2 - Refrigerados', 'Camara Frigorifica 3 - Lacteos', 'Camara Frigorifica 4 - Carnes'];
    }

    return NextResponse.json({ sensors });
  } catch (err: any) {
    return NextResponse.json({
      error: true,
      message: `No se pudo conectar a MySQL (${process.env.DB_HOST}): ${err.message}`,
      sensors: [],
    });
  }
}
