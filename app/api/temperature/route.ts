import { NextResponse } from 'next/server';

const INTERNAL_TEMP_URL = 'http://192.168.150.31/TemperaturaWeb/temperatura.php';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

interface TempData {
  actual: number;
  min: number;
  max: number;
  promedio: number;
  sensor: string;
  fecha: string;
  historial: { hora: string; valor: number }[];
}

type ApiStatus = 'ok' | 'offline' | 'timeout' | 'empty' | 'error';

interface ApiResponse {
  status: ApiStatus;
  message: string;
  data: TempData | null;
  meta: {
    attempts: number;
    durationMs: number;
    timestamp: string;
  };
}

function classifyError(error: unknown): ApiStatus {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'timeout';
    }

    if (error.message.toLowerCase().includes('fetch failed')) {
      return 'offline';
    }
  }

  return 'error';
}

async function fetchWithRetries(url: string): Promise<{ html: string | null; attempts: number; status: ApiStatus }> {
  let attempts = 0;
  let lastStatus: ApiStatus = 'offline';

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    attempts += 1;

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn('[temperature-api] upstream non-200 response', {
          status: response.status,
          attempt: attempts,
        });
        lastStatus = 'offline';
        continue;
      }

      const html = await response.text();

      if (!html.trim()) {
        console.warn('[temperature-api] upstream returned empty body', { attempt: attempts });
        lastStatus = 'empty';
        continue;
      }

      return { html, attempts, status: 'ok' };
    } catch (error) {
      const status = classifyError(error);
      lastStatus = status;
      console.warn('[temperature-api] fetch attempt failed', {
        attempt: attempts,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { html: null, attempts, status: lastStatus };
}

function parseTemperatureHtml(html: string): TempData | null {
  const text = html.replace(/<[^>]*>/g, ' ');
  const temps: number[] = [];
  const re = /(-?\d+[\.,]\d{2})\s*°?\s*C/gi;
  let match: RegExpExecArray | null = re.exec(text);

  while (match !== null) {
    temps.push(parseFloat(match[1].replace(',', '.')));
    match = re.exec(text);
  }

  if (temps.length === 0) {
    return null;
  }

  const findNear = (keyword: string) => {
    const idx = text.toLowerCase().indexOf(keyword);

    if (idx === -1) {
      return temps[0];
    }

    const after = text.substring(idx);
    const tempMatch = after.match(/(-?\d+[\.,]\d{2})\s*°?\s*C/i);
    return tempMatch ? parseFloat(tempMatch[1].replace(',', '.')) : temps[0];
  };

  const actual = findNear('actual');
  const promedio = findNear('promed') || findNear('prom');
  const min = Math.min(...temps);
  const max = Math.max(...temps);

  const sensorMatch = text.match(/sensor\s*\d+/i);
  const sensor = sensorMatch ? sensorMatch[0].toUpperCase() : 'SENSOR1';

  const fechaMatch = text.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  const fecha = fechaMatch
    ? `${fechaMatch[1].padStart(2, '0')}/${fechaMatch[2].padStart(2, '0')}/${fechaMatch[3].padStart(4, '0')}`
    : new Date().toLocaleDateString('es-ES');

  const historial: { hora: string; valor: number }[] = [];
  const arrMatch = html.match(/\[(?:-?\d+[\.,]\d+(?:,\s*)?)+\]/g);

  if (arrMatch) {
    let longest = '';

    for (const candidate of arrMatch) {
      if (candidate.length > longest.length) {
        longest = candidate;
      }
    }

    const values = longest.match(/-?\d+[\.,]\d+/g);

    if (values && values.length > 2) {
      const interval = (24 * 60) / values.length;
      values.forEach((value, index) => {
        const mins = Math.floor(index * interval);
        historial.push({
          hora: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`,
          valor: parseFloat(value.replace(',', '.')),
        });
      });
    }
  }

  return {
    actual,
    min,
    max,
    promedio: promedio || temps.reduce((acc, value) => acc + value, 0) / temps.length,
    sensor,
    fecha,
    historial,
  };
}

export async function GET() {
  const startedAt = Date.now();
  const { html, attempts, status } = await fetchWithRetries(INTERNAL_TEMP_URL);

  if (!html) {
    const payload: ApiResponse = {
      status,
      message: status === 'timeout'
        ? 'Tiempo de espera agotado al consultar el origen interno.'
        : status === 'empty'
          ? 'El origen interno respondió sin contenido.'
          : 'No se pudo conectar con el origen interno.',
      data: null,
      meta: {
        attempts,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(payload, { status: status === 'timeout' ? 504 : 503 });
  }

  const parsed = parseTemperatureHtml(html);

  if (!parsed) {
    console.warn('[temperature-api] upstream payload parsed as empty data');

    const payload: ApiResponse = {
      status: 'empty',
      message: 'No se encontraron datos de temperatura en la respuesta del origen.',
      data: null,
      meta: {
        attempts,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(payload, { status: 502 });
  }

  console.info('[temperature-api] success', {
    attempts,
    sensor: parsed.sensor,
    fecha: parsed.fecha,
    durationMs: Date.now() - startedAt,
  });

  const payload: ApiResponse = {
    status: 'ok',
    message: 'Datos obtenidos correctamente.',
    data: parsed,
    meta: {
      attempts,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
