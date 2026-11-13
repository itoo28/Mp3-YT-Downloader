const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const os = require('os');

const app = express();
const PORT = 3000;

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ── Resolve yt-dlp and ffmpeg paths ─────────────────────────────────────────
// winget installs to WinGet\Links which may not be in the current shell's PATH

function findBinary(name) {
  // 1. Check if already on PATH
  const { execFileSync } = require('child_process');
  try {
    const result = execFileSync('where', [name], { encoding: 'utf-8', timeout: 5000 });
    const first = result.trim().split('\n')[0].trim();
    if (first) return first;
  } catch (_) {}

  // 2. Check WinGet Links folder
  const wingetLinks = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links');
  const exe = path.join(wingetLinks, `${name}.exe`);
  if (fs.existsSync(exe)) return exe;

  // 3. Fallback to name (hope it's on PATH)
  return name;
}

const YTDLP_PATH = findBinary('yt-dlp');
const FFMPEG_DIR = path.dirname(findBinary('ffmpeg'));
console.log(`  yt-dlp : ${YTDLP_PATH}`);
console.log(`  ffmpeg : ${FFMPEG_DIR}`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory job tracking ──────────────────────────────────────────────────

const jobs = new Map();          // jobId → { items: [...], status, zipReady }
const sseClients = new Map();    // jobId → [res, ...]

function broadcast(jobId, data) {
  const clients = sseClients.get(jobId) || [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(msg));
}

// ── API: Get video info ─────────────────────────────────────────────────────

app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL tidak boleh kosong' });

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    url
  ];

  execFile(YTDLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: stderr || err.message });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        title: info.title,
        channel: info.channel || info.uploader || 'Unknown',
        duration: info.duration,
        thumbnail: info.thumbnail,
        url: info.webpage_url
      });
    } catch (e) {
      res.status(500).json({ error: 'Gagal mem-parsing info video' });
    }
  });
});

// ── SSE: Real-time progress stream ──────────────────────────────────────────

app.get('/api/events/:jobId', (req, res) => {
  const { jobId } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('\n');

  if (!sseClients.has(jobId)) sseClients.set(jobId, []);
  sseClients.get(jobId).push(res);

  req.on('close', () => {
    const arr = sseClients.get(jobId) || [];
    sseClients.set(jobId, arr.filter(c => c !== res));
  });
});

// ── Helper: run yt-dlp for one URL ──────────────────────────────────────────

