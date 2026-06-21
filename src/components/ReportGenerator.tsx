import { useEffect, useState } from 'react';
import { getSlots, getCaptures } from '../lib/database';
import type { SurveyProject, SurveySlot, VehicleCapture } from '../lib/types';
import { FileText, Download, ArrowLeft, Loader2 } from 'lucide-react';

interface Props { project: SurveyProject | null; onBack?: () => void; }

// ── Vehicle type order used throughout the report ──────────────────────────
const TYPES   = ['two_wheeler','auto','car','lcv','bus','truck','others'] as const;
type  VType   = typeof TYPES[number];
const LABELS  = ['Two Wheeler','Auto','Car','LCV','Bus','Truck','Others'];
const ECS_F: Record<VType, number> = {
  two_wheeler: 0.25, auto: 0.5, car: 1, lcv: 1.5, bus: 2.5, truck: 3, others: 1,
};

export default function ReportGenerator({ project, onBack }: Props) {
  const [slots,    setSlots]    = useState<SurveySlot[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!project) return;
    const id = project.id;
    (async () => {
      setLoading(true);
      const [s, c] = await Promise.all([getSlots(id), getCaptures(id)]);
      setSlots(s); setCaptures(c); setLoading(false);
    })();
  }, [project]);

  if (!project) return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Select a project to generate reports</p>
      </div>
    </div>
  );
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Pre-compute statistics shown in the preview ─────────────────────────
  const totalVehicles = captures.length;

  function parseMin(t: string) { const p = t.split(':'); return +p[0] * 60 + +p[1]; }

  const slotData = slots.map(slot => {
    const sc = captures.filter(c => c.slot_id === slot.id);
    const counts = {} as Record<VType, number>;
    TYPES.forEach(t => { counts[t] = sc.filter(c => c.vehicle_type === t).length; });
    const ecs = TYPES.reduce((s, t) => s + counts[t] * ECS_F[t], 0);
    return { slot, counts, ecs };
  });

  const surveyStartMin = parseMin(project.start_time);
  const slotTimes = slotData.map(r => parseMin(r.slot.end_time) - surveyStartMin);
  const trapAreas = slotData.map((r, i) =>
    i === 0 ? 0 : ((slotData[i - 1].ecs + r.ecs) / 2) * (slotTimes[i] - slotTimes[i - 1])
  );
  const parkingLoad  = trapAreas.reduce((s, a) => s + a, 0);
  const peakECS      = slotData.length > 0 ? Math.max(...slotData.map(r => r.ecs)) : 0;
  const totECS       = slotData.reduce((s, r) => s + r.ecs, 0);
  const avgDurMin    = totalVehicles > 0 ? parkingLoad / totalVehicles : 0;
  const supply       = project.area_size_sqm ?? 0;
  const capacity     = supply > 0 ? project.survey_duration_hours * 60 * supply : 0;
  const parkingIndex = capacity > 0 ? (parkingLoad / capacity) * 100 : -1;

  // ── CSV export ──────────────────────────────────────────────────────────
  function generateCSV() {
    if (!project) return;
    const header = ['Slot', 'Start', 'End', ...LABELS, 'ECS'];
    const rows = [header.join(',')];
    slotData.forEach(r => {
      rows.push([
        `S${r.slot.slot_number}`,
        r.slot.start_time, r.slot.end_time,
        ...TYPES.map(t => r.counts[t]),
        r.ecs.toFixed(2),
      ].join(','));
    });
    const totals = {} as Record<VType, number>;
    TYPES.forEach(t => { totals[t] = slotData.reduce((s, r) => s + r.counts[t], 0); });
    rows.push(['Total','','', ...TYPES.map(t => totals[t]), totECS.toFixed(2)].join(','));
    downloadFile(rows.join('\n'), `${project.project_name}_data.csv`, 'text/csv');
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PDF GENERATOR — NIT Warangal Parking Survey Report Format
  // ════════════════════════════════════════════════════════════════════════
  async function generatePDF() {
    if (!project) return;
    setGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      // ── Fetch NIT logo (placed in /public/NIT_logo.png) ───────────────
      let logoDataUrl = '';
      try {
        const resp = await fetch('/NIT_logo.png');
        if (resp.ok) {
          const blob = await resp.blob();
          logoDataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch (_) { /* logo unavailable — continue without it */ }

      // ── Layout constants ───────────────────────────────────────────────
      const L  = 14;          // left margin
      const PW = 210;         // A4 width (mm)
      const PH = 297;         // A4 height (mm)
      const R  = PW - L;      // right edge
      const W  = R - L;       // content width = 182 mm
      const TM = 15;          // top margin
      const BM = 18;          // bottom margin
      const RH = 7;           // standard row height

      // ── Color helpers (avoid spread — jsPDF takes individual r,g,b) ────
      const sf = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
      const st = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
      const sd = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);

      // ── Re-compute statistics inside PDF scope ─────────────────────────
      const durationMin   = project.survey_duration_hours * 60;
      const totals        = {} as Record<VType, number>;
      TYPES.forEach(t => { totals[t] = slotData.reduce((s, r) => s + r.counts[t], 0); });

      const peakIdx   = slotData.findIndex(r => r.ecs === peakECS);
      const peakSlot  = peakIdx >= 0 ? slotData[peakIdx].slot : null;
      const turnover  = supply > 0 ? totalVehicles / supply : -1;
      const occupancy = supply > 0 ? (peakECS / supply) * 100 : -1;

      // na(): format or show dash for unavailable stats (sentinel = -1)
      const na = (v: number, dec = 2) => v < 0 ? '—' : v.toFixed(dec);

      let y = TM;
      let cx = L; // reusable column-x cursor

      // ── Helper: draw horizontal table divider lines ────────────────────
      function hLine(startX: number, endX: number, yy: number, w = 0.2) {
        sd(160, 180, 215); doc.setLineWidth(w);
        doc.line(startX, yy, endX, yy);
      }

      // ── Helper: draw outer border + vertical dividers for a table ───────
      function tableOutline(tableTop: number, tableBottom: number, colWidths: number[]) {
        sd(140, 165, 210); doc.setLineWidth(0.5);
        doc.rect(L, tableTop, colWidths.reduce((a, b) => a + b, 0), tableBottom - tableTop, 'S');
        let vx = L;
        colWidths.forEach(cw => { doc.line(vx, tableTop, vx, tableBottom); vx += cw; });
        doc.line(vx, tableTop, vx, tableBottom);
      }

      // ══════════════════════════════════════════════════════════════════
      // PAGE 1 — Title + Project Details
      // ══════════════════════════════════════════════════════════════════

      // Institution name
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      st(0, 51, 102);
      doc.text('NATIONAL INSTITUTE OF TECHNOLOGY, WARANGAL', 105, y, { align: 'center' });
      y += 9;

      // Report subtitle
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      st(20, 30, 50);
      doc.text('On Street Parking Survey Report', 105, y, { align: 'center' });
      y += 7;

      // Separator
      sd(0, 51, 102); doc.setLineWidth(0.9);
      doc.line(L, y, R, y); y += 6;

      // NIT logo — centered between title bar and project details
      if (logoDataUrl) {
        const logoW = 69.1, logoH = 84.2;
        doc.addImage(logoDataUrl, 'PNG', (PW - logoW) / 2, y, logoW, logoH);
        y += logoH + 4;
      }

      // Section heading
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      st(0, 51, 102);
      doc.text('PROJECT DETAILS', L, y); y += 6;

      // Details table (label column | value column)
      const dW1 = 72, dW2 = W - dW1;
      const detailRows: [string, string][] = [
        ['Project Name',      project.project_name],
        ['Location',          project.location_name ?? '—'],
        ['Survey Date',       project.survey_date],
        ['Survey Start Time', project.start_time],
        ['Survey End Time',   project.end_time],
        ['Survey Duration',   `${project.survey_duration_hours} hours  (${durationMin} min)`],
        ['Survey Interval',   `${project.survey_interval_minutes} minutes`],
        ['Parking Supply',    supply > 0 ? String(supply) : '—'],
      ];
      const detTop = y;
      detailRows.forEach(([lbl, val], i) => {
        // Wrap long values so they fit in the value column without overflow
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        const valLines = doc.splitTextToSize(val, dW2 - 6) as string[];
        const rowH = valLines.length <= 1 ? (RH + 1) : valLines.length * 5 + 4;
        if (i % 2 === 0) sf(248, 250, 255); else sf(255, 255, 255);
        doc.rect(L, y, W, rowH, 'F');
        sf(228, 234, 252);
        doc.rect(L, y, dW1, rowH, 'F');
        doc.setFont('helvetica', 'bold');   doc.setFontSize(9); st(25, 50, 100);
        doc.text(lbl, L + 3, y + 5.5);
        doc.setFont('helvetica', 'normal'); st(20, 30, 50);
        valLines.forEach((line: string, li: number) => {
          doc.text(line, L + dW1 + 3, y + 5.5 + li * 5);
        });
        hLine(L, L + W, y + rowH);
        y += rowH;
      });
      tableOutline(detTop, y, [dW1, dW2]);

      // ══════════════════════════════════════════════════════════════════
      // PAGE 2 — Table 1 (ECS Values) + Table 2 (Volume) + Fig-1 (Bar)
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); y = TM;

      // ── TABLE 1: ECS Values as per IRC SP 12 ──────────────────────────
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 1: ECS Values as per IRC SP 12', L, y); y += 6;

      const t1cW = [91, 91];
      const t1Top = y;

      sf(0, 51, 102);
      doc.rect(L, y, W, RH + 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); st(255, 255, 255);
      doc.text('Vehicle Type', L + t1cW[0] / 2, y + 5.5, { align: 'center' });
      doc.text('ECS',          L + t1cW[0] + t1cW[1] / 2, y + 5.5, { align: 'center' });
      y += RH + 1;

      const t1Rows: [string, string][] = [
        ['Two Wheeler','0.25'], ['Auto','0.50'], ['Car','1.00'],
        ['LCV','1.50'], ['Bus','2.50'], ['Truck','3.00'], ['Others','1.00'],
      ];
      t1Rows.forEach(([vt, ecs], i) => {
        if (i % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, W, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
        doc.text(vt,  L + t1cW[0] / 2, y + 5, { align: 'center' });
        doc.text(ecs, L + t1cW[0] + t1cW[1] / 2, y + 5, { align: 'center' });
        hLine(L, L + W, y + RH);
        y += RH;
      });
      tableOutline(t1Top, y, t1cW);
      y += 10;

      // ── TABLE 2: Total Volume in ECS ──────────────────────────────────
      if (y + 30 > PH - BM) { doc.addPage(); y = TM; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 2: Total Volume in ECS', L, y); y += 6;

      // Slot(28) TW(21) Auto(18) Car(18) LCV(18) Bus(18) Truck(18) Others(18) ECS(25) = 182
      const t2cW = [28, 21, 18, 18, 18, 18, 18, 18, 25];
      const t2TW = t2cW.reduce((a, b) => a + b, 0);
      const t2Top = y;

      sf(0, 51, 102);
      doc.rect(L, y, t2TW, RH + 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(255, 255, 255);
      const t2Hdrs = ['Slot','Two\nWheeler','Auto','Car','LCV','Bus','Truck','Others','ECS'];
      cx = L;
      t2Hdrs.forEach((h, i) => {
        if (h.includes('\n')) {
          const [l1, l2] = h.split('\n');
          doc.text(l1, cx + t2cW[i] / 2, y + 3.5, { align: 'center' });
          doc.text(l2, cx + t2cW[i] / 2, y + 7.5, { align: 'center' });
        } else {
          doc.text(h, cx + t2cW[i] / 2, y + 5.5, { align: 'center' });
        }
        cx += t2cW[i];
      });
      y += RH + 3;

      slotData.forEach((r, i) => {
        if (y + RH > PH - BM) { doc.addPage(); y = TM; }
        if (i % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, t2TW, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(20, 30, 50);
        const rowVals = [
          `${r.slot.start_time.slice(0, 5)}-${r.slot.end_time.slice(0, 5)}`,
          String(r.counts.two_wheeler), String(r.counts.auto), String(r.counts.car),
          String(r.counts.lcv), String(r.counts.bus), String(r.counts.truck),
          String(r.counts.others), r.ecs.toFixed(2),
        ];
        cx = L;
        rowVals.forEach((v, ci) => {
          doc.text(v, cx + t2cW[ci] / 2, y + 5, { align: 'center' }); cx += t2cW[ci];
        });
        hLine(L, L + t2TW, y + RH);
        y += RH;
      });

      // Grand Total row
      if (y + RH + 3 > PH - BM) { doc.addPage(); y = TM; }
      sf(220, 230, 252);
      doc.rect(L, y, t2TW, RH + 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); st(20, 30, 50);
      const totRow = [
        'Total',
        String(totals.two_wheeler), String(totals.auto), String(totals.car),
        String(totals.lcv), String(totals.bus), String(totals.truck),
        String(totals.others), totECS.toFixed(2),
      ];
      cx = L;
      totRow.forEach((v, ci) => {
        doc.text(v, cx + t2cW[ci] / 2, y + 6, { align: 'center' }); cx += t2cW[ci];
      });
      y += RH + 2;
      tableOutline(t2Top, y, t2cW);
      y += 10;

      // ── FIG-1: Bar Chart — Total Number of Vehicles in Survey ─────────
      if (y + 86 > PH - BM) { doc.addPage(); y = TM; }

      const bL  = L + 18;
      const bT  = y;
      const bW  = W - 22;
      const bH  = 62;
      const bB  = bT + bH;
      const barVals   = TYPES.map(t => totals[t]);
      const maxBar    = Math.max(...barVals, 1);
      const nBars     = LABELS.length;
      const barSlotW  = bW / nBars;
      const barWidth  = barSlotW * 0.55;
      const barColors = [
        [59, 130, 246], [245, 158, 11], [16, 185, 129],
        [236, 72, 153], [239, 68, 68], [139, 92, 246], [107, 114, 128],
      ] as const;

      // Grid lines + Y labels
      for (let gi = 0; gi <= 5; gi++) {
        const gy = bB - (gi / 5) * bH;
        sd(220, 220, 220); doc.setLineWidth(0.15);
        doc.line(bL, gy, bL + bW, gy);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(110, 110, 110);
        doc.text(((gi / 5) * maxBar).toFixed(0), bL - 2, gy + 1.5, { align: 'right' });
      }

      // Y-axis title (rotated)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(80, 80, 80);
      doc.text('Total Vehicle Count', bL - 9, bT + bH / 2, { angle: 90, align: 'center' });

      // Bars + value labels + X labels
      barVals.forEach((v, i) => {
        const bh = v > 0 ? (v / maxBar) * bH : 0;
        const bx = bL + i * barSlotW + (barSlotW - barWidth) / 2;
        const by = bB - bh;
        sf(barColors[i][0], barColors[i][1], barColors[i][2]);
        if (bh > 0) doc.rect(bx, by, barWidth, bh, 'F');
        doc.setFont('helvetica', 'bold');   doc.setFontSize(7); st(20, 30, 50);
        doc.text(String(v), bx + barWidth / 2, Math.min(by - 1.5, bB - 2), { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(60, 60, 60);
        const lbl = LABELS[i].length > 9 ? LABELS[i].slice(0, 6) + '.' : LABELS[i];
        doc.text(lbl, bx + barWidth / 2, bB + 5.5, { align: 'center' });
      });

      // Axes
      sd(70, 70, 70); doc.setLineWidth(0.6);
      doc.line(bL, bT, bL, bB);
      doc.line(bL, bB, bL + bW, bB);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); st(60, 60, 60);
      doc.text('Vehicle Type', bL + bW / 2, bB + 13, { align: 'center' });

      // Figure caption placed BELOW the chart
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Fig-1: Total Number of Vehicles in Survey', 105, bB + 21, { align: 'center' });

      y = bB + 29;

      // ══════════════════════════════════════════════════════════════════
      // PAGE 3 — Table 3 (Accumulation) + Fig-2 (Line Chart)
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); y = TM;

      // ── TABLE 3: Area under Parking Accumulation Curve ────────────────
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 3: Area under Parking Accumulation Curve', L, y); y += 6;

      // X(55) Y(55) Area(72) = 182
      const t3cW = [55, 55, 72];
      const t3TW = t3cW.reduce((a, b) => a + b, 0);
      const t3Top = y;

      sf(0, 51, 102);
      doc.rect(L, y, t3TW, RH + 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); st(255, 255, 255);
      cx = L;
      ['X — Time (min)', 'Y — ECS', 'Trapezoidal Area'].forEach((h, i) => {
        doc.text(h, cx + t3cW[i] / 2, y + 5.5, { align: 'center' }); cx += t3cW[i];
      });
      y += RH + 1;

      slotData.forEach((r, i) => {
        if (y + RH > PH - BM) { doc.addPage(); y = TM; }
        if (i % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, t3TW, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
        const t3Row = [
          String(slotTimes[i] ?? 0),
          r.ecs.toFixed(2),
          i === 0 ? '—' : trapAreas[i].toFixed(2),
        ];
        cx = L;
        t3Row.forEach((v, ci) => {
          doc.text(v, cx + t3cW[ci] / 2, y + 5, { align: 'center' }); cx += t3cW[ci];
        });
        hLine(L, L + t3TW, y + RH);
        y += RH;
      });

      // Total row
      if (y + RH + 2 > PH - BM) { doc.addPage(); y = TM; }
      sf(220, 230, 252);
      doc.rect(L, y, t3TW, RH + 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); st(20, 30, 50);
      cx = L;
      ['Total', totECS.toFixed(2), parkingLoad.toFixed(2)].forEach((v, ci) => {
        doc.text(v, cx + t3cW[ci] / 2, y + 6, { align: 'center' }); cx += t3cW[ci];
      });
      y += RH + 2;
      tableOutline(t3Top, y, t3cW);
      y += 5;

      // Parking Load annotation
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(0, 51, 102);
      doc.text(`Parking Load = ${parkingLoad.toFixed(2)} ECS·min`, L, y + 4);
      y += 12;

      // ── FIG-2: Parking Accumulation Curve (ECS vs Time) ───────────────
      if (y + 92 > PH - BM) { doc.addPage(); y = TM; }

      const lL  = L + 24;
      const lT  = y;
      const lW  = W - 30;
      const lH  = 68;
      const lB  = lT + lH;
      const ecsVals  = slotData.map(r => r.ecs);
      const maxE     = Math.max(...ecsVals, 1);
      const minE     = Math.min(...ecsVals, 0);
      const eRange   = Math.max(maxE - minE, 1);
      const ePad     = eRange * 0.12;
      const eMinPad  = minE - ePad;
      const eTRange  = eRange + 2 * ePad;

      // Y-axis grid + labels
      for (let gi = 0; gi <= 5; gi++) {
        const gv = eMinPad + (gi / 5) * eTRange;
        const gy = lB - (gi / 5) * lH;
        sd(220, 220, 220); doc.setLineWidth(0.15);
        doc.line(lL, gy, lL + lW, gy);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(100, 100, 100);
        doc.text(gv.toFixed(1), lL - 2, gy + 1.5, { align: 'right' });
      }

      // Y-axis rotated title
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(80, 80, 80);
      doc.text('No. of vehicles (ECS units)', lL - 13, lT + lH / 2, { angle: 90, align: 'center' });

      // Axes
      sd(70, 70, 70); doc.setLineWidth(0.6);
      doc.line(lL, lT, lL, lB);
      doc.line(lL, lB, lL + lW, lB);

      // Plot line + dots + data labels
      if (ecsVals.length >= 2) {
        const stepX = lW / (ecsVals.length - 1);
        const py = (v: number) => lB - ((v - eMinPad) / eTRange) * lH;
        const px = (i: number) => lL + i * stepX;

        sd(0, 102, 204); doc.setLineWidth(1.0);
        for (let i = 0; i < ecsVals.length - 1; i++) {
          doc.line(px(i), py(ecsVals[i]), px(i + 1), py(ecsVals[i + 1]));
        }

        sf(0, 102, 204);
        ecsVals.forEach((v, i) => {
          doc.circle(px(i), py(v), 1.5, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(20, 30, 50);
          doc.text(v.toFixed(2), px(i), py(v) - 3, { align: 'center' });
        });

        // X-axis time labels
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(70, 70, 70);
        slotTimes.forEach((t, i) => {
          doc.text(String(t), px(i), lB + 5.5, { align: 'center' });
        });
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); st(60, 60, 60);
      doc.text('Time Interval (min)', lL + lW / 2, lB + 13, { align: 'center' });

      // Figure caption BELOW the chart (title + subtitle)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Fig-2: Parking Accumulation Curve', 105, lB + 21, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(80, 80, 80);
      doc.text('ECS vs Time', 105, lB + 27, { align: 'center' });

      y = lB + 33;

      // ══════════════════════════════════════════════════════════════════
      // PAGE 4 — Table 4 (Statistics) + Conclusion
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); y = TM;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 4: Parking Statistics', L, y); y += 6;

      // Statistic(102) Values(56) Units(24) = 182
      const t4cW = [102, 56, 24];
      const t4TW = t4cW.reduce((a, b) => a + b, 0);
      const t4Top = y;

      sf(0, 51, 102);
      doc.rect(L, y, t4TW, RH + 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); st(255, 255, 255);
      cx = L;
      ['Parking Statistics', 'Values', 'Units'].forEach((h, i) => {
        doc.text(h, cx + t4cW[i] / 2, y + 5.5, { align: 'center' }); cx += t4cW[i];
      });
      y += RH + 1;

      const peakLabel = peakSlot
        ? `${peakSlot.start_time.slice(0, 5)}–${peakSlot.end_time.slice(0, 5)}`
        : '—';

      const t4Stats: [string, string, string][] = [
        ['Duration',                          String(durationMin),                                    'min'],
        ['Parking Supply',                     supply > 0 ? String(supply) : '—',                     'ecs'],
        ['Parking Load',                       parkingLoad.toFixed(2),                                'ecs*min'],
        ['Avg Parking Duration',               avgDurMin.toFixed(4),                                  'min'],
        ['Avg Parking Duration',               (avgDurMin / 60).toFixed(5),                           'hr'],
        ['Turn Over',                          na(turnover, 4),                                       ''],
        ['Capacity',                           capacity > 0 ? capacity.toFixed(0) : '—',              'ecs*min'],
        ['Parking Index',                      parkingIndex >= 0 ? parkingIndex.toFixed(2) + ' %' : '—', ''],
        ['Peak ECS',                           peakECS.toFixed(2),                                    'ecs'],
        ['Peak Slot',                          peakLabel,                                             ''],
        ['Occupancy',                          occupancy >= 0 ? occupancy.toFixed(2) + ' %' : '—',    ''],
      ];

      t4Stats.forEach(([stat, val, unit], i) => {
        if (y + RH > PH - BM) { doc.addPage(); y = TM; }
        if (i % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, t4TW, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
        doc.text(stat, L + 4, y + 5);
        doc.text(val,  L + t4cW[0] + t4cW[1] / 2, y + 5, { align: 'center' });
        doc.text(unit, L + t4cW[0] + t4cW[1] + t4cW[2] / 2, y + 5, { align: 'center' });
        hLine(L, L + t4TW, y + RH);
        y += RH;
      });
      tableOutline(t4Top, y, t4cW);
      y += 12;

      // ── Conclusion ────────────────────────────────────────────────────
      if (y + 30 > PH - BM) { doc.addPage(); y = TM; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); st(0, 51, 102);
      doc.text('Conclusion:', L, y); y += 8;

      let mainText = '';
      if (parkingIndex < 0) {
        mainText =
          'Parking Index could not be calculated because Parking Supply is not configured ' +
          'for this project. Set the "Area / Parking Supply" field in project settings to ' +
          'enable full statistical analysis.';
      } else if (parkingIndex < 50) {
        mainText = 'Parking demand is low and available parking supply is adequate.';
      } else if (parkingIndex <= 80) {
        mainText = 'Parking utilization is moderate and existing parking supply is sufficient.';
      } else {
        mainText =
          'Parking demand is approaching capacity. Additional parking management ' +
          'measures should be considered.';
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); st(20, 30, 50);
      const wrapped = doc.splitTextToSize(mainText, W);
      doc.text(wrapped, L, y);
      y += wrapped.length * 6 + 5;

      const bullets = [
        `Peak ECS: ${peakECS.toFixed(2)} ECS  (at slot ${peakLabel})`,
        `Parking Index: ${parkingIndex >= 0 ? parkingIndex.toFixed(2) + '%' : 'N/A — set Parking Supply in project settings'}`,
        `Average Parking Duration: ${avgDurMin.toFixed(2)} min  (${(avgDurMin / 60).toFixed(4)} hrs)`,
        `Total Vehicles Surveyed: ${totalVehicles}`,
      ];
      bullets.forEach(b => {
        if (y + 8 > PH - BM) { doc.addPage(); y = TM; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); st(20, 30, 50);
        doc.text(`• ${b}`, L + 4, y); y += 7;
      });

      doc.save(`${project.project_name}_Parking_Survey_Report.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  }

  // ── Derived preview stats ───────────────────────────────────────────────
  const piDisplay  = parkingIndex >= 0 ? `${parkingIndex.toFixed(1)}%` : 'N/A';
  const piColor    =
    parkingIndex < 0  ? 'text-slate-500' :
    parkingIndex < 50 ? 'text-emerald-600' :
    parkingIndex <= 80 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Report Generator</h1>
          <p className="text-sm text-slate-500">{project.project_name}</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* PDF */}
        <button
          onClick={generatePDF}
          disabled={generating}
          className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group disabled:opacity-50"
        >
          <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating
              ? <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              : <FileText className="w-6 h-6 text-red-500" />}
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">PDF Report</h3>
          <p className="text-sm text-slate-500">
            NIT Warangal format — 4-page report with ECS tables, accumulation curve, bar/line charts and parking statistics
          </p>
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm font-medium">
            <Download className="w-4 h-4" /> Download PDF
          </div>
        </button>

        {/* CSV */}
        <button
          onClick={generateCSV}
          className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Excel / CSV Data</h3>
          <p className="text-sm text-slate-500">
            Slot-wise vehicle count data (Two Wheeler, Auto, Car, LCV, Bus, Truck, Others, ECS) for further analysis
          </p>
          <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <Download className="w-4 h-4" /> Download CSV
          </div>
        </button>
      </div>

      {/* Report Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Report Preview</h3>
        <div className="space-y-3">
          {/* Page 1 */}
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-blue-800">
            <h4 className="font-medium text-slate-900 mb-1">Page 1 — Project Details</h4>
            <p className="text-sm text-slate-500">
              {project.project_name} · {project.location_name ?? 'No location'} · {project.survey_date}
              &nbsp;|&nbsp; {project.start_time} – {project.end_time}
              &nbsp;|&nbsp; Interval: {project.survey_interval_minutes} min
            </p>
          </div>

          {/* Page 2 */}
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-indigo-500">
            <h4 className="font-medium text-slate-900 mb-1">Page 2 — Volume Tables + Bar Chart</h4>
            <p className="text-sm text-slate-500">
              Table 1: ECS Values (IRC SP 12)&nbsp;·&nbsp;
              Table 2: Slot-wise counts ({slots.length} slots, Total ECS = {totECS.toFixed(2)})&nbsp;·&nbsp;
              Fig-1: Vehicle type bar chart
            </p>
          </div>

          {/* Page 3 */}
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-teal-500">
            <h4 className="font-medium text-slate-900 mb-1">Page 3 — Accumulation Curve</h4>
            <p className="text-sm text-slate-500">
              Table 3: Trapezoidal area (Parking Load = {parkingLoad.toFixed(2)} ECS·min)&nbsp;·&nbsp;
              Fig-2: ECS vs Time line chart
            </p>
          </div>

          {/* Page 4 */}
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-amber-500">
            <h4 className="font-medium text-slate-900 mb-1">Page 4 — Statistics &amp; Conclusion</h4>
            <p className="text-sm text-slate-500">
              Table 4: Duration, Parking Load, Avg Duration ({avgDurMin.toFixed(2)} min),
              Peak ECS ({peakECS.toFixed(2)}), Parking Index&nbsp;
              <span className={`font-semibold ${piColor}`}>{piDisplay}</span>
              {supply <= 0 && (
                <span className="ml-2 text-amber-600 text-xs">
                  ⚠ Set "Area / Parking Supply" in project settings to compute Parking Index
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
