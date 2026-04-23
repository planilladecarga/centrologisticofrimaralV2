import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PHP_BASE = 'http://192.168.150.31/TemperaturaWeb';

export async function POST(req: NextRequest) {
  try {
    // Reenviar la solicitud al PHP server como proxy
    const body = await req.formData();
    const sensor = body.get('sensor') || '';
    const startDate = body.get('start_date') || '';
    const endDate = body.get('end_date') || '';

    const params = new URLSearchParams();
    params.append('sensor', sensor as string);
    params.append('start_date', startDate as string);
    params.append('end_date', endDate as string);

    const res = await fetch(`${PHP_BASE}/temperatura.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const errorText = await res.text().catch(() => '');
    return NextResponse.json({
      error: `PHP respondió con ${res.status}: ${errorText.substring(0, 200)}`,
      temperatures: [],
      graph_labels: [],
      graph_data: [],
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `No se pudo conectar al servidor (${PHP_BASE}): ${err.message}. Verificá que estés en la red interna.`,
      temperatures: [],
      graph_labels: [],
      graph_data: [],
    });
  }
}
