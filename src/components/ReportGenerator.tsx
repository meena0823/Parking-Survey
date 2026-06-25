import { useEffect, useState } from 'react';
import { getSlots, getCaptures } from '../lib/database';
import type { SurveyProject, SurveySlot, VehicleCapture } from '../lib/types';
import { FileText, Download, ArrowLeft, Loader2, X } from 'lucide-react';

interface Props { project: SurveyProject | null; onBack?: () => void; }

// ── IRC SP-12 report vehicle categories ────────────────────────────────────
const REPORT_TYPES = [
  'two_wheeler', 'car_taxi', 'auto_rickshaw', 'bicycle',
  'trucks_buses', 'emergency', 'rickshaw',
] as const;
type ReportVType = typeof REPORT_TYPES[number];

interface ParkingSupplyInputs {
  spaces: Record<ReportVType, number>;
  fFactor: number;
}

const REPORT_LABELS: Record<ReportVType, string> = {
  two_wheeler:   'Two Wheeler',
  car_taxi:      'Car/Taxi',
  auto_rickshaw: 'Auto Rickshaw',
  bicycle:       'Bicycle',
  trucks_buses:  'Trucks/Buses',
  emergency:     'Emergency Vehicles',
  rickshaw:      'Rickshaw',
};

const ECS_F: Record<ReportVType, number> = {
  two_wheeler: 0.25, car_taxi: 1.00, auto_rickshaw: 0.50, bicycle: 0.10,
  trucks_buses: 2.50, emergency: 2.50, rickshaw: 0.80,
};

const T1_ROWS: [string, string][] = [
  ['Two Wheeler', '0.25'], ['Car/Taxi', '1.00'], ['Auto Rickshaw', '0.50'],
  ['Bicycle', '0.10'], ['Trucks/Buses', '2.50'], ['Emergency Vehicles', '2.50'],
  ['Rickshaw', '0.80'],
];

function emptySpaceForm(): Record<ReportVType, string> {
  return {
    two_wheeler: '', car_taxi: '', auto_rickshaw: '', bicycle: '',
    trucks_buses: '', emergency: '', rickshaw: '',
  };
}

function computeTurnoverAndSupply(
  totals: Record<ReportVType, number>,
  durByType: Record<ReportVType, number | null>,
  numSessions: number,
  spaces: Record<ReportVType, number>,
  fFactor: number,
  surveyDurationHours: number,
) {
  const turnoverByType = {} as Record<ReportVType, number | null>;
  const supplyByType = {} as Record<ReportVType, number | null>;

  REPORT_TYPES.forEach(t => {
    const sp = spaces[t];
    const count = totals[t];
    if (sp <= 0) {
      turnoverByType[t] = null;
      supplyByType[t] = null;
      return;
    }
    turnoverByType[t] = numSessions > 0 ? count / (sp * numSessions) : null;
    const durHr = durByType[t] != null ? durByType[t]! / 60 : 0;
    supplyByType[t] = durHr > 0
      ? (sp * surveyDurationHours / durHr) * fFactor
      : null;
  });

  const totalParkingSupply = REPORT_TYPES.reduce(
    (s, t) => s + (supplyByType[t] ?? 0), 0,
  );
  return { turnoverByType, supplyByType, totalParkingSupply };
}

function validateSupplyForm(
  spaceForm: Record<ReportVType, string>,
  fFactorStr: string,
): { valid: boolean; spaces?: Record<ReportVType, number>; fFactor?: number } {
  const spaces = {} as Record<ReportVType, number>;
  for (const t of REPORT_TYPES) {
    const raw = spaceForm[t].trim();
    if (raw === '') return { valid: false };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { valid: false };
    spaces[t] = n;
  }
  const fRaw = fFactorStr.trim();
  if (fRaw === '') return { valid: false };
  const fFactor = Number(fRaw);
  if (!Number.isFinite(fFactor) || fFactor < 0.85 || fFactor > 0.95) return { valid: false };
  return { valid: true, spaces, fFactor };
}

function emptyCounts(): Record<ReportVType, number> {
  return {
    two_wheeler: 0, car_taxi: 0, auto_rickshaw: 0, bicycle: 0,
    trucks_buses: 0, emergency: 0, rickshaw: 0,
  };
}

function mapCaptureToReportType(c: VehicleCapture): ReportVType {
  if (c.detailed_vehicle_type?.toLowerCase() === 'bicycle') return 'bicycle';
  switch (c.vehicle_type) {
    case 'car':   return 'car_taxi';
    case 'auto':  return 'auto_rickshaw';
    case 'bus':
    case 'truck':
    case 'lcv':   return 'trucks_buses';
    case 'others': return 'rickshaw';
    default:      return 'two_wheeler';
  }
}

