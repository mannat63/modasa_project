import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate a static route map image using HTML Canvas.
 * Returns a data URL (PNG) or null on failure.
 */
function generateStaticMapImage(routePoints, seq, zoneMap) {
  try {
    const W = 700, H = 250;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#f0f4f8';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#dde3ea';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    if (routePoints.length < 2) return null;

    // Calculate bounds with padding
    const lats = routePoints.map(p => p[0]);
    const lngs = routePoints.map(p => p[1]);
    const pad = 0.005;
    const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;
    const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;
    const latRange = maxLat - minLat || 0.01;
    const lngRange = maxLng - minLng || 0.01;

    const toX = (lng) => 30 + ((lng - minLng) / lngRange) * (W - 60);
    const toY = (lat) => 20 + (H - 40) - ((lat - minLat) / latRange) * (H - 40);

    // Draw route lines with glow
    ctx.shadowColor = 'rgba(14, 165, 233, 0.4)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    routePoints.forEach((p, i) => {
      const x = toX(p[1]), y = toY(p[0]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw direction arrows along segments
    ctx.fillStyle = '#0ea5e9';
    for (let i = 0; i < routePoints.length - 1; i++) {
      const x1 = toX(routePoints[i][1]), y1 = toY(routePoints[i][0]);
      const x2 = toX(routePoints[i+1][1]), y2 = toY(routePoints[i+1][0]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const arrowSize = 6;
      ctx.beginPath();
      ctx.moveTo(mx + arrowSize * Math.cos(angle), my + arrowSize * Math.sin(angle));
      ctx.lineTo(mx + arrowSize * Math.cos(angle + 2.5), my + arrowSize * Math.sin(angle + 2.5));
      ctx.lineTo(mx + arrowSize * Math.cos(angle - 2.5), my + arrowSize * Math.sin(angle - 2.5));
      ctx.closePath();
      ctx.fill();
    }

    // Draw stop circles with numbers
    routePoints.forEach((p, i) => {
      const x = toX(p[1]), y = toY(p[0]);
      const r = 12;

      // Outer glow
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? 'rgba(34,197,94,0.3)' : i === routePoints.length - 1 ? 'rgba(239,68,68,0.3)' : 'rgba(14,165,233,0.2)';
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#22c55e' : i === routePoints.length - 1 ? '#ef4444' : '#0ea5e9';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, x, y);

      // Zone label
      const zoneId = seq[i];
      const zone = typeof zoneId === 'string' ? zoneMap[zoneId] : zoneId;
      const label = zone?.name || zoneId || '';
      if (label) {
        ctx.fillStyle = '#334155';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label.length > 15 ? label.slice(0, 14) + '…' : label, x, y + r + 12);
      }
    });

    // Title
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Route Map — Generated ' + new Date().toLocaleTimeString('en-IN'), 8, H - 8);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
/**
 * Generate a PDF route document for a single truck.
 * @param {Object} truck - truck data
 * @param {Object[]} allZones - all zone objects
 * @param {string} date - formatted date string
 * @returns {Blob} PDF blob
 */
export function generateTruckReport(truck, allZones, date) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // ── Colour palette ──
  const PRIMARY   = [14, 165, 233];  // var(--accent)
  const DARK      = [15, 23, 42];    // #ffffff
  const RED       = [239, 68, 68];   // #ef4444
  const GREEN     = [34, 197, 94];   // #22c55e
  const GRAY      = [100, 116, 139]; // var(--muted)

  // ── Header bar ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 30, pageW, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Modasa Municipal Waste Management', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${date}`, margin, 22);
  doc.text('OFFICIAL ROUTE DOCUMENT', pageW - margin, 14, { align: 'right' });
  doc.text(`Generated: ${new Date().toLocaleTimeString('en-IN')}`, pageW - margin, 22, { align: 'right' });

  y = 40;

  // ── Truck Info Box ──
  doc.setFillColor(240, 245, 250);
  doc.roundedRect(margin, y, pageW - 2 * margin, 36, 3, 3, 'F');
  doc.setDrawColor(...PRIMARY);
  doc.roundedRect(margin, y, pageW - 2 * margin, 36, 3, 3, 'S');

  doc.setTextColor(...DARK);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Truck: ${truck.truckId}`, margin + 6, y + 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);

  const col1 = margin + 6;
  const col2 = pageW / 2 + 6;
  doc.text(`Driver: ${truck.driverName || '—'}`, col1, y + 18);
  doc.text(`Phone: ${truck.driverPhone || '—'}`, col1, y + 26);
  doc.text(`Distance: ${truck.estimatedDistance || 0} km`, col2, y + 18);
  doc.text(`Duration: ${truck.estimatedDuration || 0} min`, col2, y + 26);

  // Load factor mini bar
  const load = truck.currentLoadFactor || 0;
  const loadPct = Math.min(load * 100, 100);
  const barX = col1;
  const barY = y + 30;
  doc.setFillColor(220, 220, 220);
  doc.rect(barX, barY, 60, 3, 'F');
  doc.setFillColor(...(load > 0.85 ? RED : load > 0.7 ? [234, 179, 8] : GREEN));
  doc.rect(barX, barY, 60 * load, 3, 'F');
  doc.setFontSize(8);
  doc.text(`Load: ${loadPct.toFixed(0)}%`, barX + 64, barY + 3);

  y += 44;

  // ── Route Map ──
  // Generate a static route map image using canvas + OSM tiles
  const seq = truck.routeSequence || [];
  const zoneMap = {};
  for (const z of allZones) zoneMap[z.zoneId] = z;

  const routePoints = seq
    .map((item) => {
      const z = (item && typeof item === 'object') ? item : zoneMap[item];
      return z?.centerPoint || null;
    })
    .filter(Boolean);

  if (routePoints.length >= 2) {
    try {
      const mapImg = generateStaticMapImage(routePoints, seq, zoneMap);
      if (mapImg) {
        doc.addImage(mapImg, 'PNG', margin, y, pageW - 2 * margin, 50);
        y += 54;
      } else {
        throw new Error('fallback');
      }
    } catch {
      // Fallback: draw a simple schematic route diagram in the PDF
      const mapH = 40;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(200, 210, 220);
      doc.roundedRect(margin, y, pageW - 2 * margin, mapH, 2, 2, 'FD');

      if (routePoints.length > 0) {
        // Normalize coordinates to fit in the box
        const lats = routePoints.map(p => p[0]);
        const lngs = routePoints.map(p => p[1]);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        const latRange = maxLat - minLat || 0.01;
        const lngRange = maxLng - minLng || 0.01;
        const boxW = pageW - 2 * margin - 10;
        const boxH = mapH - 10;

        const toX = (lng) => margin + 5 + ((lng - minLng) / lngRange) * boxW;
        const toY = (lat) => y + 5 + boxH - ((lat - minLat) / latRange) * boxH;

        // Draw route lines
        doc.setDrawColor(...PRIMARY);
        doc.setLineWidth(0.8);
        for (let i = 0; i < routePoints.length - 1; i++) {
          doc.line(toX(routePoints[i][1]), toY(routePoints[i][0]), toX(routePoints[i+1][1]), toY(routePoints[i+1][0]));
        }

        // Draw stop circles with numbers
        for (let i = 0; i < routePoints.length; i++) {
          const cx = toX(routePoints[i][1]);
          const cy = toY(routePoints[i][0]);
          doc.setFillColor(...PRIMARY);
          doc.circle(cx, cy, 2.5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.text(`${i + 1}`, cx, cy + 0.8, { align: 'center' });
        }

        // Label
        doc.setTextColor(...GRAY);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.text('Route Map (schematic)', margin + 4, y + mapH - 3);
      }

      y += mapH + 4;
    }
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(200, 210, 220);
    doc.roundedRect(margin, y, pageW - 2 * margin, 16, 2, 2, 'FD');
    doc.setTextColor(...GRAY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('No route data available for map', pageW / 2, y + 10, { align: 'center' });
    y += 20;
  }

  // ── Stop Sequence Table ──
  const tableData = seq.map((item, i) => {
    // Handle both populated objects and ID strings
    const z = (item && typeof item === 'object') ? item : zoneMap[item];
    
    if (!z) {
      const displayId = (item && typeof item === 'object') ? (item.zoneId || 'Unknown') : item;
      return [i + 1, displayId, '—', '—', '—', ''];
    }

    const priority = (z.riskScore || 0) > 0.7 ? 'HIGH' : (z.riskScore || 0) > 0.5 ? 'MEDIUM' : 'LOW';
    const totalMin = 7 * 60 + i * 8;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const eta = `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

    const notes = [];
    if (z.hasBin) notes.push('Smart bin installed');
    if (z.illegalDumping) notes.push('Illegal dumping site');
    if (z.blockedToday) notes.push('BLOCKED TODAY');

    return [i + 1, z.name || z.zoneId, (z.type || '').replace('_', ' '), priority, eta, notes.join(', ')];
  });

  doc.setTextColor(...DARK);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Stop Sequence', margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Zone Name', 'Type', 'Priority', 'Est. Arrival', 'Special Notes']],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [200, 210, 220],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: DARK,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    bodyStyles: {
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell(data) {
      // Highlight high-risk rows
      if (data.section === 'body' && data.row.raw && data.row.raw[3] === 'HIGH') {
        data.cell.styles.fillColor = [254, 226, 226]; // light red
        data.cell.styles.textColor = [153, 27, 27];
      }
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 28 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Special Instructions ──
  if (y < 250) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(200, 210, 220);
    doc.roundedRect(margin, y, pageW - 2 * margin, 20, 2, 2, 'FD');

    doc.setTextColor(...GRAY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Special Instructions: Drive safely. Follow designated pickup order.', margin + 4, y + 8);
    doc.text('Report any road blockages or overloaded bins via the app flag feature.', margin + 4, y + 14);
    y += 26;
  }

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 16;
  doc.setFillColor(...DARK);
  doc.rect(0, footerY - 4, pageW, 20, 'F');
  doc.setFillColor(...PRIMARY);
  doc.rect(0, footerY - 4, pageW, 1.5, 'F');

  doc.setTextColor(200, 210, 220);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Approved by Admin', margin, footerY + 4);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW / 2, footerY + 4, { align: 'center' });
  doc.text('Official route for today', pageW - margin, footerY + 4, { align: 'right' });

  // ── Return blob ──
  return doc.output('blob');
}

/**
 * Generate PDF reports for all trucks.
 * @param {Object[]} trucks
 * @param {Object[]} zones
 * @param {string} date
 * @returns {{ truckId: string, driverName: string, pdfBlob: Blob }[]}
 */
export function generateAllReports(trucks, zones, date) {
  return trucks
    .filter((t) => t.status === 'active')
    .map((truck) => ({
      truckId: truck.truckId,
      driverName: truck.driverName || truck.truckId,
      pdfBlob: generateTruckReport(truck, zones, date),
    }));
}

/**
 * Download a single PDF blob.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate all reports and bundle into a ZIP.
 * @param {Object[]} trucks
 * @param {Object[]} zones
 * @param {string} date
 */
export async function downloadAllAsZip(trucks, zones, date) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const folder = zip.folder(`WasteRoutes_${date.replace(/\//g, '-')}`);

  const reports = generateAllReports(trucks, zones, date);
  for (const r of reports) {
    folder.file(`Route_${r.truckId}_${r.driverName.replace(/\s+/g, '_')}.pdf`, r.pdfBlob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadPdf(blob, `WasteRoutes_${date.replace(/\//g, '-')}.zip`);
}
