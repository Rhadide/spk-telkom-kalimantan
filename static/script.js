// ===== CONSTANTS =====
let CRITERIA = ['C1 (Produk)', 'C2 (Karakteristik)', 'C3 (Durasi)', 'C4 (Revenue)'];
const DEFAULT_MATRIX_4 = [[1,2,3,0.33],[0.5,1,2,0.25],[0.33,0.5,1,0.2],[3,4,5,1]];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// Dark theme chart defaults
const DARK_TOOLTIP_BG = '#1a1d27';
const DARK_GRID = 'rgba(255,255,255,0.05)';
const DARK_TICK = '#475569';
const CHART_COLORS = {
    primary: '#e63030', accent: '#ff4757', light1: '#ff8e8e',
    light2: '#ffb3b3', light3: '#ffd0d0', dark: '#b91c1c'
};
const WITEL_COLORS = ['#e63030','#ff4757','#ff6b6b','#ff8e8e','#ffa8a8','#ffbdbd','#ffd0d0','#ffe3e3'];

// Build gradient fill on a canvas context
function makeGradient(ctx, color, alpha1 = 0.5, alpha2 = 0.0) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color + Math.round(alpha1 * 255).toString(16).padStart(2,'0'));
    gradient.addColorStop(1, color + Math.round(alpha2 * 255).toString(16).padStart(2,'0'));
    return gradient;
}

// ===== DEBOUNCE UTILITY =====
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ===== STATE =====
let matrixInputs = [];
let lastAnalysisData = null;
let allStats = null;
let charts = {};
let masterCurrentView = 'edited';
let editedPage = 0, rawPage = 0;
const PAGE_SIZE = 50;
let debouncedAnalysis; // inisialisasi di DOMContentLoaded

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    debouncedAnalysis = debounce(executeAnalysis, 600);
    buildMatrix();
    loadDashboard();
    loadMasterEdited();
    listenRevenueInputs();
});

// ===== NAVIGATION =====
const TAB_LABELS = {
    dashboard: 'Dashboard / Analytics',
    revenue: 'Executive / Revenue',
    kriteria: 'Pengaturan / Kriteria AHP',
    datamaster: 'Manajemen / Data Master',
    tambah: 'Pelanggan / Tambah Baru'
};

function switchTab(name) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    const navEl = document.getElementById('nav-' + name);
    if (navEl) navEl.classList.add('active');
    document.getElementById('breadcrumbText').textContent = TAB_LABELS[name] || name;

    if (name === 'revenue') loadRevenueStats();
    if (name === 'datamaster') {
        if (masterCurrentView === 'edited') loadMasterEdited();
        else loadMasterRaw();
    }
}

// ===== TOAST =====
function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.className = 'toast', 3000);
}

// ===== CURRENCY =====
function fmtCurrency(v) {
    return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(v || 0);
}
function fmtNum(v, dec = 4) { return Number(v || 0).toFixed(dec); }

