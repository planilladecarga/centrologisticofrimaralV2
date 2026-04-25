export function printContent(title: string, contentHtml: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title} - Frimaral</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
        .header h1 { font-size: 20px; letter-spacing: 4px; text-transform: uppercase; margin: 0; }
        .header .sub { font-size: 10px; color: #666; letter-spacing: 2px; text-transform: uppercase; }
        .header .date { font-size: 11px; color: #666; text-align: right; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 8px; font-size: 11px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #111; color: white; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>FRIMARAL</h1>
          <div class="sub">Centro Logistico</div>
        </div>
        <div class="date">
          <div style="font-size:13px;font-weight:bold;">${title}</div>
          <div>${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
      ${contentHtml}
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}
