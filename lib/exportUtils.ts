import * as XLSX from 'xlsx-js-style';

const thinBorder = {
  top: { style: 'thin' as const, color: { rgb: '000000' } },
  bottom: { style: 'thin' as const, color: { rgb: '000000' } },
  left: { style: 'thin' as const, color: { rgb: '000000' } },
  right: { style: 'thin' as const, color: { rgb: '000000' } },
};

const headerStyle = {
  fill: { fgColor: { rgb: '171717' } },
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  border: thinBorder,
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
};

const normalStyle = { border: thinBorder, font: { sz: 10 } };

export function exportToExcel(data: any[][], sheetName: string, fileName: string, colWidths?: number[]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  if (data.length > 0) {
    const colLetters = 'ABCDEFGHIJKLMNOP'.split('');
    // Style header row
    for (let c = 0; c < data[0].length; c++) {
      const ref = `${colLetters[c]}1`;
      if (ws[ref]) ws[ref].s = headerStyle;
    }
    // Style data rows
    for (let r = 1; r < data.length; r++) {
      for (let c = 0; c < data[0].length; c++) {
        const ref = `${colLetters[c]}${r + 1}`;
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = normalStyle;
      }
    }
  }
  
  if (colWidths) {
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  }
  
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

// Dashboard summary export
export function exportDashboardSummary(kpis: any, clientBreakdown: any[]) {
  const data: any[][] = [
    ['RESUMEN OPERATIVO - FRIMARAL'],
    ['Fecha', new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })],
    [],
    ['Indicador', 'Valor'],
    ['Contenedores', kpis.containers],
    ['Clientes Activos', kpis.clients],
    ['Total Pallets', kpis.pallets],
    ['Total Cajas', kpis.cajas],
    ['Peso Total (Ton)', kpis.toneladas],
    ['Ocupación (%)', kpis.occupiedPercent],
    [],
    ['Desglose por Cliente'],
    ['Cliente', 'Contenedores', 'Pallets', 'Cajas', 'Kilos'],
    ...clientBreakdown.map(c => [
      c.cliente,
      c.containersArr?.length || 0,
      c.pallets,
      c.cajas,
      c.kilos,
    ]),
  ];
  exportToExcel(data, 'Resumen', `resumen_frimaral_${new Date().toISOString().slice(0, 10)}.xlsx`, [30, 20, 15, 15, 15, 15]);
}

// Inventory export
export function exportInventoryExcel(inventoryData: any[]) {
  const data: any[][] = [
    ['Inventario - FRIMARAL'],
    ['Fecha', new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })],
    [],
    ['Cliente', 'N° Cliente', 'Producto', 'Contenedor', 'Lote', 'Pallets', 'Cajas', 'Kilos'],
    ...inventoryData.map(i => [
      i.cliente || '',
      i.numeroCliente || '',
      i.producto || '',
      i.contenedor || '',
      i.lote || '',
      i.pallets || 0,
      i.cantidad || 0,
      i.kilos || 0,
    ]),
  ];
  exportToExcel(data, 'Inventario', `inventario_frimaral_${new Date().toISOString().slice(0, 10)}.xlsx`, [25, 15, 40, 20, 18, 10, 10, 12]);
}

// Audit log export
export function exportAuditLogExcel(entries: any[]) {
  const data: any[][] = [
    ['Historial de Cambios - FRIMARAL'],
    [],
    ['Fecha', 'Operador', 'Módulo', 'Acción', 'Descripción'],
    ...entries.map(e => [
      new Date(e.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      e.operador || '',
      e.modulo || '',
      e.accion || '',
      e.descripcion || '',
    ]),
  ];
  exportToExcel(data, 'Historial', `historial_frimaral_${new Date().toISOString().slice(0, 10)}.xlsx`, [18, 18, 18, 25, 50]);
}
