// ── State ────────────────────────────────────────────────────────────────────

let currentTab = 'single';
let currentJobId = null;
let batchJobId = null;
let eventSource = null;

// ── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('panel-single').classList.toggle('hidden', tab !== 'single');
  document.getElementById('panel-batch').classList.toggle('hidden', tab !== 'batch');
  document.getElementById('tab-single').classList.toggle('active-tab', tab === 'single');
  document.getElementById('tab-batch').classList.toggle('active-tab', tab === 'batch');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setLoading(btn, loading, originalText) {
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ Memproses...' : originalText;
  btn.classList.toggle('opacity-60', loading);
  btn.classList.toggle('cursor-not-allowed', loading);
}

function connectSSE(jobId, onMessage) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/events/${jobId}`);
  eventSource.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch (_) {}
  };
  eventSource.onerror = () => {
    eventSource.close();
    eventSource = null;
  };
}

// ── SINGLE DOWNLOAD ─────────────────────────────────────────────────────────

async function fetchInfo() {
  const url = document.getElementById('singleUrl').value.trim();
  if (!url) return alert('Masukkan URL YouTube terlebih dahulu');

  const btn = document.getElementById('btnInfo');
  setLoading(btn, true, 'Cek Info');

  // Reset
  document.getElementById('infoCard').classList.add('hidden');
  document.getElementById('singleProgress').classList.add('hidden');
  document.getElementById('singleResult').classList.add('hidden');
  document.getElementById('singleError').classList.add('hidden');

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Gagal mengambil info video');

    document.getElementById('infoThumb').src = data.thumbnail || '';
    document.getElementById('infoTitle').textContent = data.title;
    document.getElementById('infoChannel').textContent = `🎤 ${data.channel}`;
    document.getElementById('infoDuration').textContent = `⏱ ${formatDuration(data.duration)}`;
    document.getElementById('infoCard').classList.remove('hidden');
  } catch (err) {
    document.getElementById('singleErrorMsg').textContent = err.message;
    document.getElementById('singleError').classList.remove('hidden');
  } finally {
    setLoading(btn, false, 'Cek Info');
  }
}

async function startSingleDownload() {
  const url = document.getElementById('singleUrl').value.trim();
  if (!url) return alert('Masukkan URL YouTube terlebih dahulu');

  const quality = document.getElementById('singleQuality').value;
  const btn = document.getElementById('btnSingleDl');
  setLoading(btn, true, '⬇ Download MP3');

  // Show progress, hide others
  document.getElementById('singleProgress').classList.remove('hidden');
  document.getElementById('singleResult').classList.add('hidden');
  document.getElementById('singleError').classList.add('hidden');
  document.getElementById('singleBar').style.width = '0%';
  document.getElementById('singlePercent').textContent = '0%';
  document.getElementById('singleStage').textContent = 'Memulai unduhan...';

  try {
    const res = await fetch('/api/download/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memulai unduhan');

    currentJobId = data.jobId;

    connectSSE(data.jobId, (msg) => {
      if (msg.type === 'progress') {
        const pct = Math.round(msg.percent);
        document.getElementById('singleBar').style.width = pct + '%';
        document.getElementById('singlePercent').textContent = pct + '%';
        document.getElementById('singleStage').textContent =
          msg.stage === 'converting' ? 'Mengonversi ke MP3...' : `Mengunduh... ${pct}%`;
      }
      if (msg.type === 'done') {
        document.getElementById('singleProgress').classList.add('hidden');
        document.getElementById('singleResultTitle').textContent = msg.title + '.mp3';
        document.getElementById('singleResultLink').href = `/api/file/${encodeURIComponent(msg.filename)}`;
        document.getElementById('singleResult').classList.remove('hidden');
        setLoading(btn, false, '⬇ Download MP3');
        if (eventSource) eventSource.close();
      }
      if (msg.type === 'error') {
        document.getElementById('singleProgress').classList.add('hidden');
        document.getElementById('singleErrorMsg').textContent = msg.error;
        document.getElementById('singleError').classList.remove('hidden');
        setLoading(btn, false, '⬇ Download MP3');
        if (eventSource) eventSource.close();
      }
    });
  } catch (err) {
    document.getElementById('singleProgress').classList.add('hidden');
    document.getElementById('singleErrorMsg').textContent = err.message;
    document.getElementById('singleError').classList.remove('hidden');
    setLoading(btn, false, '⬇ Download MP3');
  }
}

// ── BATCH DOWNLOAD ──────────────────────────────────────────────────────────

function createBatchCard(index, url) {
  return `
    <div id="batch-item-${index}" class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate" id="batch-title-${index}">${url}</p>
          <p class="text-xs text-gray-500 truncate">${url}</p>
        </div>
        <span id="batch-badge-${index}" class="badge-pending text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap">Menunggu</span>
      </div>
      <div class="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div id="batch-bar-${index}" class="progress-bar bg-gradient-to-r from-red-600 to-red-400 h-full rounded-full" style="width:0%"></div>
      </div>
      <div id="batch-actions-${index}" class="hidden pt-1">
        <a id="batch-link-${index}" href="#" class="text-xs text-emerald-400 hover:text-emerald-300 font-medium">⬇ Unduh file ini</a>
      </div>
    </div>
  `;
}

function updateBatchBadge(index, status, text) {
  const badge = document.getElementById(`batch-badge-${index}`);
  if (!badge) return;
  badge.className = `badge-${status} text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap`;
  badge.textContent = text;
}

async function startBatchDownload() {
  const raw = document.getElementById('batchUrls').value.trim();
  if (!raw) return alert('Masukkan link YouTube (satu per baris)');

  const urls = raw.split('\n').map(u => u.trim()).filter(u => u.length > 0);
  if (urls.length === 0) return alert('Tidak ada link yang valid');

  const quality = document.getElementById('batchQuality').value;
  const btn = document.getElementById('btnBatchDl');
  setLoading(btn, true, '📦 Mulai Antrean');

  // Build queue UI
  const queueEl = document.getElementById('batchQueue');
  queueEl.innerHTML = urls.map((u, i) => createBatchCard(i, u)).join('');
  queueEl.classList.remove('hidden');
  document.getElementById('batchActions').classList.add('hidden');

  try {
    const res = await fetch('/api/download/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, quality })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memulai batch');

    batchJobId = data.jobId;

    connectSSE(data.jobId, (msg) => {
      const i = msg.index;

      if (msg.type === 'start') {
        updateBatchBadge(i, 'download', 'Mengunduh...');
        const card = document.getElementById(`batch-item-${i}`);
        if (card) card.classList.add('pulse-active');
      }

      if (msg.type === 'progress') {
        const pct = Math.round(msg.percent);
        const bar = document.getElementById(`batch-bar-${i}`);
        if (bar) bar.style.width = pct + '%';

        if (msg.stage === 'converting') {
          updateBatchBadge(i, 'convert', 'Mengonversi...');
        } else {
          updateBatchBadge(i, 'download', `Mengunduh ${pct}%`);
        }
      }

      if (msg.type === 'done') {
        const bar = document.getElementById(`batch-bar-${i}`);
        if (bar) bar.style.width = '100%';

        const card = document.getElementById(`batch-item-${i}`);
        if (card) card.classList.remove('pulse-active');

        updateBatchBadge(i, 'done', 'Selesai ✓');

        const title = document.getElementById(`batch-title-${i}`);
        if (title) title.textContent = msg.title || msg.filename;

        const actions = document.getElementById(`batch-actions-${i}`);
        const link = document.getElementById(`batch-link-${i}`);
        if (actions && link) {
          link.href = `/api/file/${encodeURIComponent(msg.filename)}`;
          actions.classList.remove('hidden');
        }
      }

      if (msg.type === 'error') {
        updateBatchBadge(i, 'error', 'Gagal ✗');
        const card = document.getElementById(`batch-item-${i}`);
        if (card) card.classList.remove('pulse-active');
      }

      if (msg.type === 'batch-complete') {
        document.getElementById('batchActions').classList.remove('hidden');
        setLoading(btn, false, '📦 Mulai Antrean');
        if (eventSource) eventSource.close();
      }
    });
  } catch (err) {
    alert('Error: ' + err.message);
    setLoading(btn, false, '📦 Mulai Antrean');
  }
}

function downloadZip() {
  if (!batchJobId) return alert('Tidak ada batch job');
  window.location.href = `/api/download-zip/${batchJobId}`;
}

function openFolder() {
  fetch('/api/open-folder', { method: 'POST' });
}

// ── Keyboard shortcut: Enter on single URL input ────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('singleUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchInfo();
  });
});
