import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// API: EXTRAER DATOS DE PEDIDO DESDE EMAIL/ARCHIVO
// Usa z-ai-web-dev-sdk (VLM + Chat) para leer el contenido
// El SDK es opcional - si no está disponible devuelve error claro
// ═══════════════════════════════════════════════════════════

interface ExtractedItem {
  producto: string;
  contenedor: string;
  lote: string;
  pallets: number;
  cajas: number;
  kilos: number;
}

interface ExtractResponse {
  success: boolean;
  items?: ExtractedItem[];
  cliente?: string;
  observaciones?: string;
  rawText?: string;
  error?: string;
}

// Helper: get ZAI SDK instance (lazy, with error handling)
async function getZAI(): Promise<any> {
  try {
    const mod = await import('z-ai-web-dev-sdk');
    const ZAI = mod.default || mod;
    return await ZAI.create();
  } catch {
    return null;
  }
}

// Helper: call AI chat completion
async function callAI(zai: any, messages: any): Promise<string> {
  const completion = await zai.chat.completions.create({ messages });
  return completion.choices?.[0]?.message?.content || '';
}

async function extractFromImage(base64Data: string): Promise<ExtractResponse> {
  const zai = await getZAI();
  if (!zai) {
    return { success: false, error: 'SDK de IA no disponible. Ejecutá la app con npm run dev (modo servidor).' };
  }

  try {
    const base64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');

    const content = await callAI(zai, [
      {
        role: 'system',
        content: `Eres un asistente especializado en logística de centro de frio. EXTRAER datos de pedidos desde capturas de emails.

CONTEXTO: SADETIR (DYSA 10330) envía pedidos por email con productos y cantidades.

INSTRUCCIONES:
1. Identifica TODOS los productos mencionados
2. Extrae cantidades (pallets, cajas, kilos) para cada producto
3. Si menciona contenedor o lote, extrae los números
4. El campo "producto" debe ser el nombre exacto como aparece

RESPONDE ÚNICAMENTE con JSON válido, sin markdown:
{"cliente":"","items":[{"producto":"","contenedor":"","lote":"","pallets":0,"cajas":0,"kilos":0}],"observaciones":""}

Si no identifies productos, devuelve items vacío. Si no es un pedido, devuelve {"error":"No se pudo identificar un pedido en la imagen"}.`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: 'text', text: 'Extrae todos los datos del pedido. Devuelve solo el JSON.' },
        ],
      },
    ] as any);

    return parseAIResponse(content);
  } catch (error: any) {
    return { success: false, error: `Error al analizar la imagen: ${error.message}` };
  }
}

async function extractFromPdf(base64Data: string): Promise<ExtractResponse> {
  try {
    // Extract text from PDF
    const pdfjsLib = await import('pdfjs-dist');
    const raw = base64Data.replace(/^data:application\/pdf;base64,/, '');
    const pdfData = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    if (!fullText.trim()) {
      return { success: false, error: 'No se pudo extraer texto del PDF' };
    }

    const zai = await getZAI();
    if (!zai) {
      return { success: false, error: 'SDK de IA no disponible. Se extrajo texto del PDF pero no se pudo interpretar automáticamente.' };
    }

    const content = await callAI(zai, [
      {
        role: 'system',
        content: `Eres un asistente de logística. EXTRAER datos de pedidos desde texto de PDF. CONTEXTO: SADETIR (DYSA 10330).

RESPONDE ÚNICAMENTE con JSON válido:
{"cliente":"","items":[{"producto":"","contenedor":"","lote":"","pallets":0,"cajas":0,"kilos":0}],"observaciones":""}

Si no identifies productos, devuelve items vacío.`,
      },
      {
        role: 'user',
        content: `Texto del PDF:\n\n${fullText}\n\nExtrae datos del pedido. Solo JSON.`,
      },
    ]);

    const result = parseAIResponse(content);
    result.rawText = fullText;
    return result;
  } catch (error: any) {
    return { success: false, error: `Error al procesar el PDF: ${error.message}` };
  }
}

async function extractFromExcel(base64Data: string): Promise<ExtractResponse> {
  try {
    const XLSX = await import('xlsx');
    const raw = base64Data.replace(/^data:application\/[^;]+;base64,/, '');
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const workbook = XLSX.read(bytes, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<any[]>(firstSheet, { defval: '' });

    if (!data || data.length === 0) {
      return { success: false, error: 'El archivo Excel está vacío' };
    }

    const textRepresentation = data.map((row, idx) =>
      `Fila ${idx + 1}: ${Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', ')}`
    ).join('\n');

    const zai = await getZAI();
    if (!zai) {
      return { success: false, error: 'SDK de IA no disponible. Se leyó el Excel pero no se pudo interpretar automáticamente.' };
    }

    const content = await callAI(zai, [
      {
        role: 'system',
        content: `Eres un asistente de logística. EXTRAER datos de pedidos desde datos de Excel.

Columnas posibles: producto, contenedor, lote, pallets, cajas, kilos, bultos, peso, cantidad.

RESPONDE ÚNICAMENTE con JSON válido:
{"cliente":"","items":[{"producto":"","contenedor":"","lote":"","pallets":0,"cajas":0,"kilos":0}],"observaciones":""}`,
      },
      {
        role: 'user',
        content: `Datos del Excel:\n\n${textRepresentation}\n\nExtrae datos del pedido. Solo JSON.`,
      },
    ]);

    const result = parseAIResponse(content);
    result.rawText = textRepresentation;
    return result;
  } catch (error: any) {
    return { success: false, error: `Error al procesar el Excel: ${error.message}` };
  }
}

function parseAIResponse(content: string): ExtractResponse {
  try {
    let jsonStr = content.trim();

    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.error) {
      return { success: false, error: parsed.error };
    }

    const items: ExtractedItem[] = (parsed.items || []).map((item: any) => ({
      producto: String(item.producto || '').trim(),
      contenedor: String(item.contenedor || '').trim(),
      lote: String(item.lote || '').trim(),
      pallets: Number(item.pallets) || 0,
      cajas: Number(item.cajas) || 0,
      kilos: Number(item.kilos) || 0,
    })).filter((item: ExtractedItem) => item.producto);

    return {
      success: true,
      items,
      cliente: String(parsed.cliente || '').trim(),
      observaciones: String(parsed.observaciones || '').trim(),
    };
  } catch {
    return { success: false, error: 'No se pudo interpretar la respuesta de la IA.' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileData, fileName, fileType } = body;

    if (!fileData || !fileName) {
      return NextResponse.json({ success: false, error: 'Faltan datos del archivo' }, { status: 400 });
    }

    let result: ExtractResponse;

    if (fileType?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(fileName)) {
      result = await extractFromImage(fileData);
    } else if (fileType?.includes('pdf') || /\.pdf$/i.test(fileName)) {
      result = await extractFromPdf(fileData);
    } else if (fileType?.includes('sheet') || fileType?.includes('excel') || fileType?.includes('csv') || /\.(xlsx?|csv)$/i.test(fileName)) {
      result = await extractFromExcel(fileData);
    } else {
      return NextResponse.json({ success: false, error: 'Formato no soportado. Use PDF, JPG, PNG o Excel.' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: `Error del servidor: ${error.message}` }, { status: 500 });
  }
}
