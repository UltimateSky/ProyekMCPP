import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
import { utils, write } from 'xlsx';
import type { Transaction } from './transactionService';

const BRAND = '#7a0400';
const GREEN  = '#16a34a';

const CAT_LABELS: Record<string, string> = {
  transfer: 'Account Transfer', shopping: 'Shopping',
  food: 'Food & Beverage', deposit: 'Cash Deposit',
  salary: 'Salary', other: 'Other',
};

const fmt     = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('id-ID') : '-';

// ── Round up Y-axis scale ──────────────────────────────────────────────────
function roundUpNice(n: number): number {
  if (n <= 0) return 1_000_000;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const r   = n / mag;
  if (r <= 1) return 1 * mag;
  if (r <= 2) return 2 * mag;
  if (r <= 5) return 5 * mag;
  return 10 * mag;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}rb`;
  return `${Math.round(n)}`;
}

// ── Build per-month summary ────────────────────────────────────────────────
function buildMonthSummaries(txs: Transaction[], months: string[]) {
  return months.map(m => {
    const mt   = txs.filter(t => t.month === m);
    const earn = mt.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
    const spend= mt.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
    return { month: m, earn, spend, net: earn - spend, count: mt.length };
  });
}

// ── Inline SVG line chart untuk PDF ───────────────────────────────────────
function buildSvgChart(summaries: { month: string; earn: number; spend: number }[]): string {
  const W=680, H=200, PL=70, PR=20, PT=20, PB=36;
  const cW = W-PL-PR, cH = H-PT-PB;
  const n  = summaries.length;

  const maxVal = Math.max(...summaries.flatMap(d => [d.spend, d.earn]), 1);
  const yMax   = roundUpNice(maxVal * 1.15);

  const xOf = (i: number) => PL + (n <= 1 ? cW/2 : i * cW / (n-1));
  const yOf = (v: number) => PT + cH - (v / yMax) * cH;

  // Grid + Y labels (5 steps)
  const grid = Array.from({length: 6}, (_, i) => {
    const val = (yMax / 5) * i;
    const y   = yOf(val);
    return `<line x1="${PL}" y1="${y}" x2="${PL+cW}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
    <text x="${PL-5}" y="${y+4}" text-anchor="end" font-size="9" fill="#94a3b8">${fmtK(val)}</text>`;
  }).join('');

  const xLabels = summaries.map((d, i) =>
    `<text x="${xOf(i)}" y="${PT+cH+16}" text-anchor="middle" font-size="9" fill="#64748b">${d.month.split(' ')[0].slice(0,3)}</text>`
  ).join('');

  const spendPts = summaries.map((d, i) => `${xOf(i)},${yOf(d.spend)}`).join(' ');
  const earnPts  = summaries.map((d, i) => `${xOf(i)},${yOf(d.earn)}`).join(' ');

  const spendDots = summaries.map((d, i) =>
    `<circle cx="${xOf(i)}" cy="${yOf(d.spend)}" r="4" fill="${BRAND}" stroke="white" stroke-width="1.5"/>`
  ).join('');
  const earnDots = summaries.map((d, i) =>
    `<circle cx="${xOf(i)}" cy="${yOf(d.earn)}" r="4" fill="${GREEN}" stroke="white" stroke-width="1.5"/>`
  ).join('');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="white" stroke="#f1f5f9" stroke-width="1"/>
    ${grid}${xLabels}
    <polyline points="${earnPts}"  fill="none" stroke="${GREEN}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${spendPts}" fill="none" stroke="${BRAND}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${earnDots}${spendDots}
    <rect x="${PL}" y="${H-14}" width="18" height="3" fill="${BRAND}" rx="1"/>
    <text x="${PL+22}" y="${H-10}" font-size="9" fill="#64748b">Pengeluaran</text>
    <rect x="${PL+105}" y="${H-14}" width="18" height="3" fill="${GREEN}" rx="1"/>
    <text x="${PL+127}" y="${H-10}" font-size="9" fill="#64748b">Pemasukan</text>
  </svg>`;
}

