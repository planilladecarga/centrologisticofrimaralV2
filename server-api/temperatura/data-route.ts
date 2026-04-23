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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const sensor = formData.get('sensor') as string || '';
    const startDate = formData.get('start_date') as string || new Date().toISOString().slice(0, 10);
    const endDate = formData.get('end_date') as string || new Date().toISOString().slice(0, 10);

    if (!sensor) {
      return NextResponse.json({ error: 'Falta sensor', temperatures: [], graph_labels: [], graph_data: [] });
    }

    const conn = await getDB();
    const [tables] = await conn.query("SHOW TABLES");
    const tableNames = (tables as any[]).map((t: any) => Object.values(t)[0] as string);

    const lecturaTable = tableNames.find(t => /lectura|temperatura|temp|dato|registro|log/i.test(t));

    if (!lecturaTable) {
      await conn.end();
      return NextResponse.json({ error: 'No se encontró tabla de lecturas', temperatures: [], graph_labels: [], graph_data: [] });
    }

    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${lecturaTable}\``);
    const colNames = (cols as any[]).map((c: any) => c.Field);

    const sensorCol = colNames.find(c => /sensor|sensor_id|dispositivo|id_sensor/i.test(c)) || colNames.find(c => /nombre|name/i.test(c));
    const tempCol = colNames.find(c => /temperatura|temp|valor|temperature/i.test(c));
    const fechaCol = colNames.find(c => /fecha|date/i.test(c));
    const horaCol = colNames.find(c => /hora|time|hour/i.test(c));
    const valorRealCol = colNames.find(c => /valor_real|real/i.test(c));

    if (!tempCol) {
      await conn.end();
      return NextResponse.json({ error: 'No se encontró columna de temperatura', temperatures: [], graph_labels: [], graph_data: [] });
    }

    let query: string;
    let params: any[] = [];

    if (sensorCol && fechaCol) {
      if (/sensor_id$/i.test(sensorCol)) {
        query = `SELECT l.\`${sensorCol}\` as sensor_id, l.\`${tempCol}\` as temperatura
                 ${valorRealCol ? `, l.\`${valorRealCol}\` as valor_real` : ''}
                 ${horaCol ? `, l.\`${horaCol}\` as hora` : ''}
                 , l.\`${fechaCol}\` as fecha
                 FROM \`${lecturaTable}\` l
                 WHERE l.\`${fechaCol}\` BETWEEN ? AND ?
                 ORDER BY l.\`${fechaCol}\` ${horaCol ? `, l.\`${horaCol}\`` : ''} ASC`;
        params = [startDate, endDate];
      } else {
        query = `SELECT l.\`${sensorCol}\` as sensor, l.\`${tempCol}\` as temperatura
                 ${valorRealCol ? `, l.\`${valorRealCol}\` as valor_real` : ''}
                 ${horaCol ? `, l.\`${horaCol}\` as hora` : ''}
                 , l.\`${fechaCol}\` as fecha
                 FROM \`${lecturaTable}\` l
                 WHERE l.\`${fechaCol}\` BETWEEN ? AND ? AND (l.\`${sensorCol}\` LIKE ?)
                 ORDER BY l.\`${fechaCol}\` ${horaCol ? `, l.\`${horaCol}\`` : ''} ASC`;
        params = [startDate, endDate, `%${sensor}%`];
      }
    } else {
      query = `SELECT * FROM \`${lecturaTable}\` WHERE \`${tempCol}\` IS NOT NULL ORDER BY 1 ASC LIMIT 500`;
    }

    const [rows] = await conn.query(query, params);
    const records = rows as any[];

    const temperatures = records.map(r => ({
      sensor: r.sensor || r.nombre || r.sensor_id || sensor,
      fecha: r.fecha || '',
      hora: r.hora || '',
      temperatura: String(r.temperatura || 0),
      valorreal: r.valor_real ? String(r.valor_real) : undefined,
    }));

    const graphLabels = records.map(r => {
      if (r.hora) { const p = String(r.hora).split(':'); return p[0] + ':' + p[1]; }
      return r.fecha || '';
    });
    const graphData = records.map(r => parseFloat(r.temperatura || 0));
    const temps = graphData.filter(t => !isNaN(t));

    const stats = temps.length > 0 ? {
      min_temp: Math.round(Math.min(...temps) * 100) / 100,
      max_temp: Math.round(Math.max(...temps) * 100) / 100,
      avg_temp: Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 100) / 100,
    } : null;

    await conn.end();
    return NextResponse.json({ stats, temperatures, graph_labels: graphLabels, graph_data: graphData });
  } catch (err: any) {
    return NextResponse.json({
      error: `Error MySQL (${process.env.DB_HOST}): ${err.message}`,
      temperatures: [], graph_labels: [], graph_data: [],
    });
  }
}
