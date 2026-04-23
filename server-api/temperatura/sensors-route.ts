import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PHP_BASE = 'http://192.168.150.31/TemperaturaWeb';

export async function GET() {
  try {
    // Intentar obtener sensores del servidor PHP
    const res = await fetch(`${PHP_BASE}/sensores.php`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: true, message: `PHP respondió con ${res.status}`, sensors: [] });
  } catch (err: any) {
    return NextResponse.json({
      error: true,
      message: `No se pudo conectar al servidor de temperatura (${PHP_BASE}): ${err.message}. Verificá que estés en la red interna de la empresa.`,
      sensors: [],
    });
  }
}