function downloadOne(url, quality, jobId, itemIndex) {
  return new Promise((resolve, reject) => {
    const qualityMap = { '128': '128K', '192': '192K', '320': '320K' };
    const bitrate = qualityMap[quality] || '192K';

    const args = [
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', bitrate,
      '--newline',
      '--no-playlist',
      '-o', path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s'),
      url
    ];

    const proc = spawn(YTDLP_PATH, args, {
      env: { ...process.env, PATH: FFMPEG_DIR + path.delimiter + (process.env.PATH || '') }
    });
    let title = '';
    let lastPercent = 0;

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        // Parse download progress
        const dlMatch = line.match(/\[download\]\s+([\d.]+)%/);
        if (dlMatch) {
          const percent = parseFloat(dlMatch[1]);
          if (percent - lastPercent >= 1 || percent >= 100) {
            lastPercent = percent;
            broadcast(jobId, { type: 'progress', index: itemIndex, percent, stage: 'downloading' });
          }
        }
        // Parse destination filename for title
        const destMatch = line.match(/\[download\] Destination:\s+(.+)/);
        if (destMatch) {
          title = path.basename(destMatch[1]).replace(/\.[^.]+$/, '');
        }
        // ffmpeg / conversion stage
        if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
          broadcast(jobId, { type: 'progress', index: itemIndex, percent: 100, stage: 'converting' });
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      // yt-dlp sometimes writes progress to stderr
      const line = chunk.toString();
      const dlMatch = line.match(/\[download\]\s+([\d.]+)%/);
      if (dlMatch) {
        const percent = parseFloat(dlMatch[1]);
        if (percent - lastPercent >= 1 || percent >= 100) {
          lastPercent = percent;
          broadcast(jobId, { type: 'progress', index: itemIndex, percent, stage: 'downloading' });
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited with code ${code}`));
      }

      // Find the actual mp3 file produced
      const files = fs.readdirSync(DOWNLOADS_DIR)
        .filter(f => f.endsWith('.mp3'))
        .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

      if (files.length === 0) {
        return reject(new Error('File MP3 tidak ditemukan setelah konversi'));
      }

      const filename = files[0].name;
      resolve({ filename, title: title || filename.replace('.mp3', '') });
    });
  });
}

// ── API: Single download ────────────────────────────────────────────────────

app.post('/api/download/single', async (req, res) => {
  const { url, quality } = req.body;
  if (!url) return res.status(400).json({ error: 'URL tidak boleh kosong' });

  const jobId = `single-${Date.now()}`;
  jobs.set(jobId, { items: [{ url, status: 'pending' }], status: 'running' });

  res.json({ jobId });

  try {
    const result = await downloadOne(url, quality || '192', jobId, 0);
    const job = jobs.get(jobId);
    job.items[0] = { ...job.items[0], status: 'done', filename: result.filename, title: result.title };
    job.status = 'done';
    broadcast(jobId, { type: 'done', index: 0, filename: result.filename, title: result.title });
  } catch (err) {
    const job = jobs.get(jobId);
    if (job) {
      job.items[0] = { ...job.items[0], status: 'error', error: err.message };
      job.status = 'error';
    }
    broadcast(jobId, { type: 'error', index: 0, error: err.message });
  }
});

// ── API: Batch download ─────────────────────────────────────────────────────

app.post('/api/download/batch', async (req, res) => {
  const { urls, quality } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Daftar URL tidak boleh kosong' });
  }

  const jobId = `batch-${Date.now()}`;
  const items = urls.map(u => ({ url: u.trim(), status: 'pending', filename: null, title: null }));
  jobs.set(jobId, { items, status: 'running', zipReady: false });

  res.json({ jobId, total: urls.length });

  // Process sequentially so we don't overload bandwidth
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    broadcast(jobId, { type: 'start', index: i, url: item.url });

    try {
      const result = await downloadOne(item.url, quality || '192', jobId, i);
      item.status = 'done';
      item.filename = result.filename;
      item.title = result.title;
      broadcast(jobId, { type: 'done', index: i, filename: result.filename, title: result.title });
    } catch (err) {
      item.status = 'error';
      item.error = err.message;
      broadcast(jobId, { type: 'error', index: i, error: err.message });
    }
  }

  const job = jobs.get(jobId);
  job.status = 'done';
  broadcast(jobId, { type: 'batch-complete', jobId });
});

// ── API: Download a single MP3 file ─────────────────────────────────────────

app.get('/api/file/:filename', (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  res.download(filePath);
});

// ── API: Download all as ZIP ────────────────────────────────────────────────

app.get('/api/download-zip/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });

  const doneItems = job.items.filter(i => i.status === 'done' && i.filename);
  if (doneItems.length === 0) return res.status(400).json({ error: 'Tidak ada file yang berhasil diunduh' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="youtube-mp3-batch.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.pipe(res);

  for (const item of doneItems) {
    const filePath = path.join(DOWNLOADS_DIR, item.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: item.filename });
    }
  }

  archive.finalize();
});

// ── API: Open downloads folder in Windows Explorer ──────────────────────────

app.post('/api/open-folder', (req, res) => {
  spawn('explorer', [DOWNLOADS_DIR], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});

// ── API: Job status ─────────────────────────────────────────────────────────

app.get('/api/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });
  res.json(job);
});

// ── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ✅  YouTube MP3 Downloader berjalan di http://localhost:${PORT}\n`);
});