// ════════════════════════════════════════════════════════════════════════════
// PDF EXPORT — multi-bulan
// ════════════════════════════════════════════════════════════════════════════
export async function exportToPDF(
  transactions: Transaction[],
  months: string[],
  userName: string
): Promise<string> {
  const summaries  = buildMonthSummaries(transactions, months);
  const grandEarn  = summaries.reduce((s, m) => s + m.earn, 0);
  const grandSpend = summaries.reduce((s, m) => s + m.spend, 0);
  const grandNet   = grandEarn - grandSpend;
  const isPos      = grandNet >= 0;
  const svgChart   = buildSvgChart(summaries);
  const period     = months.length === 1 ? months[0] : `${months[0]} — ${months[months.length-1]}`;

  // Per-month detail rows
  const monthRows = summaries.map(s => `
    <tr>
      <td><strong>${s.month}</strong></td>
      <td class="earn">${fmt(s.earn)}</td>
      <td class="spend">${fmt(s.spend)}</td>
      <td class="${s.net >= 0 ? 'earn' : 'spend'}">${s.net >= 0 ? '+' : ''}${fmt(s.net)}</td>
      <td style="color:#64748b;text-align:center">${s.count}</td>
    </tr>`).join('');

  // All transaction detail rows (only spending + earning separate)
  const spendTxs = transactions.filter(t => t.type === 'spending');
  const earnTxs  = transactions.filter(t => t.type === 'earning');

  const buildTxRows = (txs: Transaction[]) => txs.map((t, i) => `
    <tr class="${i%2===0?'even':'odd'}">
      <td>${i+1}</td><td>${fmtDate(t.date)}</td>
      <td>${t.month}</td><td>${t.title}</td>
      <td>${CAT_LABELS[t.category]||t.category}</td>
      <td style="font-weight:700">${fmt(t.amount)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;background:#f8fafc;color:#1e293b}
  .header{background:linear-gradient(135deg,${BRAND} 0%,#b91c1c 100%);color:white;padding:32px 40px 24px}
  .logo{width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}
  .header h1{font-size:24px;font-weight:800;margin-top:16px}
  .meta{font-size:12px;opacity:.85;margin-top:3px}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:24px 40px 0}
  .card{background:white;border-radius:14px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
  .card-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .card-value{font-size:19px;font-weight:800;margin-top:5px}
  .earn{color:${GREEN}}.spend{color:${BRAND}}
  .section{margin:24px 40px 0}
  .section-title{font-size:14px;font-weight:700;margin-bottom:12px;padding-bottom:7px;border-bottom:2px solid #f1f5f9}
  .chart-box{background:white;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.05)}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:${BRAND};color:white;padding:9px 11px;text-align:left;font-size:11px;font-weight:700}
  th:first-child{border-radius:6px 0 0 0}th:last-child{border-radius:0 6px 0 0}
  td{padding:9px 11px;border-bottom:1px solid #f1f5f9}
  tr.even td{background:white}tr.odd td{background:#fafafa}
  .total-row td{font-weight:700;background:#fff7ed!important;color:${BRAND}}
  .footer{margin:28px 40px 24px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
</style></head><body>

<div class="header">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div class="logo">FD</div>
    <div style="font-size:11px;opacity:.8">Generated: ${new Date().toLocaleDateString('id-ID',{dateStyle:'full'})}</div>
  </div>
  <h1>Financial Report</h1>
  <div class="meta">${userName} &nbsp;•&nbsp; ${period}</div>
</div>

<div class="cards">
  <div class="card"><div class="card-label">Total Pemasukan</div><div class="card-value earn">${fmt(grandEarn)}</div></div>
  <div class="card"><div class="card-label">Total Pengeluaran</div><div class="card-value spend">${fmt(grandSpend)}</div></div>
  <div class="card"><div class="card-label">Net Balance</div><div class="card-value ${isPos?'earn':'spend'}">${isPos?'+':''}${fmt(grandNet)}</div></div>
</div>

<div class="section">
  <div class="section-title">📈 Diagram Tren Bulanan</div>
  <div class="chart-box">${svgChart}</div>
</div>

<div class="section">
  <div class="section-title">📅 Ringkasan Per Bulan</div>
  <table>
    <tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih (Net)</th><th style="text-align:center">Transaksi</th></tr>
    ${monthRows}
    <tr class="total-row">
      <td>TOTAL (${months.length} bulan)</td>
      <td class="earn">${fmt(grandEarn)}</td>
      <td class="spend">${fmt(grandSpend)}</td>
      <td class="${isPos?'earn':'spend'}">${isPos?'+':''}${fmt(grandNet)}</td>
      <td style="text-align:center">${transactions.length}</td>
    </tr>
  </table>
</div>

<div class="section">
  <div class="section-title">📤 Detail Pengeluaran (${spendTxs.length} transaksi)</div>
  <table>
    <tr><th>#</th><th>Tanggal</th><th>Bulan</th><th>Deskripsi</th><th>Kategori</th><th>Jumlah</th></tr>
    ${buildTxRows(spendTxs)}
    <tr class="total-row"><td colspan="5">TOTAL PENGELUARAN</td><td>${fmt(grandSpend)}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">📥 Detail Pemasukan (${earnTxs.length} transaksi)</div>
  <table>
    <tr><th>#</th><th>Tanggal</th><th>Bulan</th><th>Deskripsi</th><th>Kategori</th><th>Jumlah</th></tr>
    ${buildTxRows(earnTxs)}
    <tr class="total-row"><td colspan="5">TOTAL PEMASUKAN</td><td>${fmt(grandEarn)}</td></tr>
  </table>
</div>

<div class="footer">Financial Diary • Laporan otomatis • ${new Date().toLocaleDateString('id-ID')}</div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const safe    = period.replace(/[\s—]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const newUri  = `${FileSystem.documentDirectory}FinancialReport_${safe}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: newUri });
  return newUri;
}