function utilizationCategory(index: number): string {
  if (index < 0) return '—';
  if (index <= 60) return 'Under Utilized';
  if (index <= 80) return 'Moderate';
  if (index <= 90) return 'High Utilization';
  return 'Saturated';
}

function parkingDurationMin(
  slotCounts: Record<ReportVType, number>[],
  type: ReportVType,
  intervalMin: number,
): number | null {
  let weighted = 0;
  let total = 0;
  slotCounts.forEach((counts, i) => {
    const n = counts[type];
    weighted += n * (i + 1);
    total += n;
  });
  if (total === 0) return null;
  return (weighted * intervalMin) / total;
}

export default function ReportGenerator({ project, onBack }: Props) {
  const [slots,    setSlots]    = useState<SurveySlot[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [spaceForm, setSpaceForm] = useState(emptySpaceForm);
  const [fFactorForm, setFFactorForm] = useState('0.90');
  const [formError, setFormError] = useState('');

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

  const totalVehicles = captures.length;
  const numSessions = slots.length;
  const durationMin = numSessions * project.survey_interval_minutes;

  const slotData = slots.map(slot => {
    const sc = captures.filter(c => c.slot_id === slot.id);
    const counts = emptyCounts();
    sc.forEach(c => { counts[mapCaptureToReportType(c)]++; });
    const ecs = REPORT_TYPES.reduce((s, t) => s + counts[t] * ECS_F[t], 0);
    return { slot, counts, ecs };
  });

  const slotTimes = slotData.map((_, i) => project.survey_interval_minutes * (i + 1));
  const trapAreas = slotData.map((r, i) =>
    i === 0 ? 0 : (project.survey_interval_minutes / 2) * (slotData[i - 1].ecs + r.ecs),
  );
  const parkingLoad = trapAreas.reduce((s, a) => s + a, 0);
  const peakECS = slotData.length > 0 ? Math.max(...slotData.map(r => r.ecs)) : 0;
  const totECS = slotData.reduce((s, r) => s + r.ecs, 0);
  const avgDurMin = totECS > 0 ? parkingLoad / totECS : 0;
  const avgDurHr = avgDurMin / 60;

  const totals = emptyCounts();
  slotData.forEach(r => {
    REPORT_TYPES.forEach(t => { totals[t] += r.counts[t]; });
  });

  const peakIdx = slotData.findIndex(r => r.ecs === peakECS);
  const peakSlot = peakIdx >= 0 ? slotData[peakIdx].slot : null;
  const peakLabel = peakSlot
    ? `${peakSlot.start_time.slice(0, 5)}–${peakSlot.end_time.slice(0, 5)}`
    : '—';

  const slotCountsOnly = slotData.map(r => r.counts);
  const durByType = Object.fromEntries(
    REPORT_TYPES.map(t => [t, parkingDurationMin(slotCountsOnly, t, project.survey_interval_minutes)]),
  ) as Record<ReportVType, number | null>;

  const dominantType = REPORT_TYPES.reduce((best, t) =>
    totals[t] > totals[best] ? t : best, REPORT_TYPES[0]);

  const formValidation = validateSupplyForm(spaceForm, fFactorForm);

  function generateCSV() {
    if (!project) return;
    const header = ['Slot', 'Start', 'End', ...REPORT_TYPES.map(t => REPORT_LABELS[t]), 'ECS'];
    const rows = [header.join(',')];
    slotData.forEach(r => {
      rows.push([
        `S${r.slot.slot_number}`,
        r.slot.start_time, r.slot.end_time,
        ...REPORT_TYPES.map(t => r.counts[t]),
        r.ecs.toFixed(2),
      ].join(','));
    });
    rows.push(['Total', '', '', ...REPORT_TYPES.map(t => totals[t]), totECS.toFixed(2)].join(','));
    downloadFile(rows.join('\n'), `${project.project_name}_data.csv`, 'text/csv');
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function generatePDF(inputs: ParkingSupplyInputs) {
    if (!project) return;
    setGenerating(true);
    setShowSupplyModal(false);
    try {
      const { turnoverByType, supplyByType, totalParkingSupply } = computeTurnoverAndSupply(
        totals, durByType, numSessions, inputs.spaces, inputs.fFactor, project.survey_duration_hours,
      );
      const table8ParkingIndex = totalParkingSupply > 0 && durationMin > 0
        ? (parkingLoad / (totalParkingSupply * durationMin)) * 100
        : -1;
      const table8UtilCategory = utilizationCategory(table8ParkingIndex);
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      let headerImg: { dataUrl: string; aspect: number } | null = null;
      try {
        const resp = await fetch('/images/NITW_logo_telugu3.png');
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
            const img = new Image();
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = rej;
            img.src = dataUrl;
          });
          headerImg = { dataUrl, aspect: dims.w / dims.h };
        }
      } catch (_) { /* header unavailable — continue without it */ }

      const L  = 14;
      const PW = 210;
      const PH = 297;
      const R  = PW - L;
      const W  = R - L;
      const TM = 15;
      const BM = 18;
      const RH = 7;

      const sf = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
      const st = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
      const sd = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);
      let y = TM;
      let cx = L;

      function normCW(colWidths: number[]): number[] {
        const sum = colWidths.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - W) < 0.01) return colWidths;
        return colWidths.map(c => (c / sum) * W);
      }

      function hLine(startX: number, endX: number, yy: number, w = 0.2) {
        sd(160, 180, 215); doc.setLineWidth(w);
        doc.line(startX, yy, endX, yy);
      }

      function tableOutline(tableTop: number, tableBottom: number, colWidths: number[]) {
        if (tableBottom <= tableTop) return;
        const cw = normCW(colWidths);
        sd(140, 165, 210); doc.setLineWidth(0.5);
        doc.rect(L, tableTop, W, tableBottom - tableTop, 'S');
        let vx = L;
        cw.forEach(c => { doc.line(vx, tableTop, vx, tableBottom); vx += c; });
        doc.line(vx, tableTop, vx, tableBottom);
      }

      function drawHeaderRow(colWidths: number[], headers: string[], rowH = RH + 1) {
        const cw = normCW(colWidths);
        sf(0, 51, 102);
        doc.rect(L, y, W, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(255, 255, 255);
        cx = L;
        headers.forEach((h, i) => {
          const lines = h.split('\n');
          if (lines.length > 1) {
            doc.text(lines[0], cx + cw[i] / 2, y + 3.5, { align: 'center' });
            doc.text(lines[1], cx + cw[i] / 2, y + 7.5, { align: 'center' });
          } else {
            doc.text(h, cx + cw[i] / 2, y + 5.5, { align: 'center' });
          }
          cx += cw[i];
        });
        y += rowH;
      }

      function drawStripedRow(colWidths: number[], values: string[], idx: number) {
        const cw = normCW(colWidths);
        if (idx % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, W, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(20, 30, 50);
        cx = L;
        values.forEach((v, i) => {
          doc.text(v, cx + cw[i] / 2, y + 5, { align: 'center' });
          cx += cw[i];
        });
        hLine(L, L + W, y + RH);
        y += RH;
      }

      function drawTotalRow(colWidths: number[], values: string[]) {
        const cw = normCW(colWidths);
        sf(220, 230, 252);
        doc.rect(L, y, W, RH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(20, 30, 50);
        cx = L;
        values.forEach((v, i) => {
          doc.text(v, cx + cw[i] / 2, y + 5, { align: 'center' });
          cx += cw[i];
        });
        hLine(L, L + W, y + RH);
        y += RH;
      }

      function drawLeftAlignedRow(
        colWidths: number[],
        label: string,
        value: string,
        unit: string,
        idx: number,
      ) {
        const cw = normCW(colWidths);
        if (idx % 2 === 0) sf(255, 255, 255); else sf(241, 245, 255);
        doc.rect(L, y, W, RH, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
        doc.text(label, L + 4, y + 5);
        doc.text(value, L + cw[0] + cw[1] / 2, y + 5, { align: 'center' });
        doc.text(unit, L + cw[0] + cw[1] + cw[2] / 2, y + 5, { align: 'center' });
        hLine(L, L + W, y + RH);
        y += RH;
      }

      function drawSampleCalc(text: string) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
        const lines = doc.splitTextToSize(text, W) as string[];
        lines.forEach((line: string) => { doc.text(line, L, y); y += 5; });
        y += 6;
      }

      /** Draw a table; splits across pages with a closed border per page section. */
      function drawBorderedTable(
        colWidths: number[],
        headers: string[],
        rows: string[][],
        opts?: { totalRow?: string[]; headerH?: number },
      ) {
        const cw = normCW(colWidths);
        const headerH = opts?.headerH ?? RH + 1;
        let tableTop = -1;
        let stripeIdx = 0;

        function openSection(withHeader: boolean) {
          tableTop = y;
          if (withHeader) drawHeaderRow(cw, headers, headerH);
        }

        function closeSection() {
          if (tableTop >= 0) {
            tableOutline(tableTop, y, cw);
            tableTop = -1;
          }
        }

        openSection(true);

        for (const row of rows) {
          if (y + RH > PH - BM) {
            closeSection();
            doc.addPage();
            y = TM;
            openSection(true);
          }
          drawStripedRow(cw, row, stripeIdx++);
        }

        if (opts?.totalRow) {
          if (y + RH > PH - BM) {
            closeSection();
            doc.addPage();
            y = TM;
            openSection(true);
          }
          drawTotalRow(cw, opts.totalRow);
        }

        closeSection();
        y += 6;
      }

      function ensureSpace(need: number) {
        if (y + need > PH - BM) { doc.addPage(); y = TM; }
      }

      // ══ PAGE 1 — Header + PROJECT DETAILS + table (grouped at top) ═════
      const tableW = W * 0.925;
      const tableL = L + (W - tableW) / 2;
      const dW1 = tableW * (72 / W);
      const dW2 = tableW - dW1;
      const detailRows: [string, string][] = [
        ['Project Name',      project.project_name],
        ['Location',          project.location_name ?? '—'],
        ['Survey Date',       project.survey_date],
        ['Survey Start Time', project.start_time],
        ['Survey End Time',   project.end_time],
        ['Survey Duration',   `${project.survey_duration_hours} hours  (${durationMin} min)`],
        ['Survey Interval',   `${project.survey_interval_minutes} minutes`],
      ];

      const detailRowHeights = detailRows.map(([, val]) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        const valLines = doc.splitTextToSize(val, dW2 - 6) as string[];
        return valLines.length <= 1 ? (RH + 1) : valLines.length * 5 + 4;
      });

      const headerTopY = TM;
      const gapHeaderTitle = 20;  // ~18 px
      const gapTitleTable = 10;   // ~18 px
      const headingLineH = 5;

      let headerDrawH = 0;
      let headerDrawW = tableW;
      let headerDrawX = tableL;

      if (headerImg) {
        headerDrawH = tableW / headerImg.aspect;
        const minHmm = 22;
        const maxHmm = 30;
        if (headerDrawH < minHmm) headerDrawH = minHmm;
        if (headerDrawH > maxHmm) headerDrawH = maxHmm;
        headerDrawW = headerDrawH * headerImg.aspect;
        headerDrawX = L + (W - headerDrawW) / 2;
      }

      if (headerImg) {
        doc.addImage(headerImg.dataUrl, 'PNG', headerDrawX, headerTopY, headerDrawW, headerDrawH);
      }

      y = headerTopY + headerDrawH + gapHeaderTitle;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      st(0, 51, 102);
      doc.text('PROJECT DETAILS', PW / 2, y, { align: 'center' });
      y += headingLineH + gapTitleTable;

      const detTop = y;
      detailRows.forEach(([lbl, val], i) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        const valLines = doc.splitTextToSize(val, dW2 - 6) as string[];
        const rowH = detailRowHeights[i];
        if (i % 2 === 0) sf(248, 250, 255); else sf(255, 255, 255);
        doc.rect(tableL, y, tableW, rowH, 'F');
        sf(228, 234, 252);
        doc.rect(tableL, y, dW1, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); st(25, 50, 100);
        doc.text(lbl, tableL + 3, y + 5.5);
        doc.setFont('helvetica', 'normal'); st(20, 30, 50);
        valLines.forEach((line: string, li: number) => {
          doc.text(line, tableL + dW1 + 3, y + 5.5 + li * 5);
        });
        hLine(tableL, tableL + tableW, y + rowH);
        y += rowH;
      });
      sd(140, 165, 210); doc.setLineWidth(0.5);
      doc.rect(tableL, detTop, tableW, y - detTop, 'S');
      let vx = tableL;
      [dW1, dW2].forEach(cw => { doc.line(vx, detTop, vx, y); vx += cw; });
      doc.line(vx, detTop, vx, y);

      // ══ PAGE 2 — Table 1 + Table 2 + Sample ECS + Fig-1 ═══════════════
      doc.addPage(); y = TM;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 1: ECS Values as per IRC SP-12', L, y); y += 6;

      const t1cW = [W / 2, W / 2];
      const t1Top = y;
      sf(0, 51, 102);
      doc.rect(L, y, W, RH + 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); st(255, 255, 255);
      doc.text('Vehicle Type', L + t1cW[0] / 2, y + 5.5, { align: 'center' });
      doc.text('ECS Factor',   L + t1cW[0] + t1cW[1] / 2, y + 5.5, { align: 'center' });
      y += RH + 1;

      T1_ROWS.forEach(([vt, ecs], i) => {
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

      ensureSpace(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 2: Total Volume in ECS', L, y); y += 6;

      const t2cW = [22, 20, 20, 20, 20, 20, 20, 20, 20];
      const t2Rows = slotData.map(r => [
        `${r.slot.start_time.slice(0, 5)}-${r.slot.end_time.slice(0, 5)}`,
        ...REPORT_TYPES.map(t => String(r.counts[t])),
        r.ecs.toFixed(2),
      ]);
      drawBorderedTable(t2cW, [
        'Slot', 'Two\nWheeler', 'Car/Taxi', 'Auto\nRickshaw', 'Bicycle',
        'Trucks/\nBuses', 'Emergency\nVehicles', 'Rickshaw', 'ECS',
      ], t2Rows, {
        headerH: RH + 3,
        totalRow: ['Total', ...REPORT_TYPES.map(t => String(totals[t])), totECS.toFixed(2)],
      });

      if (slotData.length > 0) {
        const first = slotData[0];
        const c = first.counts;
        const ecsTerms = REPORT_TYPES.map(t => `(${c[t]} × ${ECS_F[t].toFixed(2)})`).join(' + ');
        drawSampleCalc(`Sample Calculation: ECS = ${ecsTerms} = ${first.ecs.toFixed(2)} ECS`);
      }

      ensureSpace(86);
      const bL = L + 18, bT = y, bW = W - 22, bH = 62, bB = bT + bH;
      const barVals = REPORT_TYPES.map(t => totals[t]);
      const maxBar = Math.max(...barVals, 1);
      const barLabels = REPORT_TYPES.map(t => REPORT_LABELS[t]);
      const barSlotW = bW / barLabels.length;
      const barWidth = barSlotW * 0.55;
      const barColors = [
        [59, 130, 246], [16, 185, 129], [245, 158, 11], [132, 204, 22],
        [239, 68, 68], [139, 92, 246], [107, 114, 128],
      ] as const;

      for (let gi = 0; gi <= 5; gi++) {
        const gy = bB - (gi / 5) * bH;
        sd(220, 220, 220); doc.setLineWidth(0.15);
        doc.line(bL, gy, bL + bW, gy);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(110, 110, 110);
        doc.text(((gi / 5) * maxBar).toFixed(0), bL - 2, gy + 1.5, { align: 'right' });
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(80, 80, 80);
      doc.text('Total Vehicle Count', bL - 9, bT + bH / 2, { angle: 90, align: 'center' });

      barVals.forEach((v, i) => {
        const bh = v > 0 ? (v / maxBar) * bH : 0;
        const bx = bL + i * barSlotW + (barSlotW - barWidth) / 2;
        const by = bB - bh;
        sf(barColors[i][0], barColors[i][1], barColors[i][2]);
        if (bh > 0) doc.rect(bx, by, barWidth, bh, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); st(20, 30, 50);
        doc.text(String(v), bx + barWidth / 2, Math.min(by - 1.5, bB - 2), { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); st(60, 60, 60);
        const lbl = barLabels[i].length > 10 ? barLabels[i].slice(0, 8) + '..' : barLabels[i];
        doc.text(lbl, bx + barWidth / 2, bB + 5.5, { align: 'center' });
      });

      sd(70, 70, 70); doc.setLineWidth(0.6);
      doc.line(bL, bT, bL, bB);
      doc.line(bL, bB, bL + bW, bB);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); st(60, 60, 60);
      doc.text('Vehicle Type', bL + bW / 2, bB + 13, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Fig-1: Total Number of Vehicles in Survey', 105, bB + 21, { align: 'center' });
      y = bB + 29;

      // ══ PAGE 3 — Table 3 + Fig-2 ══════════════════════════════════════
      doc.addPage(); y = TM;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 3: Area under Parking Accumulation Curve', L, y); y += 6;

      const t3cW = [55, 55, 72];
      const t3Rows = slotData.map((r, i) => [
        String(slotTimes[i] ?? 0),
        r.ecs.toFixed(2),
        i === 0 ? '—' : trapAreas[i].toFixed(2),
      ]);
      drawBorderedTable(t3cW, ['X – Time (Minutes)', 'Y – ECS', 'Trapezoidal Area'], t3Rows, {
        totalRow: ['Total', totECS.toFixed(2), parkingLoad.toFixed(2)],
      });

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(0, 51, 102);
      doc.text(`Parking Load = ${parkingLoad.toFixed(2)} ecs-min`, L, y);
      y += 8;

      if (slotData.length > 1) {
        const i = 1;
        drawSampleCalc(
          `Sample Calculation: ((${slotTimes[i]} - ${slotTimes[i - 1]}) / 2) × (${slotData[i - 1].ecs.toFixed(2)} + ${slotData[i].ecs.toFixed(2)}) = ${trapAreas[i].toFixed(2)} ecs-min`,
        );
      }

      ensureSpace(92);
      const lL = L + 24, lT = y, lW = W - 30, lH = 68, lB = lT + lH;
      const ecsVals = slotData.map(r => r.ecs);
      const maxE = Math.max(...ecsVals, 1);
      const minE = Math.min(...ecsVals, 0);
      const eRange = Math.max(maxE - minE, 1);
      const ePad = eRange * 0.12;
      const eMinPad = minE - ePad;
      const eTRange = eRange + 2 * ePad;

      for (let gi = 0; gi <= 5; gi++) {
        const gv = eMinPad + (gi / 5) * eTRange;
        const gy = lB - (gi / 5) * lH;
        sd(220, 220, 220); doc.setLineWidth(0.15);
        doc.line(lL, gy, lL + lW, gy);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(100, 100, 100);
        doc.text(gv.toFixed(1), lL - 2, gy + 1.5, { align: 'right' });
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(80, 80, 80);
      doc.text('No. of vehicles (ECS units)', lL - 13, lT + lH / 2, { angle: 90, align: 'center' });
      sd(70, 70, 70); doc.setLineWidth(0.6);
      doc.line(lL, lT, lL, lB);
      doc.line(lL, lB, lL + lW, lB);

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
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(70, 70, 70);
        slotTimes.forEach((t, i) => {
          doc.text(String(t), px(i), lB + 5.5, { align: 'center' });
        });
      }

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); st(60, 60, 60);
      doc.text('Time Interval (min)', lL + lW / 2, lB + 13, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Fig-2: Parking Accumulation Curve', 105, lB + 21, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(80, 80, 80);
      doc.text('ECS vs Time', 105, lB + 27, { align: 'center' });
      y = lB + 33;

      // ══ PAGE 4 — Table 4 ════════════════════════════════════════════════
      doc.addPage(); y = TM;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 4: Parking Statistics', L, y); y += 6;

      const t4cW = [102, 56, 24];
      const t4Top = y;
      drawHeaderRow(t4cW, ['Parking Statistics', 'Values', 'Units']);

      const t4Stats: [string, string, string][] = [
        ['Duration',             String(durationMin),     'Min'],
        ['Parking Load',         parkingLoad.toFixed(2),  'ECS-min'],
        ['Avg Parking Duration', avgDurMin.toFixed(2),    'Min'],
        ['Avg Parking Duration', avgDurHr.toFixed(5),     'Hr'],
        ['No. of Sessions',      String(numSessions),     '-'],
        ['Peak ECS',             peakECS.toFixed(2),      'ECS'],
        ['Peak Slot',            peakLabel,               '-'],
      ];

      t4Stats.forEach(([stat, val, unit], i) => {
        drawLeftAlignedRow(t4cW, stat, val, unit, i);
      });
      tableOutline(t4Top, y, t4cW);
      y += 8;

      if (totECS > 0) {
        drawSampleCalc(
          `Sample Calculation: ${parkingLoad.toFixed(2)} / ${totECS.toFixed(2)} = ${avgDurMin.toFixed(2)} min`,
        );
      }

      // ══ PAGE 5 — Table 5 ════════════════════════════════════════════════
      ensureSpace(40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 5: Parking Duration', L, y); y += 6;

      const t5cW = [46, 36, 50, 50];
      const t5Rows = REPORT_TYPES.map(t => {
        const count = totals[t];
        const durMin = durByType[t];
        if (count === 0) {
          return [REPORT_LABELS[t], '0', 'No Vehicles', 'No Vehicles'];
        }
        return [REPORT_LABELS[t], String(count), durMin!.toFixed(2), (durMin! / 60).toFixed(2)];
      });
      drawBorderedTable(t5cW, [
        'Vehicle Type', 'Vehicle Count', 'Parking Duration (Min)', 'Parking Duration (Hr)',
      ], t5Rows);

      const sampleType5 = REPORT_TYPES.find(t => totals[t] > 0);
      if (sampleType5 && durByType[sampleType5] != null) {
        const weightedTerms = slotCountsOnly
          .map((c, i) => `(${c[sampleType5]}×${i + 1})`)
          .join(' + ');
        const dur5 = durByType[sampleType5]!;
        drawSampleCalc(
          `Sample Calculation: [${weightedTerms}] × ${project.survey_interval_minutes} / ${totals[sampleType5]} = ${dur5.toFixed(2)} min = ${(dur5 / 60).toFixed(2)} hr`,
        );
      }

      // ══ PAGE 6 — Parking Supply Inputs + Table 6 + Table 7 ═════════════
      ensureSpace(40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Parking Supply Inputs', L, y); y += 6;

      const psiW = [W / 2, W / 2];
      const psiTop = y;
      drawHeaderRow(psiW, ['Vehicle Type', 'Available Spaces']);
      REPORT_TYPES.forEach((t, i) => {
        drawStripedRow(psiW, [
          REPORT_LABELS[t],
          inputs.spaces[t] === 0 ? '0 (No Spaces Available)' : String(inputs.spaces[t]),
        ], i);
      });
      sf(248, 250, 255);
      doc.rect(L, y, W, RH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); st(20, 30, 50);
      doc.text('F Factor', L + 4, y + 5);
      doc.text(String(inputs.fFactor), L + psiW[0] + psiW[1] / 2, y + 5, { align: 'center' });
      hLine(L, L + W, y + RH);
      y += RH;
      tableOutline(psiTop, y, psiW);
      y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); st(80, 80, 80);
      doc.text('F = Insufficiency Factor (recommended range: 0.85 to 0.95)', L, y);
      y += 10;

      ensureSpace(40);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 6: Turn Over', L, y); y += 6;

      const t6cW = [46, 36, 50, 50];
      const t6Rows = REPORT_TYPES.map(t => {
        const count = totals[t];
        const sp = inputs.spaces[t];
        if (sp <= 0) {
          return [REPORT_LABELS[t], String(count), '0', 'No Spaces Available'];
        }
        if (numSessions <= 0) {
          return [REPORT_LABELS[t], String(count), String(sp), '—'];
        }
        if (count === 0) {
          return [REPORT_LABELS[t], '0', String(sp), '0.0000'];
        }
        return [REPORT_LABELS[t], String(count), String(sp), turnoverByType[t]!.toFixed(4)];
      });
      drawBorderedTable(t6cW, [
        'Vehicle Type', 'Vehicle Count', 'Available Spaces', 'Turn Over (veh/space/session)',
      ], t6Rows);

      const sampleTurnoverType = REPORT_TYPES.find(t => inputs.spaces[t] > 0 && totals[t] > 0);
      if (sampleTurnoverType && turnoverByType[sampleTurnoverType] != null) {
        drawSampleCalc(
          `Sample Calculation: ${totals[sampleTurnoverType]} / (${inputs.spaces[sampleTurnoverType]} × ${numSessions}) = ${turnoverByType[sampleTurnoverType]!.toFixed(4)} veh/space/session`,
        );
      }

      ensureSpace(50);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 7: Parking Supply', L, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); st(20, 30, 50);
      doc.text(`Survey Duration (Hours): ${project.survey_duration_hours}`, L, y); y += 5;
      doc.text(`F Factor: ${inputs.fFactor}  (Recommended range: 0.85 to 0.95)`, L, y); y += 6;

      const t7cW = [W / 2, W / 2];
      const t7Rows = REPORT_TYPES.map(t => {
        const sp = inputs.spaces[t];
        const val = supplyByType[t];
        if (sp <= 0) return [REPORT_LABELS[t], 'No Spaces Available'];
        if (val == null) return [REPORT_LABELS[t], 'No Vehicles'];
        return [REPORT_LABELS[t], val.toFixed(2)];
      });
      drawBorderedTable(t7cW, ['Vehicle Type', 'Parking Supply'], t7Rows);

      const sampleSupplyType = REPORT_TYPES.find(
        t => inputs.spaces[t] > 0 && supplyByType[t] != null,
      );
      if (sampleSupplyType && supplyByType[sampleSupplyType] != null) {
        const durHr = durByType[sampleSupplyType]! / 60;
        drawSampleCalc(
          `Sample Calculation: (${inputs.spaces[sampleSupplyType]} × ${project.survey_duration_hours} / ${durHr.toFixed(2)}) × ${inputs.fFactor} = ${supplyByType[sampleSupplyType]!.toFixed(2)} vehicles`,
        );
      }

      // ══ PAGE 7 — Table 8 + Conclusion ═══════════════════════════════════
      doc.addPage(); y = TM;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); st(0, 51, 102);
      doc.text('Table 8: Parking Index', L, y); y += 6;

      const t8cW = [W / 2, W / 2];
      const t8Rows = [
        ['Parking Load',         parkingLoad.toFixed(2)],
        ['Parking Supply',       totalParkingSupply.toFixed(2)],
        ['Survey Duration',      `${durationMin} min`],
        ['Parking Index',        table8ParkingIndex >= 0 ? `${table8ParkingIndex.toFixed(2)} %` : '—'],
        ['Utilization Category', table8UtilCategory],
      ];
      drawBorderedTable(t8cW, ['Parameter', 'Value'], t8Rows.map(r => r));

      if (table8ParkingIndex >= 0) {
        drawSampleCalc(
          `Sample Calculation: (${parkingLoad.toFixed(2)} / (${totalParkingSupply.toFixed(2)} × ${durationMin})) × 100 = ${table8ParkingIndex.toFixed(2)}%`,
        );
      }

      ensureSpace(50);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); st(0, 51, 102);
      doc.text('Conclusion:', L, y); y += 8;

      const typeSummary = REPORT_TYPES
        .filter(t => totals[t] > 0)
        .map(t => `${totals[t]} ${REPORT_LABELS[t].toLowerCase()}${totals[t] !== 1 ? 's' : ''}`)
        .join(', ');

      const totalTurnoverAll = REPORT_TYPES.reduce((s, t) => {
        const sp = inputs.spaces[t];
        if (sp > 0 && numSessions > 0) return s + totals[t] / (sp * numSessions);
        return s;
      }, 0);

      const conclusionText =
        `The parking survey recorded a total of ${totalVehicles} vehicles` +
        (typeSummary ? ` (${typeSummary})` : '') +
        ` during the study period spanning ${durationMin} minutes across ${numSessions} survey intervals. ` +
        `The dominant vehicle category was ${REPORT_LABELS[dominantType]}. ` +
        `The peak parking accumulation observed was ${peakECS.toFixed(2)} ECS during the ${peakLabel} interval. ` +
        `The parking load was ${parkingLoad.toFixed(2)} ecs-min. ` +
        `The average parking duration was ${avgDurHr.toFixed(2)} hours (${avgDurMin.toFixed(2)} minutes). ` +
        (totalTurnoverAll > 0
          ? `The turnover analysis indicates ${totalTurnoverAll >= 1 ? 'efficient' : 'moderate'} utilization of parking spaces across vehicle categories. `
          : '') +
        (table8ParkingIndex >= 0
          ? `The parking index of ${table8ParkingIndex.toFixed(2)}% suggests ${table8UtilCategory.toLowerCase()} utilization of the facility.`
          : 'Parking index could not be calculated because parking supply or survey duration data is unavailable.');

      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); st(20, 30, 50);
      const wrapped = doc.splitTextToSize(conclusionText, W);
      wrapped.forEach((line: string) => {
        ensureSpace(7);
        doc.text(line, L, y);
        y += 6;
      });

      doc.save(`${project.project_name}_Parking_Survey_Report.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  }

  function handleOpenPdfModal() {
    setFormError('');
    setShowSupplyModal(true);
  }

  function handleConfirmGenerate() {
    const result = validateSupplyForm(spaceForm, fFactorForm);
    if (!result.valid || !result.spaces || result.fFactor == null) {
      setFormError('Enter available spaces (≥ 0) for all vehicle types and an F Factor between 0.85 and 0.95.');
      return;
    }
    generatePDF({ spaces: result.spaces, fFactor: result.fFactor });
  }

  function updateSpaceForm(type: ReportVType, value: string) {
    setSpaceForm(prev => ({ ...prev, [type]: value }));
    setFormError('');
  }

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={handleOpenPdfModal}
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
            NIT Warangal format — IRC SP-12 ECS tables, accumulation curve, statistics, duration, turnover, parking index and conclusion
          </p>
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm font-medium">
            <Download className="w-4 h-4" /> Download PDF
          </div>
        </button>

        <button
          onClick={generateCSV}
          className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Excel / CSV Data</h3>
          <p className="text-sm text-slate-500">
            Slot-wise vehicle counts (IRC SP-12 categories) and ECS values for further analysis
          </p>
          <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <Download className="w-4 h-4" /> Download CSV
          </div>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Report Preview</h3>
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-blue-800">
            <h4 className="font-medium text-slate-900 mb-1">Page 1 — Project Details</h4>
            <p className="text-sm text-slate-500">
              {project.project_name} · {project.location_name ?? 'No location'} · {project.survey_date}
              &nbsp;|&nbsp; {project.start_time} – {project.end_time}
              &nbsp;|&nbsp; Interval: {project.survey_interval_minutes} min
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-indigo-500">
            <h4 className="font-medium text-slate-900 mb-1">Pages 2–3 — Volume &amp; Accumulation</h4>
            <p className="text-sm text-slate-500">
              Tables 1–3 · {slots.length} intervals · Total ECS = {totECS.toFixed(2)} ·
              Parking Load = {parkingLoad.toFixed(2)} ecs-min · Fig-1 &amp; Fig-2
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border-l-4 border-teal-500">
            <h4 className="font-medium text-slate-900 mb-1">Pages 4–7 — Statistics &amp; Analysis</h4>
            <p className="text-sm text-slate-500">
              Table 4 · Duration = {durationMin} min ({numSessions} × {project.survey_interval_minutes} min) ·
              Peak ECS = {peakECS.toFixed(2)} · Avg Duration = {avgDurMin.toFixed(2)} min
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Tables 6–8 require parking supply inputs (available spaces per category and F Factor) before PDF generation.
            </p>
          </div>
        </div>
      </div>

      {showSupplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Parking Supply Inputs</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Required before generating the PDF report
                </p>
              </div>
              <button
                onClick={() => setShowSupplyModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#003366] text-white">
                      <th className="px-3 py-2.5 text-left font-medium">Vehicle Type</th>
                      <th className="px-3 py-2.5 text-left font-medium">Available Spaces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REPORT_TYPES.map((t, i) => (
                      <tr key={t} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-3 py-2 text-slate-700">{REPORT_LABELS[t]}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={spaceForm[t]}
                            onChange={e => updateSpaceForm(t, e.target.value)}
                            placeholder="0"
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  F Factor <span className="text-slate-400 font-normal">(0.85 – 0.95)</span>
                </label>
                <input
                  type="number"
                  min={0.85}
                  max={0.95}
                  step={0.01}
                  value={fFactorForm}
                  onChange={e => { setFFactorForm(e.target.value); setFormError(''); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Insufficiency factor used in Parking Supply calculations. Default: 0.90
                </p>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-200">
              <button
                onClick={() => setShowSupplyModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGenerate}
                disabled={!formValidation.valid || generating}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Download className="w-4 h-4" /> Generate Report</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
