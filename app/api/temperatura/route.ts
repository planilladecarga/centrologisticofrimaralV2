import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const targetUrl = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
  try {
    const res = await fetch(targetUrl, { cache: 'no-store' });
    const html = await res.text();
    const baseUrl = 'http://192.168.150.31/TemperaturaWeb/';
    const fixedHtml = html
      .replace(/(src|href|action)=["']\/TemperaturaWeb\//g, `$1="${baseUrl}`)
      .replace(/url\(["']\/TemperaturaWeb\//g, `url("${baseUrl}`);
    return new NextResponse(fixedHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Servidor no disponible' }, { status: 502 });
  }
}