// ===== AHP MATRIX (DINAMIS) =====
function buildMatrix() {
    const n = CRITERIA.length;
    // Update thead
    const thead = document.getElementById('matrixThead');
    if (thead) {
        let headRow = '<tr><th>Kriteria</th>';
        CRITERIA.forEach(c => headRow += `<th>${c}</th>`);
        headRow += '</tr>';
        thead.innerHTML = headRow;
    }
    // Update criteria count label
    const label = document.getElementById('criteriaCountLabel');
    if (label) label.textContent = n;
    // Disable remove if only 2 criteria
    const btnRemove = document.getElementById('btnRemoveCriteria');
    if (btnRemove) btnRemove.disabled = n <= 2;

    const tbody = document.querySelector('#matrixInputTable tbody');
    tbody.innerHTML = '';
    matrixInputs = [];
    for (let r = 0; r < n; r++) {
        matrixInputs[r] = [];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${CRITERIA[r]}</strong></td>`;
        for (let c = 0; c < n; c++) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'number'; inp.step = '0.01'; inp.min = '0.01';
            // Default: 1 on diagonal, 1 elsewhere if new
            const defVal = (r < DEFAULT_MATRIX_4.length && c < DEFAULT_MATRIX_4[0].length)
                ? DEFAULT_MATRIX_4[r][c] : 1;
            inp.value = defVal.toFixed(2);
            if (r === c) { inp.disabled = true; inp.value = '1'; }
            else {
                inp.addEventListener('input', () => {
                    const v = parseFloat(inp.value);
                    if (v > 0 && matrixInputs[c] && matrixInputs[c][r]) {
                        matrixInputs[c][r].value = (1 / v).toFixed(4);
                    }
                    if (typeof debouncedAnalysis === 'function') debouncedAnalysis();
                });
            }
            matrixInputs[r][c] = inp;
            td.appendChild(inp);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

function addCriteria() {
    const n = CRITERIA.length + 1;
    CRITERIA.push(`C${n} (Kriteria ${n})`);
    buildMatrix();
    showToast(`Kriteria C${n} ditambahkan. Isi nilai perbandingannya.`, 'success');
    executeAnalysis();
}

function removeCriteria() {
    if (CRITERIA.length <= 2) { showToast('Minimal 2 kriteria diperlukan.', 'error'); return; }
    const removed = CRITERIA.pop();
    buildMatrix();
    showToast(`Kriteria "${removed}" dihapus.`, '');
    executeAnalysis();
}

async function executeAnalysis(showMsg = false) {
    const matrix = matrixInputs.map(row => row.map(inp => parseFloat(inp.value) || 0));
    try {
        const res = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matrix })
        });
        const data = await res.json();
        if (data.error) { showToast(data.error, 'error'); return; }
        lastAnalysisData = data;
        renderDashboard(data);
        renderAHPResults(data.ahp);
        if (showMsg) showToast('Analisis berhasil! Dashboard diperbarui.', 'success');
    } catch (e) {
        showToast('Gagal menghubungi server.', 'error');
    }
}

function renderAHPResults(ahp) {
    document.getElementById('ahpResultSection').style.display = 'block';
    const n = CRITERIA.length;

    // CR Badge
    const badge = document.getElementById('crBadge');
    const crPct = (ahp.cr * 100).toFixed(2);
    badge.textContent = `CR: ${crPct}% — ${ahp.is_consistent ? 'KONSISTEN' : 'TIDAK KONSISTEN'}`;
    badge.className = 'status-badge ' + (ahp.is_consistent ? 'success' : 'error');

    // Normalization Table — header dinamis
    const normTable = document.getElementById('normTable');
    const normThead = normTable.querySelector('thead');
    let normHead = '<tr><th>Kriteria</th>';
    CRITERIA.forEach(c => normHead += `<th>${c}</th>`);
    normHead += '<th class="col-w">Bobot (W)</th><th class="col-eigen">Nilai Eigen (λ)</th></tr>';
    normThead.innerHTML = normHead;

    const tbody = document.getElementById('normTableBody');
    tbody.innerHTML = '';
    for (let r = 0; r < n; r++) {
        const tr = document.createElement('tr');
        let cells = `<td style="font-weight:700">${CRITERIA[r]}</td>`;
        for (let c = 0; c < n; c++) cells += `<td>${fmtNum(ahp.norm_matrix[r][c])}</td>`;
        cells += `<td class="col-w" style="font-weight:700">${(ahp.weights[r]*100).toFixed(2)}%</td>`;
        cells += `<td class="col-eigen" style="font-weight:700">${fmtNum(ahp.eigen_vals[r])}</td>`;
        tr.innerHTML = cells;
        tbody.appendChild(tr);
    }

    // Column Sums Table — header dinamis
    const colSumTable = document.getElementById('colSumTable');
    const colThead = colSumTable.querySelector('thead');
    let csHead = '<tr><th>—</th>';
    CRITERIA.forEach(c => csHead += `<th>${c}</th>`);
    csHead += '</tr>';
    colThead.innerHTML = csHead;

    const csBody = document.getElementById('colSumTableBody');
    csBody.innerHTML = `<tr><td style="font-weight:700">Jumlah Kolom</td>${ahp.col_sums.map(v => `<td style="font-weight:700">${fmtNum(v)}</td>`).join('')}</tr>`;

    // Consistency Metrics
    document.getElementById('cLambdaMax').textContent = fmtNum(ahp.lambda_max);
    document.getElementById('cN').textContent = n;
    document.getElementById('cCI').textContent = fmtNum(ahp.ci);
    document.getElementById('cRI').textContent = fmtNum(ahp.ri);
    document.getElementById('cCR').textContent = `${crPct}%`;
    const verdict = document.getElementById('cVerdict');
    const vCard = document.getElementById('consVerdictCard');
    verdict.textContent = ahp.is_consistent ? 'KONSISTEN & VALID' : 'TIDAK KONSISTEN';
    vCard.className = 'cons-item cons-verdict ' + (ahp.is_consistent ? 'ok' : '');

    // CR Status Card on Dashboard
    document.getElementById('statConsistency').textContent = ahp.is_consistent ? 'Konsisten' : 'Tidak Konsisten';
    document.getElementById('statCRValue').textContent = `CR: ${crPct}%`;
}

// ===== DASHBOARD =====
async function loadDashboard() {
    const matrix = matrixInputs.map(row => row.map(inp => parseFloat(inp.value) || 0));
    try {
        const res = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matrix })
        });
        const data = await res.json();
        if (!data.error) { lastAnalysisData = data; renderDashboard(data); renderAHPResults(data.ahp); }
    } catch (e) { console.warn('Dashboard load failed'); }
}

function renderDashboard(data) {
    document.getElementById('statTotalCust').textContent = (data.total_customers || 0).toLocaleString('id-ID');

    // Ranking Table
    const tbody = document.getElementById('rankingTableBody');
    tbody.innerHTML = '';
    (data.results || []).forEach((row, i) => {
        const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="rank-badge ${cls}">${row.RANK}</span></td>
            <td><strong>${row.CUST_NAME}</strong></td>
            <td style="color:var(--red);font-weight:800">${fmtNum(row.FINAL_SCORE, 4)}</td>
            <td><span class="status-badge ${i < 3 ? 'success' : 'neutral'}" style="font-size:.7rem">${i < 3 ? 'Top Priority' : 'Priority'}</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Weight Bars
    const container = document.getElementById('weightBars');
    container.innerHTML = '';
    CRITERIA.forEach((name, i) => {
        const pct = ((data.ahp.weights[i] || 0) * 100).toFixed(1);
        container.innerHTML += `
            <div class="wb-item">
                <div class="wb-label"><span>${name}</span><span>${pct}%</span></div>
                <div class="wb-track"><div class="wb-fill" style="width:${pct}%"></div></div>
            </div>`;
    });
}

function calculateAll() { loadDashboard(); }

// ===== REVENUE CHARTS =====
let statsCache = null;

async function loadRevenueStats(forceRefresh = false) {
    if (!statsCache || forceRefresh) {
        try {
            const res = await fetch('/api/stats');
            statsCache = await res.json();
        } catch (e) { console.warn('Stats load failed'); return; }
    }
    renderRevenueCharts(statsCache);
    // Populate hero KPIs
    if (statsCache) {
        const total = statsCache.total_revenue || 0;
        document.getElementById('revTotalRevenue').textContent = fmtCurrency(total);
        const topList = statsCache.top_customers_revenue || [];
        if (topList.length > 0) {
            document.getElementById('revTopName').textContent = topList[0].CUST_NAME;
            document.getElementById('revTopRev').textContent = fmtCurrency(topList[0].C4_Revenue);
        }
    }
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderRevenueCharts(stats) {
    // Witel Doughnut — red/pink family
    destroyChart('witel');
    const witelKeys = Object.keys(stats.witel_revenue || {}).slice(0, 8);
    const witelVals = witelKeys.map(k => stats.witel_revenue[k]);
    charts.witel = new Chart(document.getElementById('witelChart'), {
        type: 'doughnut',
        data: {
            labels: witelKeys,
            datasets: [{
                data: witelVals,
                backgroundColor: WITEL_COLORS.slice(0, witelKeys.length),
                borderWidth: 2, borderColor: '#0f1117',
                hoverBorderWidth: 3, hoverOffset: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10, family: 'Plus Jakarta Sans', weight: '600' }, usePointStyle: true, pointStyleWidth: 8, padding: 10, color: DARK_TICK } },
                tooltip: { backgroundColor: DARK_TOOLTIP_BG, titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 11 }, padding: 12,
                    callbacks: { label: ctx => ` ${ctx.label}: Rp ${(ctx.raw/1e9).toFixed(2)}B` } }
            }
        }
    });

    destroyChart('char');
    const charKeys = Object.keys(stats.char_revenue || {});
    const charVals = charKeys.map(k => stats.char_revenue[k]);
    charts.char = new Chart(document.getElementById('charChart'), {
        type: 'doughnut',
        data: { labels: charKeys, datasets: [{ data: charVals, backgroundColor: ['#e63030','#ff8e8e','#ff4757','#ffbdbd'].slice(0, charKeys.length), borderWidth: 2, borderColor: '#0f1117', hoverOffset: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '55%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10, family: 'Plus Jakarta Sans', weight: '600' }, usePointStyle: true, pointStyleWidth: 8, padding: 10, color: DARK_TICK } },
                tooltip: { backgroundColor: DARK_TOOLTIP_BG, padding: 12, callbacks: { label: ctx => ` ${ctx.label}: Rp ${(ctx.raw/1e9).toFixed(2)}B` } }
            }
        }
    });

    // Monthly Trend (default: all)
    renderMonthlyChart(stats, 'all');

    // Top 5 (default: revenue)
    renderTop5Chart(stats, 'revenue');
}

function renderMonthlyChart(stats, mode) {
    destroyChart('monthly');
    const dataMap = mode === 'scaling' ? stats.monthly_scaling :
                    mode === 'sustain' ? stats.monthly_sustain : stats.monthly_all;
    const vals = MONTH_LABELS.map(m => (dataMap || {})[m] || 0);
    // Harmonious red/pink palette per mode
    const colorMap = {
        all:     { border: '#e63030', bg: 'rgba(230,48,48,0.18)' },
        scaling: { border: '#ff4757', bg: 'rgba(255,71,87,0.15)' },
        sustain: { border: '#ff8e8e', bg: 'rgba(255,142,142,0.12)' }
    };
    const c = colorMap[mode] || colorMap.all;
    const label = mode === 'all' ? 'All Revenue' : mode === 'scaling' ? 'Revenue Scaling' : 'Revenue Sustain';
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, c.bg); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    charts.monthly = new Chart(ctx, {
        type: 'line',
        data: { labels: MONTH_LABELS, datasets: [{ label, data: vals, borderColor: c.border, backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: c.border, pointBorderColor: '#0f1117', pointBorderWidth: 2, borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: DARK_TOOLTIP_BG, titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 11 }, padding: 12, callbacks: { label: ctx => ` ${label}: Rp ${(ctx.raw/1e9).toFixed(2)}B` } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: DARK_GRID }, ticks: { font: { size: 10 }, color: DARK_TICK, callback: v => 'Rp ' + (v/1e9).toFixed(1) + 'B' }, border: { display: false } },
                x: { grid: { display: false }, ticks: { font: { size: 10 }, color: DARK_TICK }, border: { display: false } }
            }
        }
    });
}

function renderTop5Chart(stats, mode) {
    destroyChart('top5');
    const key = mode === 'produk' ? 'top_customers_produk' :
                mode === 'karakteristik' ? 'top_customers_karakteristik' :
                mode === 'durasi' ? 'top_customers_durasi' : 'top_customers_revenue';
    const customers = (stats[key] || []).slice(0, 5);
    const labels = customers.map(c => c.CUST_NAME.length > 32 ? c.CUST_NAME.substring(0, 32) + '…' : c.CUST_NAME);
    const vals = customers.map(c =>
        mode === 'produk' ? c.C1_Produk :
        mode === 'karakteristik' ? c.C2_Karakteristik :
        mode === 'durasi' ? c.C3_Durasi : c.C4_Revenue);

    charts.top5 = new Chart(document.getElementById('topCustChart'), {
        type: 'bar',
        data: { labels, datasets: [{ data: vals, backgroundColor: ['#e63030','#ff4757','#ff6b6b','#ff8e8e','#ffa8a8'].slice(0, vals.length), borderWidth: 0, borderRadius: 6, borderSkipped: false }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: DARK_TOOLTIP_BG, titleFont: { size: 11, weight: 'bold' }, bodyFont: { size: 10 }, padding: 10,
                    callbacks: { label: ctx => { const v = ctx.raw; return mode === 'revenue' ? ` Rp ${(v/1e9).toFixed(2)}B` : mode === 'produk' ? ` ${v} produk` : mode === 'durasi' ? ` ${v} bulan` : ` ${Number(v).toFixed(4)}`; } }
                }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: DARK_GRID }, ticks: { font: { size: 9 }, color: DARK_TICK, callback: v => mode === 'revenue' ? (v/1e9).toFixed(1)+'B' : v }, border: { display: false } },
                y: { grid: { display: false }, ticks: { font: { size: 9, weight: '600' }, color: DARK_TICK }, border: { display: false } }
            }
        }
    });
}

function filterMonthly(mode, btn) {
    document.querySelectorAll('.filter-tabs .ftab').forEach(b => {
        if (b.closest('#tab-revenue .card:nth-child(3)') || b.parentElement.parentElement.querySelector('canvas#monthlyChart')) {}
    });
    // Find siblings of clicked button
    btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (statsCache) renderMonthlyChart(statsCache, mode);
}

function filterTop5(mode, btn) {
    btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (statsCache) renderTop5Chart(statsCache, mode);
}

// ===== DATA MASTER =====
function switchMasterView(view) {
    masterCurrentView = view;
    document.getElementById('vtab-edited').classList.toggle('active', view === 'edited');
    document.getElementById('vtab-raw').classList.toggle('active', view === 'raw');
    document.getElementById('editedView').style.display = view === 'edited' ? 'block' : 'none';
    document.getElementById('rawView').style.display = view === 'raw' ? 'block' : 'none';
    if (view === 'edited') loadMasterEdited();
    else loadMasterRaw();
}

function onSearchMaster() {
    if (masterCurrentView === 'edited') { editedPage = 0; loadMasterEdited(); }
    else { rawPage = 0; loadMasterRaw(); }
}

async function loadMasterEdited() {
    const search = document.getElementById('masterSearch').value;
    const offset = editedPage * PAGE_SIZE;
    const res = await fetch(`/api/customers?limit=${PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(search)}`);
    const data = await res.json();
    const tbody = document.getElementById('masterTableBody');
    tbody.innerHTML = '';
    if (!data.data || data.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Tidak ada data ditemukan.</td></tr>`;
    } else {
        data.data.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color:var(--muted);font-size:.8rem">${offset + i + 1}</td>
                <td><strong style="font-size:.87rem">${row.CUST_NAME}</strong></td>
                <td>${row.C1_Produk}</td>
                <td>${Number(row.C2_Karakteristik).toFixed(4)}</td>
                <td>${row.C3_Durasi} bln</td>
                <td style="font-weight:700;color:var(--red)">${fmtCurrency(row.C4_Revenue)}</td>
                 <td style="display:flex;gap:.4rem">
                     <button class="btn-icon" onclick='openEditModal(${JSON.stringify(row)})' title="Edit">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                     </button>
                     <button class="btn-icon danger" onclick="deleteCust('${row.CUST_NAME.replace(/'/g,"\\'")}')" title="Hapus">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                     </button>
                 </td>`;
            tbody.appendChild(tr);
        });
    }
    renderPagination('editedPagination', editedPage, data.total, PAGE_SIZE, p => { editedPage = p; loadMasterEdited(); });
}

async function loadMasterRaw() {
    const search = document.getElementById('masterSearch').value;
    const offset = rawPage * PAGE_SIZE;
    const res = await fetch(`/api/raw_transactions?limit=${PAGE_SIZE}&offset=${offset}&search=${encodeURIComponent(search)}`);
    const data = await res.json();

    // Build header from columns
    const thead = document.getElementById('rawTableHead');
    if (data.columns && data.columns.length > 0) {
        thead.innerHTML = '<tr>' + data.columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
    }

    const tbody = document.getElementById('rawTableBody');
    tbody.innerHTML = '';
    if (!data.data || data.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="empty-row">Tidak ada data.</td></tr>`;
    } else {
        data.data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = (data.columns || []).map(col => {
                let val = row[col] ?? '';
                if (col === 'LOCAL_AMOUNT') val = fmtCurrency(val);
                return `<td style="white-space:nowrap;font-size:.8rem">${val}</td>`;
            }).join('');
            tbody.appendChild(tr);
        });
    }
    renderPagination('rawPagination', rawPage, data.total, PAGE_SIZE, p => { rawPage = p; loadMasterRaw(); });
}

