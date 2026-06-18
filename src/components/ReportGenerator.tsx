import { useEffect, useState } from 'react';
import { getSlots, getEnumerators, getCaptures } from '../lib/database';
import type { SurveyProject, SurveySlot, Enumerator, VehicleCapture } from '../lib/types';
import { VEHICLE_CATEGORIES } from '../lib/types';
import { FileText, Download, ArrowLeft, Loader2 } from 'lucide-react';

interface Props { project: SurveyProject | null; onBack?: () => void; }

export default function ReportGenerator({ project, onBack }: Props) {
  const [slots, setSlots] = useState<SurveySlot[]>([]);
  const [enumerators, setEnumerators] = useState<Enumerator[]>([]);
  const [captures, setCaptures] = useState<VehicleCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!project) return;
    const projectId = project.id;
    async function load() {
      setLoading(true);
      const [s, e, c] = await Promise.all([getSlots(projectId), getEnumerators(projectId), getCaptures(projectId)]);
      setSlots(s); setEnumerators(e); setCaptures(c); setLoading(false);
    }
    load();
  }, [project]);

  if (!project) return <div className="max-w-7xl mx-auto"><div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">Select a project to generate reports</p></div></div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const totalVehicles = captures.length;

  const ECS_FACTORS: Record<string, number> = {
    motorcycle: 0.25,
    two_wheeler: 0.25,
    auto: 0.5,
    auto_rickshaw: 0.5,
    car: 1,
    lcv: 1.5,
    bus: 2.5,
    truck: 3,
    others: 1,
  };

  const slotECS = slots.map(slot => {
    const slotCaptures = captures.filter(c => c.slot_id === slot.id);
    const ecs = slotCaptures.reduce((sum, c) => sum + (c.vehicle_type ? (ECS_FACTORS[c.vehicle_type] ?? 1) : 1), 0);
    return { slotNumber: slot.slot_number, vehicleCount: slotCaptures.length, ecs };
  });

  const totalECS = slotECS.reduce((sum, s) => sum + s.ecs, 0);

  let areaUnderCurve = 0;
  for (let i = 0; i < slotECS.length - 1; i++) {
    areaUnderCurve += ((slotECS[i].ecs + slotECS[i + 1].ecs) / 2) * project.survey_interval_minutes;
  }

  const parkingDuration = totalVehicles > 0 ? areaUnderCurve / totalVehicles : 0;

  function generateCSV() {
    if (!project) return;
    const rows = [['Slot', 'Time', 'Two Wheeler', 'Car', 'Auto', 'Bus', 'Truck', 'LCV', 'Others', 'Total']];
    slots.forEach(s => {
      const sc = captures.filter(c => c.slot_id === s.id);
      rows.push([`S${s.slot_number}`, `${s.start_time}-${s.end_time}`, ...VEHICLE_CATEGORIES.map(cat => sc.filter(c => c.vehicle_type === cat.key).length.toString()), sc.length.toString()]);
    });
    downloadFile(rows.map(r => r.join(',')).join('\n'), `${project.project_name}_data.csv`, 'text/csv');
  }

  function generateSlotCSV() {
    if (!project) return;
    const rows = [['Enumerator', 'Mobile', 'Total Captures', 'Verified']];
    enumerators.forEach(e => {
      const ec = captures.filter(c => c.enumerator_id === e.id);
      rows.push([e.name, e.mobile, ec.length.toString(), ec.filter(c => c.is_verified).length.toString()]);
    });
    downloadFile(rows.map(r => r.join(',')).join('\n'), `${project.project_name}_enumerators.csv`, 'text/csv');
  }

  async function generatePDF() {
    if (!project) return;
    setGenerating(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      let y = 20;

      // ── PAGE 1: COVER ──────────────────────────────────────────────────────
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, 210, 297, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.text('Traffic Survey Report', 105, 80, { align: 'center' });
      doc.setFontSize(18);
      doc.text(project.project_name, 105, 100, { align: 'center' });
      doc.setFontSize(14);
      doc.text(`Client: ${project.client_name || 'N/A'}`, 105, 120, { align: 'center' });
      doc.text(`Date: ${project.survey_date}`, 105, 135, { align: 'center' });
      doc.text(`Location: ${project.location_name || 'N/A'}`, 105, 150, { align: 'center' });

      // ── PAGE 2: SURVEY DETAILS + ECS TABLE ────────────────────────────────
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      y = 15;

      // Survey Details
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Survey Details', 14, y); y += 9;
      doc.setFontSize(10);
      const detailRows: [string, string][] = [
        ['Project Name', project.project_name],
        ['Client', project.client_name || 'N/A'],
        ['Purpose', project.purpose || 'N/A'],
        ['Survey Date', project.survey_date],
        ['Time', `${project.start_time} – ${project.end_time}`],
        ['Duration', `${project.survey_duration_hours} hours`],
        ['Interval', `${project.survey_interval_minutes} minutes`],
        ['Location', project.location_name || 'N/A'],
        ['Total Slots', String(slots.length)],
        ['Total Vehicles', String(totalVehicles)],
      ];
      detailRows.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');   doc.text(`${label}:`, 14, y);
        doc.setFont('helvetica', 'normal'); doc.text(value, 68, y);
        y += 6;
      });
      y += 8;

      // ECS Table heading
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('ECS Table', 14, y); y += 7;

      // Column widths (total ≈ 182 mm to fit A4 with 14 mm margins)
      // Interval | 2W | 3W | 4W | Bus | ECS(2W) | ECS(3W) | ECS(4W) | ECS(Bus) | Total ECS
      const tL = 14;
      const cW = [24, 14, 14, 14, 12, 17, 17, 17, 17, 20];
      const tW = cW.reduce((a, b) => a + b, 0);

      // Header background
      doc.setFillColor(225, 231, 248);
      doc.rect(tL, y - 5, tW, 15, 'F');

      // Header row 1
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const hdr1 = ['Interval', 'Two', 'Three', 'Four', 'Bus', 'ECS', 'ECS', 'ECS', 'ECS', 'Total'];
      const hdr2 = ['',         'Wheeler', 'Wheeler', 'Wheeler', '', '(2W)', '(3W)', '(4W)', '(Bus)', 'ECS'];
      let cx = tL;
      hdr1.forEach((h, i) => { doc.text(h, cx + cW[i] / 2, y, { align: 'center' }); cx += cW[i]; });
      y += 5;
      cx = tL;
      hdr2.forEach((h, i) => { doc.text(h, cx + cW[i] / 2, y, { align: 'center' }); cx += cW[i]; });
      y += 7;

      // Outer header border
      doc.setDrawColor(180, 190, 215);
      doc.setLineWidth(0.4);
      doc.line(tL, y - 17, tL + tW, y - 17);
      doc.line(tL, y - 1,  tL + tW, y - 1);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      let grandTotalECS = 0;

      slots.forEach((slot, idx) => {
        const sc = captures.filter(c => c.slot_id === slot.id);

        const twCount  = sc.filter(c => c.vehicle_type === 'motorcycle' || c.vehicle_type === 'two_wheeler').length;
        const thwCount = sc.filter(c => c.vehicle_type === 'auto' || c.vehicle_type === 'auto_rickshaw').length;
        const fwCount  = sc.filter(c => c.vehicle_type === 'car' || c.vehicle_type === 'lcv' || c.vehicle_type === 'others').length;
        const bwCount  = sc.filter(c => c.vehicle_type === 'bus' || c.vehicle_type === 'truck').length;

        const e2w = twCount * 0.25;
        const e3w = thwCount * 0.5;
        const e4w = sc.filter(c => c.vehicle_type === 'car').length * 1
                  + sc.filter(c => c.vehicle_type === 'lcv').length * 1.5
                  + sc.filter(c => c.vehicle_type === 'others').length * 1;
        const ebs = sc.filter(c => c.vehicle_type === 'bus').length * 2.5
                  + sc.filter(c => c.vehicle_type === 'truck').length * 3;
        const rowECS = e2w + e3w + e4w + ebs;
        grandTotalECS += rowECS;

        // Alternating row tint
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 255);
          doc.rect(tL, y - 4, tW, 8, 'F');
        }

        const interval = `${slot.start_time}-${slot.end_time}`;
        const row = [
          interval,
          String(twCount), String(thwCount), String(fwCount), String(bwCount),
          e2w.toFixed(2), e3w.toFixed(2), e4w.toFixed(2), ebs.toFixed(2),
          rowECS.toFixed(2),
        ];
        cx = tL;
        row.forEach((val, i) => {
          doc.text(val, cx + cW[i] / 2, y, { align: 'center' });
          cx += cW[i];
        });
        y += 8;

        // Row separator
        doc.setDrawColor(220, 225, 238);
        doc.setLineWidth(0.2);
        doc.line(tL, y - 2, tL + tW, y - 2);

        if (y > 265) { doc.addPage(); y = 20; }
      });

      // Grand Total row
      doc.setFillColor(210, 220, 245);
      doc.rect(tL, y - 4, tW, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Grand Total ECS', tL + 3, y + 2);
      doc.text(grandTotalECS.toFixed(2), tL + tW - 3, y + 2, { align: 'right' });
      y += 14;

      // ── PAGE 3: ECS GRAPH + PARKING DURATION ─────────────────────────────
      doc.addPage();
      y = 15;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text('Graph – Total ECS per Interval', 14, y); y += 12;

      // Chart geometry
      const cxL  = 36;
      const cxT  = y;
      const cxW  = 155;
      const cxH  = 85;
      const cxB  = cxT + cxH;
      const cxR  = cxL + cxW;

      const ecsVals = slotECS.map(s => s.ecs);
      const maxV    = Math.max(...ecsVals, 1);

      // Horizontal grid + Y-axis labels
      const gridCount = 4;
      for (let i = 0; i <= gridCount; i++) {
        const gy = cxB - (i / gridCount) * cxH;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.25);
        doc.line(cxL, gy, cxR, gy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(110, 110, 110);
        doc.text(((i / gridCount) * maxV).toFixed(1), cxL - 2, gy + 1.5, { align: 'right' });
      }

      // Y-axis rotated label
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text('ECS Units', 10, cxT + cxH / 2, { angle: 90, align: 'center' });

      // Axes
      doc.setDrawColor(90, 90, 90);
      doc.setLineWidth(0.5);
      doc.line(cxL, cxT, cxL, cxB);
      doc.line(cxL, cxB, cxR, cxB);

      // Line + dots
      if (ecsVals.length >= 2) {
        const stepX = cxW / (ecsVals.length - 1);

        doc.setDrawColor(72, 187, 120);
        doc.setLineWidth(0.9);
        for (let i = 0; i < ecsVals.length - 1; i++) {
          const x1 = cxL + i * stepX;
          const y1 = cxB - (ecsVals[i] / maxV) * cxH;
          const x2 = cxL + (i + 1) * stepX;
          const y2 = cxB - (ecsVals[i + 1] / maxV) * cxH;
          doc.line(x1, y1, x2, y2);
        }

        doc.setFillColor(72, 187, 120);
        ecsVals.forEach((v, i) => {
          const px = cxL + i * stepX;
          const py = cxB - (v / maxV) * cxH;
          doc.circle(px, py, 1.5, 'F');
        });

        // X-axis interval labels
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(80, 80, 80);
        slots.forEach((slot, i) => {
          const px = cxL + i * stepX;
          doc.text(`${slot.start_time}-${slot.end_time}`, px, cxB + 5, { align: 'center' });
        });
      }

      // X-axis title + legend
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Time Interval (hours)', cxL + cxW / 2, cxB + 12, { align: 'center' });
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(72, 187, 120);
      doc.text('→ totalECS', cxL + cxW / 2, cxB + 18, { align: 'center' });

      y = cxB + 28;

      // Parking Duration section
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Parking Duration', 14, y); y += 10;

      doc.setFontSize(11);

      // Area under ECS Curve (inline bold value)
      const aucLabel = 'Area under ECS Curve: ';
      doc.setFont('helvetica', 'normal');
      doc.text(aucLabel, 14, y);
      doc.setFont('helvetica', 'bold');
      doc.text(`${areaUnderCurve.toFixed(2)} ECS·minutes`, 14 + doc.getTextWidth(aucLabel), y);
      y += 8;

      // Estimated Parking Duration (inline bold value)
      const pdHours = Math.floor(parkingDuration / 60);
      const pdMins  = Math.round(parkingDuration % 60);
      const pdLabel = 'Estimated Parking Duration: ';
      doc.setFont('helvetica', 'normal');
      doc.text(pdLabel, 14, y);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `${parkingDuration.toFixed(2)} minutes (${pdHours} hours ${pdMins} minutes)`,
        14 + doc.getTextWidth(pdLabel), y
      );
      y += 20;

      // ── PAGE 4: CONCLUSIONS ───────────────────────────────────────────────
      doc.addPage();
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      y = 20;
      doc.setTextColor(0, 0, 0);
      doc.text('Conclusions & Recommendations', 14, y); y += 14;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const conclusions = [
        `Total Vehicles Surveyed: ${totalVehicles} vehicles were recorded during the survey period.`,
        `Total ECS: ${totalECS.toFixed(2)} Equivalent Car Space units were observed across all time slots.`,
        `Parking Duration: The average parking duration was ${parkingDuration.toFixed(2)} minutes per vehicle.`,
        `Survey Date: ${project.survey_date}.`,
        `Survey Location: ${project.location_name || 'N/A'}.`,
      ];
      conclusions.forEach(c => {
        const lines = doc.splitTextToSize(c, 180);
        doc.text(lines, 14, y);
        y += lines.length * 6 + 4;
      });

      doc.save(`${project.project_name}_Report.pdf`);
    } catch (err) { console.error('PDF generation error:', err); } finally { setGenerating(false); }
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Report Generator</h1><p className="text-sm text-slate-500">{project.project_name}</p></div>
        {onBack && <button onClick={onBack} className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={generatePDF} disabled={generating} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group disabled:opacity-50">
          <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating ? <Loader2 className="w-6 h-6 text-red-500 animate-spin" /> : <FileText className="w-6 h-6 text-red-500" />}
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">PDF Report</h3>
          <p className="text-sm text-slate-500">Professional multi-page report with charts, tables, and analysis</p>
          <div className="mt-3 flex items-center gap-2 text-red-600 text-sm font-medium"><Download className="w-4 h-4" /> Download PDF</div>
        </button>
        <button onClick={generateCSV} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group">
          <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><FileText className="w-6 h-6 text-emerald-500" /></div>
          <h3 className="font-semibold text-slate-900 mb-1">Excel/CSV Data</h3>
          <p className="text-sm text-slate-500">Slot-wise vehicle count data for further analysis</p>
          <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-medium"><Download className="w-4 h-4" /> Download CSV</div>
        </button>
        <button onClick={generateSlotCSV} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><FileText className="w-6 h-6 text-blue-500" /></div>
          <h3 className="font-semibold text-slate-900 mb-1">Enumerator Data</h3>
          <p className="text-sm text-slate-500">Enumerator performance and capture statistics</p>
          <div className="mt-3 flex items-center gap-2 text-blue-600 text-sm font-medium"><Download className="w-4 h-4" /> Download CSV</div>
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Report Preview</h3>
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-4"><h4 className="font-medium text-slate-900 mb-2">Cover Page</h4><p className="text-sm text-slate-500">Project: {project.project_name} | Client: {project.client_name || 'N/A'} | Date: {project.survey_date}</p></div>
          <div className="bg-slate-50 rounded-lg p-4"><h4 className="font-medium text-slate-900 mb-2">Survey Details</h4><p className="text-sm text-slate-500">Duration: {project.survey_duration_hours}h | Interval: {project.survey_interval_minutes}min | Enumerators: {enumerators.length}</p></div>
          <div className="bg-slate-50 rounded-lg p-4"><h4 className="font-medium text-slate-900 mb-2">Vehicle Analysis</h4><p className="text-sm text-slate-500">Total Vehicles: {totalVehicles} | Total ECS: {totalECS.toFixed(2)} | Parking Duration: {parkingDuration.toFixed(2)} min/vehicle</p></div>
        </div>
      </div>
    </div>
  );
}
