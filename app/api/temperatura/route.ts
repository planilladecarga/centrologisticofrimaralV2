import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch('http://192.168.150.31/TemperaturaWeb/temperatura.php', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Servidor no disponible' }, { status: 502 });
  }
}