function renderPagination(containerId, currentPage, total, pageSize, callback) {
    const totalPages = Math.ceil(total / pageSize) || 1;
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <button class="btn-ghost" ${currentPage === 0 ? 'disabled' : ''} onclick="(${callback.toString()})(${currentPage - 1})">← Prev</button>
        <span>Halaman ${currentPage + 1} dari ${totalPages} (${total.toLocaleString('id-ID')} data)</span>
        <button class="btn-ghost" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="(${callback.toString()})(${currentPage + 1})">Next →</button>
    `;
}

async function deleteCust(name) {
    if (!confirm(`Hapus pelanggan "${name}"?`)) return;
    const res = await fetch(`/api/customers/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.ok) { showToast('Pelanggan berhasil dihapus.', 'success'); loadMasterEdited(); }
    else showToast('Gagal menghapus.', 'error');
}

// ===== EDIT MODAL =====
function openEditModal(row) {
    document.getElementById('editOrigName').value = row.CUST_NAME;
    document.getElementById('editCustName').value = row.CUST_NAME;
    document.getElementById('editC1').value = row.C1_Produk;
    const totalRev = row.C4_Revenue || 0;
    const c2 = row.C2_Karakteristik || 1;
    const scaling = (c2 - 1) * totalRev;
    const sustain = totalRev - scaling;
    document.getElementById('editRevScaling').value = Math.max(0, Math.round(scaling));
    document.getElementById('editRevSustain').value = Math.max(0, Math.round(sustain));
    document.getElementById('editC3').value = row.C3_Durasi;
    document.getElementById('editDurationBadge').textContent = `Durasi: ${row.C3_Durasi} bulan`;
    document.getElementById('editMonthStart').value = '';
    document.getElementById('editMonthEnd').value = '';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function submitEditForm(e) {
    e.preventDefault();
    const name = document.getElementById('editOrigName').value;
    const payload = {
        C1_Produk: parseInt(document.getElementById('editC1').value),
        Rev_Scaling: parseFloat(document.getElementById('editRevScaling').value) || 0,
        Rev_Sustain: parseFloat(document.getElementById('editRevSustain').value) || 0,
        C3_Durasi: parseInt(document.getElementById('editC3').value)
    };
    const res = await fetch(`/api/customers/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) { showToast('Data pelanggan diperbarui.', 'success'); closeEditModal(); loadMasterEdited(); }
    else { const err = await res.json(); showToast('Gagal: ' + err.detail, 'error'); }
}

// ===== TAMBAH PELANGGAN =====
function listenRevenueInputs() {
    ['addRevScaling', 'addRevSustain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            const s = parseFloat(document.getElementById('addRevScaling').value) || 0;
            const su = parseFloat(document.getElementById('addRevSustain').value) || 0;
            document.getElementById('addRevenuePreview').textContent = fmtCurrency(s + su);
        });
    });
}

function recalcDuration(prefix) {
    const startEl = document.getElementById(prefix + 'MonthStart');
    const endEl = document.getElementById(prefix + 'MonthEnd');
    const badgeEl = document.getElementById(prefix + 'DurationBadge');
    const c3El = document.getElementById(prefix + 'C3');
    if (!startEl || !endEl || !startEl.value || !endEl.value) return;
    const [sy, sm] = startEl.value.split('-').map(Number);
    const [ey, em] = endEl.value.split('-').map(Number);
    const months = (ey - sy) * 12 + (em - sm) + 1;
    if (months > 0) {
        badgeEl.textContent = `Durasi: ${months} bulan (${startEl.value} → ${endEl.value})`;
        if (c3El) c3El.value = months;
    } else {
        badgeEl.textContent = 'Bulan selesai harus setelah bulan mulai.';
    }
}

async function submitAddForm(e) {
    e.preventDefault();
    const payload = {
        CUST_NAME: document.getElementById('addCustName').value.trim(),
        C1_Produk: parseInt(document.getElementById('addC1').value) || 1,
        Rev_Scaling: parseFloat(document.getElementById('addRevScaling').value) || 0,
        Rev_Sustain: parseFloat(document.getElementById('addRevSustain').value) || 0,
        C3_Durasi: parseInt(document.getElementById('addC3').value) || 1
    };
    if (!payload.CUST_NAME) { showToast('Nama pelanggan wajib diisi.', 'error'); return; }
    const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        showToast(`Pelanggan "${payload.CUST_NAME}" berhasil ditambahkan.`, 'success');
        resetAddForm();
        // Live update: refresh dashboard & data master tanpa pindah tab
        await loadDashboard();
        loadMasterEdited();
        switchTab('datamaster');
    } else {
        const err = await res.json();
        showToast('Gagal: ' + err.detail, 'error');
    }
}

function resetAddForm() {
    document.getElementById('addCustName').value = '';
    document.getElementById('addC1').value = 1;
    document.getElementById('addRevScaling').value = 0;
    document.getElementById('addRevSustain').value = 0;
    document.getElementById('addC3').value = 1;
    document.getElementById('addMonthStart').value = '';
    document.getElementById('addMonthEnd').value = '';
    document.getElementById('addRevenuePreview').textContent = 'Rp 0';
    document.getElementById('addDurationBadge').textContent = 'Durasi: — bulan';
}

// ===== IMPORT EXCEL =====
async function importExcel(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        showToast('Format file harus .xlsx atau .xls', 'error');
        input.value = '';
        return;
    }
    showToast('Mengimpor data...', '');
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch('/api/import_excel', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            // Live update: refresh dashboard, data master, dan stats revenue
            await loadDashboard();
            loadMasterEdited();
            statsCache = null; // force reload stats berikutnya
        } else {
            showToast('Gagal: ' + (data.detail || 'Error tidak diketahui'), 'error');
        }
    } catch (e) {
        showToast('Gagal menghubungi server.', 'error');
    }
    input.value = '';
}

function downloadTemplate() {
    window.location.href = '/api/download_template';
}
