import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// API: EXTRAER DATOS DE PEDIDO DESDE EMAIL/ARCHIVO
// Usa z-ai-web-dev-sdk (VLM + Chat) para leer el contenido
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

async function extractFromImage(base64Data: string): Promise<ExtractResponse> {
  try {
    // Dynamic import to avoid issues with static export
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    // Remove data URL prefix if present
    const base64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un asistente especializado en logística de centro de frio. Tu tarea es EXTRAER datos de pedidos desde capturas de emails.

CONTEXTO: Trabajamos con SADETIR (DYSA 10330), un cliente que envía pedidos por email. Los emails pueden contener:
- Listas de productos con cantidades (pallets, cajas, kilos)
- Números de contenedor
- Números de lote
- Referencias a productos congelados

INSTRUCCIONES:
1. Identifica TODOS los productos mencionados en el email/captura
2. Extrae las cantidades pedidas (pallets, cajas, kilos) para cada producto
3. Si menciona un contenedor, extrae el número
4. Si menciona un lote, extrae el número
5. El campo "producto" debe ser el nombre del producto exactamente como aparece

RESPONDE ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown:
{
  "cliente": "nombre del cliente si se menciona, o vacío",
  "items": [
    {
      "producto": "nombre del producto",
      "contenedor": "número de contenedor si se menciona, o vacío",
      "lote": "número de lote si se menciona, o vacío",
      "pallets": 0,
      "cajas": 0,
      "kilos": 0
    }
  ],
  "observaciones": "cualquier nota adicional del email"
}

Si no puedes identificar productos o cantidades, devuelve items vacío. Si la imagen no es un pedido, devuelve {"error": "No se pudo identificar un pedido en la imagen"}.
Si el email menciona productos pero no cantidades específicas, pon pallets: 1 y cajas/kilos: 0 como valor por defecto.`,
        },
        {
          role: 'user',
          // @ts-expect-error - VLM multimodal content with image
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
            {
              type: 'text',
              text: 'Extrae todos los datos del pedido de este email/captura. Devuelve solo el JSON.',
            },
          ],
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || '';
    return parseAIResponse(content);
  } catch (error: any) {
    console.error('Error en VLM:', error);
    return { success: false, error: `Error al analizar la imagen: ${error.message}` };
  }
}

async function extractFromPdf(base64Data: string): Promise<ExtractResponse> {
  try {
    // Extract text from PDF using pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');

    // Set worker
    const pdfData = Uint8Array.from(atob(base64Data.replace(/^data:application\/pdf;base64,/, '')), c => c.charCodeAt(0));
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

    // Use AI to parse the extracted text
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un asistente especializado en logística. EXTRAER datos de pedidos desde texto extraído de un PDF/email.

CONTEXTO: Trabajamos con SADETIR (DYSA 10330), cliente que envía pedidos por email con archivos PDF adjuntos.

RESPONDE ÚNICAMENTE con un JSON válido:
{
  "cliente": "nombre del cliente",
  "items": [
    {
      "producto": "nombre del producto",
      "contenedor": "número si se menciona",
      "lote": "número si se menciona",
      "pallets": 0,
      "cajas": 0,
      "kilos": 0
    }
  ],
  "observaciones": "notas adicionales"
}

Si no puedes identificar productos, devuelve items vacío. Si no es un pedido, devuelve {"error": "No se pudo identificar un pedido"}.`,
        },
        {
          role: 'user',
          content: `Texto extraído del PDF:\n\n${fullText}\n\nExtrae todos los datos del pedido. Devuelve solo el JSON.`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || '';
    const result = parseAIResponse(content);
    result.rawText = fullText;
    return result;
  } catch (error: any) {
    console.error('Error procesando PDF:', error);
    return { success: false, error: `Error al procesar el PDF: ${error.message}` };
  }
}

async function extractFromExcel(base64Data: string): Promise<ExtractResponse> {
  try {
    const XLSX = await import('xlsx');

    const binaryStr = atob(base64Data.replace(/^data:application\/[^;]+;base64,/, ''));
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const workbook = XLSX.read(bytes, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<any[]>(firstSheet, { defval: '' });

    if (!data || data.length === 0) {
      return { success: false, error: 'El archivo Excel está vacío' };
    }

    // Try to parse the Excel data with AI
    const textRepresentation = data.map((row, idx) =>
      `Fila ${idx + 1}: ${Object.entries(row).map(([k, v]) => `${k}=${v}`).join(', ')}`
    ).join('\n');

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un asistente de logística. EXTRAER datos de pedidos desde datos de Excel.

Los datos del Excel pueden contener columnas como: producto, contenedor, lote, pallets, cajas, kilos, bultos, peso, cantidad, etc.

RESPONDE ÚNICAMENTE con un JSON válido:
{
  "cliente": "nombre del cliente si se menciona",
  "items": [
    {
      "producto": "nombre del producto",
      "contenedor": "número si existe",
      "lote": "número si existe",
      "pallets": 0,
      "cajas": 0,
      "kilos": 0
    }
  ],
  "observaciones": "notas adicionales"
}`,
        },
        {
          role: 'user',
          content: `Datos del Excel:\n\n${textRepresentation}\n\nExtrae todos los datos del pedido. Devuelve solo el JSON.`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content || '';
    const result = parseAIResponse(content);
    result.rawText = textRepresentation;
    return result;
  } catch (error: any) {
    console.error('Error procesando Excel:', error);
    return { success: false, error: `Error al procesar el Excel: ${error.message}` };
  }
}

function parseAIResponse(content: string): ExtractResponse {
  try {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Find JSON object in the string
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
  } catch (e) {
    console.error('Error parsing AI response:', content, e);
    return { success: false, error: 'No se pudo interpretar la respuesta de la IA. Intente con otro archivo.' };
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
      return NextResponse.json({ success: false, error: 'Formato de archivo no soportado. Use PDF, JPG, PNG o Excel.' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en /api/extract-order:', error);
    return NextResponse.json({ success: false, error: `Error del servidor: ${error.message}` }, { status: 500 });
  }
}
