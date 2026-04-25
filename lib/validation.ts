export function validateContainer(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional
  if (!/^[A-Za-z]{0,4}\d{4,11}$/.test(trimmed)) {
    return 'Formato inválido. Use letras+números (ej: TRLU1234567)';
  }
  return null;
}

export function validatePositiveNumber(value: string, field: string): string | null {
  const num = parseFloat(value);
  if (value.trim() !== '' && (isNaN(num) || num < 0)) {
    return `${field} debe ser un número positivo`;
  }
  return null;
}

export function validateRequired(value: string, field: string): string | null {
  if (!value.trim()) return `${field} es obligatorio`;
  return null;
}

export function generateBarcodeSvg(text: string): string {
  // Simple Code 128-like barcode SVG representation
  const width = text.length * 11 + 40;
  let bars = '';
  let x = 20;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Generate alternating black/white bars based on character
    for (let b = 0; b < 8; b++) {
      const isBlack = ((charCode >> b) & 1) === 1;
      const barWidth = ((charCode >> (b + 1)) & 1) + 1;
      if (isBlack) {
        bars += `<rect x="${x}" y="0" width="${barWidth}" height="40" fill="#111"/>`;
      }
      x += barWidth;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="50" viewBox="0 0 ${width} 50">
    ${bars}
    <text x="${width / 2}" y="48" text-anchor="middle" font-size="10" font-family="monospace">${text}</text>
  </svg>`;
}