// ════════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT — multi-bulan, per-sheet per bulan + summary
// ════════════════════════════════════════════════════════════════════════════
export async function exportToExcel(
  transactions: Transaction[],
  months: string[],
  userName: string
): Promise<string> {
  const summaries  = buildMonthSummaries(transactions, months);
  const grandEarn  = summaries.reduce((s, m) => s + m.earn, 0);
  const grandSpend = summaries.reduce((s, m) => s + m.spend, 0);
  const grandNet   = grandEarn - grandSpend;
  const period     = months.length === 1 ? months[0] : `${months[0]} s/d ${months[months.length-1]}`;

  const wb = utils.book_new();

  // ── Sheet 1: SUMMARY MULTI-BULAN ─────────────────────────────────────────
  const sumData: any[][] = [
    ['FINANCIAL REPORT — MULTI BULAN'],
    [`Nama: ${userName}`],
    [`Periode: ${period}`],
    [`Digenerate: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}`],
    [],
    ['RINGKASAN PER BULAN'],
    ['Bulan', 'Pemasukan (IDR)', 'Pengeluaran (IDR)', 'Net Balance (IDR)', 'Jml Transaksi'],
    ...summaries.map(s => [s.month, s.earn, s.spend, s.net, s.count]),
    [],
    ['TOTAL', grandEarn, grandSpend, grandNet, transactions.length],
  ];
  const wsSummary = utils.aoa_to_sheet(sumData);
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 14 }];
  utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Sheet 2: SEMUA TRANSAKSI ──────────────────────────────────────────────
  const allData: any[][] = [
    ['No', 'Bulan', 'Tanggal', 'Deskripsi', 'Kategori', 'Tipe', 'Jumlah (IDR)'],
    ...transactions.map((t, i) => [
      i + 1, t.month, fmtDate(t.date), t.title,
      CAT_LABELS[t.category] || t.category,
      t.type === 'spending' ? 'Pengeluaran' : 'Pemasukan',
      t.amount,
    ]),
    [],
    ['', '', '', '', '', 'TOTAL PEMASUKAN', grandEarn],
    ['', '', '', '', '', 'TOTAL PENGELUARAN', grandSpend],
    ['', '', '', '', '', 'NET BALANCE', grandNet],
  ];
  const wsAll = utils.aoa_to_sheet(allData);
  wsAll['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
  utils.book_append_sheet(wb, wsAll, 'Semua Transaksi');

  // ── Sheet 3: PENGELUARAN ──────────────────────────────────────────────────
  const spendTxs  = transactions.filter(t => t.type === 'spending');
  const spendData: any[][] = [
    ['No', 'Bulan', 'Tanggal', 'Deskripsi', 'Kategori', 'Jumlah (IDR)'],
    ...spendTxs.map((t, i) => [
      i + 1, t.month, fmtDate(t.date), t.title,
      CAT_LABELS[t.category] || t.category, t.amount,
    ]),
    [], ['', '', '', '', 'TOTAL', grandSpend],
  ];
  const wsSpend = utils.aoa_to_sheet(spendData);
  wsSpend['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }];
  utils.book_append_sheet(wb, wsSpend, 'Pengeluaran');

  // ── Sheet 4: PEMASUKAN ────────────────────────────────────────────────────
  const earnTxs  = transactions.filter(t => t.type === 'earning');
  const earnData: any[][] = [
    ['No', 'Bulan', 'Tanggal', 'Deskripsi', 'Kategori', 'Jumlah (IDR)'],
    ...earnTxs.map((t, i) => [
      i + 1, t.month, fmtDate(t.date), t.title,
      CAT_LABELS[t.category] || t.category, t.amount,
    ]),
    [], ['', '', '', '', 'TOTAL', grandEarn],
  ];
  const wsEarn = utils.aoa_to_sheet(earnData);
  wsEarn['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }];
  utils.book_append_sheet(wb, wsEarn, 'Pemasukan');

  // ── Per-bulan sheet (jika > 1 bulan) ─────────────────────────────────────
  if (months.length > 1) {
    months.forEach(m => {
      const mTxs = transactions.filter(t => t.month === m);
      if (mTxs.length === 0) return;
      const mEarn  = mTxs.filter(t => t.type === 'earning').reduce((s, t) => s + t.amount, 0);
      const mSpend = mTxs.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);
      const mData: any[][] = [
        [`Bulan: ${m}`],
        ['No', 'Tanggal', 'Deskripsi', 'Kategori', 'Tipe', 'Jumlah (IDR)'],
        ...mTxs.map((t, i) => [
          i + 1, fmtDate(t.date), t.title,
          CAT_LABELS[t.category] || t.category,
          t.type === 'spending' ? 'Pengeluaran' : 'Pemasukan',
          t.amount,
        ]),
        [], ['', '', '', '', 'PEMASUKAN', mEarn],
        ['', '', '', '', 'PENGELUARAN', mSpend],
        ['', '', '', '', 'NET', mEarn - mSpend],
      ];
      const ws = utils.aoa_to_sheet(mData);
      ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 18 }];
      // Nama sheet max 31 karakter
      const sheetName = m.split(' ').slice(0, 2).join('_').slice(0, 28);
      utils.book_append_sheet(wb, ws, sheetName);
    });
  }

  const wbout  = write(wb, { type: 'base64', bookType: 'xlsx' });
  const safe   = period.replace(/[\s—]/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  const fileUri = `${FileSystem.documentDirectory}FinancialReport_${safe}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

// ── Share file ────────────────────────────────────────────────────────────
export async function shareFile(fileUri: string): Promise<void> {
  const ok = await Sharing.isAvailableAsync();
  if (!ok) throw new Error('Sharing tidak tersedia di perangkat ini');
  await Sharing.shareAsync(fileUri, {
    mimeType: fileUri.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf',
    dialogTitle: 'Bagikan Laporan Keuangan',
    UTI: fileUri.endsWith('.xlsx') ? 'com.microsoft.excel.xlsx' : 'com.adobe.pdf',
  });
}
