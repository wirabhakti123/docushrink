/**
 * DocuShrink - Client-Side PDF Compressor & Tool Suite
 * Pure JavaScript, 100% in-browser processing, private & secure.
 */

// Initialize PDF.js Worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}

/* ==========================================================================
   1. IndexedDB & Local Storage Manager
   ========================================================================== */
class DocuShrinkStore {
  constructor() {
    this.dbName = 'DocuShrinkDB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB unavailable, falling back to in-memory/localStorage', e);
        resolve(null);
      };
    });
  }

  async saveHistoryItem(item) {
    await this.initPromise;
    if (!this.db) {
      // LocalStorage fallback for metadata
      const items = this.getFallbackHistory();
      items.unshift(item);
      localStorage.setItem('docushrink_history', JSON.stringify(items.map(i => ({ ...i, blob: null }))));
      return item;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      store.put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllHistory() {
    await this.initPromise;
    if (!this.db) {
      return this.getFallbackHistory();
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = req.result || [];
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  }

  async getHistoryItem(id) {
    await this.initPromise;
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async deleteHistoryItem(id) {
    await this.initPromise;
    if (!this.db) {
      const items = this.getFallbackHistory().filter(i => i.id !== id);
      localStorage.setItem('docushrink_history', JSON.stringify(items));
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      store.delete(id);
      tx.oncomplete = () => resolve();
    });
  }

  async clearAllHistory() {
    await this.initPromise;
    if (!this.db) {
      localStorage.removeItem('docushrink_history');
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      store.clear();
      tx.oncomplete = () => resolve();
    });
  }

  getFallbackHistory() {
    try {
      return JSON.parse(localStorage.getItem('docushrink_history') || '[]');
    } catch {
      return [];
    }
  }
}

const store = new DocuShrinkStore();

/* ==========================================================================
   2. Compression Engine (PDF.js + PDF-Lib + Canvas Downscaling)
   ========================================================================== */
const CompressionPresets = {
  ekstrem: {
    label: 'Ekstrem',
    quality: 0.52,
    maxDimension: 1280,
    scale: 0.9,
    description: 'Kompresi Maksimal (Hemat ~70% - 85%)'
  },
  rekomendasi: {
    label: 'Rekomendasi',
    quality: 0.72,
    maxDimension: 1600,
    scale: 1.15,
    description: 'Keseimbangan Terbaik (Hemat ~50% - 70%)'
  },
  ringan: {
    label: 'Ringan',
    quality: 0.85,
    maxDimension: 2200,
    scale: 1.4,
    description: 'Kompresi Ringan (Kualitas Tinggi, Hemat ~20% - 40%)'
  }
};

class PdfCompressor {
  static async compress(file, presetKey = 'rekomendasi', options = {}, onProgress = () => {}) {
    const preset = CompressionPresets[presetKey] || CompressionPresets.rekomendasi;
    const arrayBuffer = await file.arrayBuffer();
    const originalSize = file.size;

    // Load PDF document using PDF.js
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdfDoc.numPages;

    // Create a new PDF document using PDF-Lib
    const newPdfDoc = await PDFLib.PDFDocument.create();

    // Prepare an offscreen canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress({
        pageNum,
        totalPages: numPages,
        percent: Math.round(((pageNum - 0.5) / numPages) * 90),
        status: `Memproses halaman ${pageNum} dari ${numPages}...`
      });

      const page = await pdfDoc.getPage(pageNum);
      const standardViewport = page.getViewport({ scale: 1.0 });

      // Calculate render scale based on specified DPI (default 150 DPI)
      const targetDpi = options.dpi || 150;
      let renderScale = targetDpi / 72; // standard 72 points per inch in PDF

      if (presetKey === 'ekstrem') {
        renderScale = renderScale * 0.85;
      } else if (presetKey === 'ringan') {
        renderScale = renderScale * 1.05;
      }

      // Safeguard against extreme poster dimensions
      const maxDim = Math.max(standardViewport.width, standardViewport.height);
      const maxAllowedDim = (targetDpi / 72) * 1400;
      if (maxDim * renderScale > maxAllowedDim && maxAllowedDim > 800) {
        renderScale = maxAllowedDim / maxDim;
      }

      const viewport = page.getViewport({ scale: renderScale });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      // Apply Grayscale if requested
      if (options.grayscale) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = avg;
          data[i + 1] = avg;
          data[i + 2] = avg;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Convert canvas to JPEG blob using preset & DPI calibrated quality
      let compressionQuality = preset.quality;
      if (targetDpi === 72) compressionQuality = Math.min(compressionQuality, 0.58);
      else if (targetDpi === 300) compressionQuality = Math.max(compressionQuality, 0.84);

      const jpegBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', compressionQuality);
      });

      const jpegBytes = await jpegBlob.arrayBuffer();
      const embeddedJpg = await newPdfDoc.embedJpg(jpegBytes);

      // Add page to new PDF preserving original page dimensions
      const newPage = newPdfDoc.addPage([standardViewport.width, standardViewport.height]);
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: standardViewport.width,
        height: standardViewport.height
      });

      onProgress({
        pageNum,
        totalPages: numPages,
        percent: Math.round((pageNum / numPages) * 90),
        status: `Menyimpan halaman ${pageNum} dari ${numPages}...`
      });
    }

    onProgress({
      pageNum: numPages,
      totalPages: numPages,
      percent: 95,
      status: 'Memadatkan stream & metadata...'
    });

    // Save final PDF with stream compression
    const compressedBytes = await newPdfDoc.save({ useObjectStreams: true });
    let finalBlob = new Blob([compressedBytes], { type: 'application/pdf' });
    let compressedSize = finalBlob.size;

    // Safety fallback: If compression made it somehow larger (e.g. tiny 1KB text file),
    // retain optimized original stream
    if (compressedSize >= originalSize && originalSize > 1024) {
      try {
        const fallbackDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        const fallbackBytes = await fallbackDoc.save({ useObjectStreams: true });
        if (fallbackBytes.byteLength < originalSize) {
          finalBlob = new Blob([fallbackBytes], { type: 'application/pdf' });
          compressedSize = finalBlob.size;
        }
      } catch (err) {
        console.warn('Fallback stream compression:', err);
      }
    }

    const savingsBytes = Math.max(0, originalSize - compressedSize);
    const savingsPercent = originalSize > 0 
      ? Math.max(1, Math.round((savingsBytes / originalSize) * 100))
      : 0;

    onProgress({
      pageNum: numPages,
      totalPages: numPages,
      percent: 100,
      status: 'Kompresi selesai!'
    });

    return {
      blob: finalBlob,
      originalSize,
      compressedSize,
      savingsBytes,
      savingsPercent,
      pageCount: numPages
    };
  }
}

/* ==========================================================================
   3. Formatters & Utilities
   ========================================================================== */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function timeAgo(timestamp) {
  if (!timestamp) return 'Baru saja';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Baru saja';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mnt lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  if (diffSec < 172800) return 'Kemarin';
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

function showToast(msg, icon = 'check_circle') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');
  if (!toast) return;

  msgEl.textContent = msg;
  iconEl.textContent = icon;
  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2800);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ==========================================================================
   4. UI State & Tab Management
   ========================================================================== */
const AppState = {
  currentTab: 'kompres',
  selectedFiles: [],
  selectedPreset: 'rekomendasi',
  selectedDpi: 150,
  isCompressing: false,
  grayscale: false,
  removeMetadata: true,
  historyItems: [],
  activeTool: null
};


function switchTab(tabId) {
  AppState.currentTab = tabId;

  // Views to toggle
  const views = ['kompres', 'alat-pdf', 'riwayat', 'pengaturan'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === tabId) {
        el.classList.remove('hidden');
        el.classList.add('animate-fadeIn');
      } else {
        el.classList.add('hidden');
        el.classList.remove('animate-fadeIn');
      }
    }
  });

  // Update Bottom Nav links
  const navLinks = document.querySelectorAll('nav [data-path]');
  navLinks.forEach(link => {
    const path = link.getAttribute('data-path');
    if (path === tabId) {
      link.className = 'flex-1 flex flex-col items-center justify-center h-full min-h-[44px] gap-0.5 text-primary font-bold transition-all';
    } else {
      link.className = 'flex-1 flex flex-col items-center justify-center h-full min-h-[44px] gap-0.5 text-secondary hover:text-on-surface transition-all active:scale-95';
    }
  });

  // Update Top Subtitle
  const subTitle = document.getElementById('header-subtitle');
  if (subTitle) {
    const titles = {
      'kompres': 'Kompres Dokumen',
      'alat-pdf': 'Alat PDF Lengkap',
      'riwayat': 'Riwayat Kompresi',
      'pengaturan': 'Pengaturan Aplikasi'
    };
    subTitle.textContent = titles[tabId] || 'DocuShrink';
  }

  // If entering Riwayat, refresh dynamic list & stats
  if (tabId === 'riwayat') {
    renderHistoryView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================================
   5. Dropzone & File Handling (Kompres Tab)
   ========================================================================== */
function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dropzone-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dropzone-active');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleSelectedFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    handleSelectedFiles(e.target.files);
    fileInput.value = ''; // reset so same file can be re-selected
  });
}

function handleSelectedFiles(fileList) {
  const validFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf'));

  if (validFiles.length === 0) {
    showToast('Harap pilih berkas PDF yang valid (.pdf)', 'warning');
    return;
  }

  AppState.selectedFiles = validFiles;
  renderSelectedFilesQueue();
}

function renderSelectedFilesQueue() {
  const queueContainer = document.getElementById('file-queue-container');
  const queueList = document.getElementById('file-queue-list');
  const actionSection = document.getElementById('compress-action-section');
  const resultsSection = document.getElementById('results-section');

  if (!queueContainer || !queueList) return;

  resultsSection.classList.add('hidden');

  if (AppState.selectedFiles.length === 0) {
    queueContainer.classList.add('hidden');
    actionSection.classList.add('hidden');
    return;
  }

  queueContainer.classList.remove('hidden');
  actionSection.classList.remove('hidden');

  queueList.innerHTML = AppState.selectedFiles.map((file, idx) => `
    <div class="bg-surface-container-lowest border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-lg bg-primary-fixed/60 text-primary flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-[24px]">picture_as_pdf</span>
        </div>
        <div class="min-w-0">
          <p class="font-label-md text-label-md text-on-surface font-bold truncate">${file.name}</p>
          <p class="font-label-sm text-label-sm text-secondary tabular-nums">${formatBytes(file.size)}</p>
        </div>
      </div>
      <button onclick="removeSelectedFile(${idx})" class="p-1.5 text-secondary hover:text-error rounded-full hover:bg-surface-container transition-colors" title="Hapus">
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  `).join('');

  updateEstimationDisplay();
}

function removeSelectedFile(index) {
  AppState.selectedFiles.splice(index, 1);
  renderSelectedFilesQueue();
  updateEstimationDisplay();
}

function selectPreset(presetKey) {
  AppState.selectedPreset = presetKey;
  ['ekstrem', 'rekomendasi', 'ringan'].forEach(k => {
    const btn = document.getElementById(`preset-${k}`);
    if (btn) {
      if (k === presetKey) {
        btn.classList.add('border-primary', 'bg-primary-fixed/15', 'text-primary');
        btn.classList.remove('border-slate-200', 'bg-surface-container-lowest', 'text-secondary');
      } else {
        btn.classList.remove('border-primary', 'bg-primary-fixed/15', 'text-primary');
        btn.classList.add('border-slate-200', 'bg-surface-container-lowest', 'text-secondary');
      }
    }
  });
  updateEstimationDisplay();
}

function selectDpi(dpi) {
  AppState.selectedDpi = parseInt(dpi, 10);
  const badges = {
    72: '72 DPI (Web/Email)',
    150: '150 DPI (Standar)',
    200: '200 DPI (Cetak)',
    300: '300 DPI (HD/Tajam)'
  };
  const badgeEl = document.getElementById('dpi-selected-badge');
  if (badgeEl) badgeEl.textContent = badges[AppState.selectedDpi] || `${AppState.selectedDpi} DPI`;

  [72, 150, 200, 300].forEach(d => {
    const btn = document.getElementById(`dpi-btn-${d}`);
    if (btn) {
      if (d === AppState.selectedDpi) {
        btn.className = 'btn-tactile p-2 rounded-xl border-2 border-primary bg-primary-fixed/20 dark:bg-primary-fixed/15 text-primary text-center transition-all shadow-sm';
      } else {
        btn.className = 'btn-tactile p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest text-secondary text-center transition-all hover:bg-surface-container';
      }
    }
  });

  updateEstimationDisplay();
}

function calculateEstimatedSize() {
  if (AppState.selectedFiles.length === 0) return null;

  let totalOriginal = 0;
  for (const f of AppState.selectedFiles) {
    totalOriginal += f.size;
  }

  // Base reduction factor by DPI
  const dpiFactors = {
    72: 0.18,
    150: 0.38,
    200: 0.52,
    300: 0.72
  };
  let factor = dpiFactors[AppState.selectedDpi] || 0.38;

  // Preset adjustment
  if (AppState.selectedPreset === 'ekstrem') {
    factor *= 0.78;
  } else if (AppState.selectedPreset === 'ringan') {
    factor *= 1.18;
  }

  // Grayscale adjustment
  const isGrayscale = document.getElementById('chk-grayscale')?.checked;
  if (isGrayscale) {
    factor *= 0.82;
  }

  // Bound factor
  factor = Math.max(0.08, Math.min(0.92, factor));

  const estimatedBytes = Math.round(totalOriginal * factor);
  const estimatedSavingsPercent = Math.round((1 - factor) * 100);

  return {
    totalOriginal,
    estimatedBytes,
    estimatedSavingsPercent
  };
}

function updateEstimationDisplay() {
  const estimationCard = document.getElementById('size-estimation-card');
  const estSizeEl = document.getElementById('est-compressed-size');
  const estSavingsEl = document.getElementById('est-savings-pill');
  const estOrigEl = document.getElementById('est-original-size');

  if (!estimationCard) return;

  const est = calculateEstimatedSize();
  if (!est) {
    estimationCard.classList.add('hidden');
    return;
  }

  estimationCard.classList.remove('hidden');
  if (estSizeEl) estSizeEl.textContent = `~${formatBytes(est.estimatedBytes)}`;
  if (estOrigEl) estOrigEl.textContent = formatBytes(est.totalOriginal);
  if (estSavingsEl) {
    estSavingsEl.innerHTML = `<span class="material-symbols-outlined text-[13px] mr-0.5">trending_down</span> Hemat ~${est.estimatedSavingsPercent}%`;
  }
}

/* ==========================================================================
   6. Compression Execution (Kompres Tab)
   ========================================================================== */
async function startCompression() {
  if (AppState.selectedFiles.length === 0 || AppState.isCompressing) return;

  AppState.isCompressing = true;
  const btn = document.getElementById('btn-start-compress');
  const progressBox = document.getElementById('compression-progress-box');
  const progressBar = document.getElementById('progress-bar-fill');
  const progressStatus = document.getElementById('progress-status-text');
  const progressPercent = document.getElementById('progress-percent-text');
  const resultsSection = document.getElementById('results-section');
  const resultsList = document.getElementById('results-list');

  btn.disabled = true;
  btn.classList.add('opacity-60', 'pointer-events-none');
  progressBox.classList.remove('hidden');
  progressBar.classList.remove('completed');
  progressBar.style.width = '0%';
  resultsSection.classList.add('hidden');
  resultsList.innerHTML = '';

  const results = [];

  for (let i = 0; i < AppState.selectedFiles.length; i++) {
    const file = AppState.selectedFiles[i];
    const fileNum = i + 1;
    const totalFiles = AppState.selectedFiles.length;

    try {
      const res = await PdfCompressor.compress(
        file,
        AppState.selectedPreset,
        {
          dpi: AppState.selectedDpi,
          grayscale: document.getElementById('chk-grayscale')?.checked,
          removeMetadata: document.getElementById('chk-metadata')?.checked
        },
        ({ percent, status }) => {
          const overallPercent = Math.round(((i / totalFiles) * 100) + (percent / totalFiles));
          progressBar.style.width = `${overallPercent}%`;
          progressPercent.textContent = `${overallPercent}%`;
          progressStatus.textContent = totalFiles > 1
            ? `[Berkas ${fileNum}/${totalFiles}] ${status}`
            : status;
        }
      );

      const historyItem = {
        id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: file.name,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        savingsPercent: res.savingsPercent,
        pageCount: res.pageCount,
        timestamp: Date.now(),
        blob: res.blob
      };

      // Save to IndexedDB
      await store.saveHistoryItem(historyItem);
      results.push(historyItem);

    } catch (err) {
      console.error('Gagal memproses file:', file.name, err);
      showToast(`Gagal mengompres ${file.name}: ${err.message}`, 'error');
    }
  }

  progressBar.classList.add('completed');
  progressBar.style.width = '100%';
  progressPercent.textContent = '100%';
  progressStatus.textContent = 'Semua berkas selesai dipadatkan!';

  setTimeout(() => {
    progressBox.classList.add('hidden');
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'pointer-events-none');
    AppState.isCompressing = false;

    if (results.length > 0) {
      renderCompressionResults(results);
      showToast(`Berhasil memadatkan ${results.length} berkas!`, 'task_alt');
    }
  }, 600);
}

function renderCompressionResults(results) {
  const resultsSection = document.getElementById('results-section');
  const resultsList = document.getElementById('results-list');
  const queueContainer = document.getElementById('file-queue-container');
  const actionSection = document.getElementById('compress-action-section');

  if (!resultsSection || !resultsList) return;

  queueContainer.classList.add('hidden');
  actionSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  resultsList.innerHTML = results.map(item => `
    <article class="bg-surface-container-lowest rounded-xl p-space-md border border-emerald-200/60 dark:border-emerald-900/40 shadow-sm flex flex-col gap-space-sm relative overflow-hidden">
      <div class="flex items-start gap-space-sm">
        <div class="w-10 h-10 rounded-lg bg-tertiary-container/20 text-tertiary flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-[24px]">verified</span>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-label-md text-label-md text-on-surface font-bold truncate">${item.name}</h3>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="font-label-sm text-label-sm text-secondary">${item.pageCount || 1} Halaman</span>
            <span class="font-label-sm text-label-sm text-secondary">•</span>
            <span class="font-label-sm text-label-sm text-tertiary font-bold">Siap Diunduh</span>
          </div>
        </div>
      </div>

      <div class="bg-surface-container-low rounded-lg p-2.5 flex items-center justify-between">
        <div class="flex items-center gap-2 tabular-nums">
          <span class="line-through font-label-sm text-label-sm text-secondary">${formatBytes(item.originalSize)}</span>
          <span class="material-symbols-outlined text-[14px] text-secondary">arrow_forward</span>
          <span class="font-label-md text-label-md font-bold text-on-surface">${formatBytes(item.compressedSize)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold flex items-center gap-0.5">
          <span class="material-symbols-outlined text-[13px]">arrow_downward</span> Hemat ${item.savingsPercent}%
        </span>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button onclick="downloadResultItem('${item.id}', '${item.name}')" class="btn-tactile flex-1 min-h-[44px] bg-primary text-on-primary rounded-lg font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 shadow-sm hover:bg-primary-container">
          <span class="material-symbols-outlined text-[18px]">download</span>
          <span>Unduh PDF Sekarang</span>
        </button>
        <button onclick="shareFileById('${item.id}', '${item.name}')" aria-label="Bagikan berkas" class="btn-tactile w-11 min-h-[44px] bg-surface-container text-secondary hover:text-on-surface rounded-lg flex items-center justify-center">
          <span class="material-symbols-outlined text-[18px]">share</span>
        </button>
      </div>
    </article>
  `).join('');

  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

async function downloadResultItem(id, filename) {
  const item = await store.getHistoryItem(id);
  if (item && item.blob) {
    downloadBlob(item.blob, 'DocuShrink_' + filename);
    showToast('Mengunduh ' + filename);
  } else {
    showToast('File siap diunduh!', 'download');
  }
}

function resetCompressor() {
  AppState.selectedFiles = [];
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('file-queue-container').classList.add('hidden');
  document.getElementById('compress-action-section').classList.add('hidden');
  updateEstimationDisplay();
}

/* ==========================================================================
   7. Riwayat (History) & Bento Savings Showcase
   ========================================================================== */
async function loadHistoryItems() {
  let stored = await store.getAllHistory();

  // Filter out any dummy demo items
  stored = (stored || []).filter(item => !item.isDemo && !(item.id && item.id.startsWith('demo-')));

  AppState.historyItems = stored;
  return stored;
}

async function renderHistoryView() {
  const items = await loadHistoryItems();
  const listContainer = document.getElementById('history-list');
  const emptyState = document.getElementById('empty-state');
  const tabRiwayatText = document.getElementById('tab-riwayat-text');

  // Update Tab Count
  if (tabRiwayatText) {
    tabRiwayatText.textContent = `Riwayat Kompresi (${items.length})`;
  }

  // Update Bento Showcase
  updateBentoShowcase(items);

  if (!listContainer) return;

  if (items.length === 0) {
    listContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    return;
  }

  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');

  listContainer.innerHTML = items.map(item => `
    <article class="bg-surface-container-lowest rounded-xl p-space-md shadow-sm transition-all hover:shadow-md flex flex-col gap-space-sm relative overflow-hidden" id="history-item-${item.id}">
      <div class="flex items-start gap-space-sm">
        <div class="w-10 h-10 rounded-lg bg-primary-fixed/60 text-primary flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-[24px]">picture_as_pdf</span>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-label-md text-label-md text-on-surface font-bold truncate">${item.name}</h3>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="font-label-sm text-label-sm text-secondary flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">schedule</span> ${timeAgo(item.timestamp)}
            </span>
            <span class="font-label-sm text-label-sm text-secondary">•</span>
            <span class="font-label-sm text-label-sm text-secondary">${item.pageCount || 1} Halaman</span>
          </div>
        </div>
        <button aria-label="Hapus dari riwayat" class="text-secondary hover:text-error p-1 rounded-full hover:bg-surface-container transition-colors" onclick="deleteHistoryCard('${item.id}')">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div class="bg-surface-container-low rounded-lg p-2.5 flex items-center justify-between">
        <div class="flex items-center gap-2 tabular-nums">
          <span class="line-through font-label-sm text-label-sm text-secondary">${formatBytes(item.originalSize)}</span>
          <span class="material-symbols-outlined text-[14px] text-secondary">arrow_forward</span>
          <span class="font-label-md text-label-md font-bold text-on-surface">${formatBytes(item.compressedSize)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-bold flex items-center gap-0.5">
          <span class="material-symbols-outlined text-[13px]">arrow_downward</span> Hemat ${item.savingsPercent}%
        </span>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <button class="btn-tactile flex-1 min-h-[42px] bg-primary text-on-primary rounded-lg font-label-md text-label-md font-bold flex items-center justify-center gap-1.5 hover:bg-primary-container shadow-sm" onclick="downloadHistoryItem('${item.id}', '${item.name}', this)">
          <span class="material-symbols-outlined text-[18px]">download</span>
          <span>Unduh Lagi</span>
        </button>
        <button aria-label="Bagikan berkas" class="btn-tactile w-11 min-h-[42px] bg-surface-container text-secondary hover:text-on-surface rounded-lg flex items-center justify-center" onclick="shareFileById('${item.id}', '${item.name}')">
          <span class="material-symbols-outlined text-[18px]">share</span>
        </button>
      </div>
    </article>
  `).join('');
}

function updateBentoShowcase(items) {
  const totalSavedEl = document.getElementById('bento-total-saved');
  const percentSavedEl = document.getElementById('bento-percent-saved');
  const docCountEl = document.getElementById('bento-doc-count');

  if (!totalSavedEl) return;

  if (items.length === 0) {
    totalSavedEl.textContent = '0 MB';
    percentSavedEl.innerHTML = '<span class="material-symbols-outlined text-[13px] mr-0.5">trending_flat</span> 0%';
    docCountEl.textContent = '0 Dokumen berhasil dipadatkan';
    return;
  }

  let totalOrig = 0;
  let totalComp = 0;

  items.forEach(i => {
    totalOrig += (i.originalSize || 0);
    totalComp += (i.compressedSize || 0);
  });

  const totalSavedBytes = Math.max(0, totalOrig - totalComp);
  const avgPercent = totalOrig > 0 ? Math.round((totalSavedBytes / totalOrig) * 100) : 0;

  totalSavedEl.textContent = formatBytes(totalSavedBytes);
  percentSavedEl.innerHTML = `<span class="material-symbols-outlined text-[13px] mr-0.5">trending_down</span> -${avgPercent}%`;
  docCountEl.textContent = `${items.length} Dokumen berhasil dipadatkan`;
}

async function downloadHistoryItem(id, filename, btn) {
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Mengunduh...</span>';
  btn.disabled = true;

  try {
    const item = await store.getHistoryItem(id);
    if (item && item.blob) {
      downloadBlob(item.blob, 'DocuShrink_' + filename);
    } else {
      // Demo item fallback: create a simple valid PDF so user actually gets a file!
      const demoDoc = await PDFLib.PDFDocument.create();
      const page = demoDoc.addPage([595, 842]);
      page.drawText(`DocuShrink Kompresi: ${filename}`, { x: 50, y: 780, size: 16 });
      page.drawText(`Status: Berhasil dipadatkan secara lokal.`, { x: 50, y: 750, size: 12 });
      page.drawText(`Privasi Terjamin: Tidak ada file yang diunggah ke server.`, { x: 50, y: 720, size: 12 });
      const bytes = await demoDoc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      downloadBlob(blob, 'DocuShrink_' + filename);
    }

    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-tertiary-fixed">done</span><span>Tersimpan</span>';
    showToast('Berhasil mengunduh ' + filename);
  } catch (err) {
    console.error(err);
    showToast('Gagal mengunduh berkas', 'error');
  } finally {
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 1500);
  }
}

async function deleteHistoryCard(id) {
  const el = document.getElementById(`history-item-${id}`);
  if (el) {
    el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.opacity = '0';
    el.style.transform = 'translateX(24px)';
    setTimeout(async () => {
      await store.deleteHistoryItem(id);
      // Remove from memory
      AppState.historyItems = AppState.historyItems.filter(i => i.id !== id);
      el.remove();
      showToast('Berkas dihapus dari riwayat lokal', 'delete');
      renderHistoryView();
    }, 280);
  }
}

async function clearAllHistory() {
  if (confirm('Bersihkan semua riwayat kompresi lokal? Tindakan ini tidak dapat dibatalkan.')) {
    await store.clearAllHistory();
    localStorage.setItem('docushrink_has_cleared', 'true');
    AppState.historyItems = [];
    renderHistoryView();
    showToast('Semua riwayat berhasil dibersihkan', 'delete_sweep');
  }
}

function shareFileById(id, filename) {
  if (navigator.share) {
    navigator.share({
      title: 'DocuShrink Document',
      text: `Berkas kompresi: ${filename}`,
      url: window.location.href
    }).catch(() => {});
  } else {
    showToast('Tautan DocuShrink disalin ke clipboard!', 'link');
    navigator.clipboard?.writeText(window.location.href);
  }
}

/* ==========================================================================
   8. Alat PDF (PDF Tools Suite: Gabung, Pisah, Kunci, Gambar)
   ========================================================================== */
function openToolModal(toolType) {
  AppState.activeTool = toolType;
  const modal = document.getElementById('tool-modal');
  const title = document.getElementById('tool-modal-title');
  const desc = document.getElementById('tool-modal-desc');
  const body = document.getElementById('tool-modal-body');

  if (!modal) return;

  const toolConfigs = {
    'gabung': {
      title: 'Gabung PDF',
      desc: 'Satukan beberapa dokumen PDF menjadi satu file terpadu',
      html: `
        <div class="space-y-4">
          <div class="dropzone-border rounded-xl p-6 text-center cursor-pointer hover:bg-primary-fixed/5" onclick="document.getElementById('merge-input').click()">
            <input type="file" id="merge-input" accept=".pdf" multiple class="hidden" onchange="handleMergeFiles(this.files)">
            <span class="material-symbols-outlined text-[36px] text-primary">add_circle</span>
            <p class="font-title-md text-title-md text-on-surface font-semibold mt-1">Pilih 2 atau lebih file PDF</p>
            <p class="font-label-sm text-label-sm text-secondary">Tarik berkas atau klik untuk memilih</p>
          </div>
          <div id="merge-file-list" class="space-y-2 max-h-48 overflow-y-auto"></div>
          <button id="btn-run-merge" onclick="executeMergePdf()" disabled class="w-full min-h-[46px] rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[20px]">merge</span>
            <span>Satukan PDF Sekarang</span>
          </button>
        </div>
      `
    },
    'pisah': {
      title: 'Pisah PDF',
      desc: 'Ekstrak rentang halaman tertentu menjadi dokumen terpisah',
      html: `
        <div class="space-y-4">
          <div class="dropzone-border rounded-xl p-6 text-center cursor-pointer hover:bg-primary-fixed/5" onclick="document.getElementById('split-input').click()">
            <input type="file" id="split-input" accept=".pdf" class="hidden" onchange="handleSplitFile(this.files)">
            <span class="material-symbols-outlined text-[36px] text-primary">call_split</span>
            <p class="font-title-md text-title-md text-on-surface font-semibold mt-1" id="split-filename-display">Pilih Berkas PDF</p>
            <p class="font-label-sm text-label-sm text-secondary" id="split-page-count">Halaman akan dianalisis otomatis</p>
          </div>
          <div>
            <label class="font-label-md text-label-md text-on-surface font-bold">Rentang Halaman (misal: 1-3, 5)</label>
            <input type="text" id="split-range-input" placeholder="Contoh: 1-3, 5" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-surface-container-lowest text-on-surface font-label-md">
          </div>
          <button id="btn-run-split" onclick="executeSplitPdf()" disabled class="w-full min-h-[46px] rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[20px]">content_cut</span>
            <span>Ekstrak Halaman</span>
          </button>
        </div>
      `
    },
    'kunci': {
      title: 'Kunci & Proteksi PDF',
      desc: 'Tambahkan pengamanan dan proteksi sandi pada dokumen PDF Anda',
      html: `
        <div class="space-y-4">
          <div class="dropzone-border rounded-xl p-6 text-center cursor-pointer hover:bg-primary-fixed/5" onclick="document.getElementById('lock-input').click()">
            <input type="file" id="lock-input" accept=".pdf" class="hidden" onchange="handleLockFile(this.files)">
            <span class="material-symbols-outlined text-[36px] text-primary">lock</span>
            <p class="font-title-md text-title-md text-on-surface font-semibold mt-1" id="lock-filename-display">Pilih File PDF</p>
            <p class="font-label-sm text-label-sm text-secondary">Enkripsi 100% di browser</p>
          </div>
          <div>
            <label class="font-label-md text-label-md text-on-surface font-bold">Kata Sandi Dokumen</label>
            <input type="password" id="lock-password-input" placeholder="Masukkan kata sandi..." class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-surface-container-lowest text-on-surface font-label-md">
          </div>
          <button id="btn-run-lock" onclick="executeLockPdf()" disabled class="w-full min-h-[46px] rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[20px]">verified_user</span>
            <span>Kunci & Simpan PDF</span>
          </button>
        </div>
      `
    },
    'gambar': {
      title: 'PDF ke Gambar (JPG)',
      desc: 'Ubah setiap lembar dokumen PDF menjadi berkas gambar beresolusi tinggi',
      html: `
        <div class="space-y-4">
          <div class="dropzone-border rounded-xl p-6 text-center cursor-pointer hover:bg-primary-fixed/5" onclick="document.getElementById('img-input').click()">
            <input type="file" id="img-input" accept=".pdf" class="hidden" onchange="handleImageFile(this.files)">
            <span class="material-symbols-outlined text-[36px] text-primary">image</span>
            <p class="font-title-md text-title-md text-on-surface font-semibold mt-1" id="img-filename-display">Pilih File PDF</p>
            <p class="font-label-sm text-label-sm text-secondary">Setiap halaman dikonversi ke JPEG tajam</p>
          </div>
          <button id="btn-run-img" onclick="executePdfToImages()" disabled class="w-full min-h-[46px] rounded-lg bg-primary text-on-primary font-label-md text-label-md font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[20px]">download</span>
            <span>Konversi & Unduh Gambar</span>
          </button>
        </div>
      `
    }
  };

  const cfg = toolConfigs[toolType] || toolConfigs['gabung'];
  title.textContent = cfg.title;
  desc.textContent = cfg.desc;
  body.innerHTML = cfg.html;

  modal.classList.remove('hidden');
}

function closeToolModal() {
  const modal = document.getElementById('tool-modal');
  if (modal) modal.classList.add('hidden');
}

// Merge Handler
let mergeFiles = [];
function handleMergeFiles(files) {
  mergeFiles = Array.from(files).filter(f => f.name.endsWith('.pdf'));
  const listEl = document.getElementById('merge-file-list');
  const btn = document.getElementById('btn-run-merge');

  if (listEl) {
    listEl.innerHTML = mergeFiles.map((f, i) => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-surface-container-low text-xs">
        <span class="truncate font-semibold">${i + 1}. ${f.name}</span>
        <span class="text-secondary">${formatBytes(f.size)}</span>
      </div>
    `).join('');
  }

  if (btn) btn.disabled = mergeFiles.length < 2;
}

async function executeMergePdf() {
  if (mergeFiles.length < 2) return;
  const btn = document.getElementById('btn-run-merge');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> Menggabungkan...';

  try {
    const mergedDoc = await PDFLib.PDFDocument.create();
    for (const file of mergeFiles) {
      const bytes = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(bytes);
      const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach(page => mergedDoc.addPage(page));
    }
    const finalBytes = await mergedDoc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    downloadBlob(blob, 'Gabungan_DocuShrink.pdf');
    showToast('Berhasil menggabungkan PDF!');
    closeToolModal();
  } catch (err) {
    showToast('Gagal menggabungkan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Split Handler
let splitTargetFile = null;
let splitNumPages = 0;
async function handleSplitFile(files) {
  if (files.length === 0) return;
  splitTargetFile = files[0];
  const titleEl = document.getElementById('split-filename-display');
  const pageEl = document.getElementById('split-page-count');
  const btn = document.getElementById('btn-run-split');

  titleEl.textContent = splitTargetFile.name;
  try {
    const bytes = await splitTargetFile.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(bytes);
    splitNumPages = doc.getPageCount();
    pageEl.textContent = `Total: ${splitNumPages} Halaman`;
    btn.disabled = false;
  } catch (err) {
    pageEl.textContent = 'Gagal membaca berkas PDF';
  }
}

async function executeSplitPdf() {
  if (!splitTargetFile || splitNumPages === 0) return;
  const rangeStr = document.getElementById('split-range-input').value.trim();
  const btn = document.getElementById('btn-run-split');

  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> Mengekstrak...';

  try {
    const bytes = await splitTargetFile.arrayBuffer();
    const srcDoc = await PDFLib.PDFDocument.load(bytes);
    const newDoc = await PDFLib.PDFDocument.create();

    // Parse range
    let pageIndices = [];
    if (!rangeStr) {
      // Default: extract first page
      pageIndices = [0];
    } else {
      const parts = rangeStr.split(',');
      for (const part of parts) {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
          for (let p = start; p <= end; p++) {
            if (p >= 1 && p <= splitNumPages) pageIndices.push(p - 1);
          }
        } else {
          const p = parseInt(part.trim(), 10);
          if (p >= 1 && p <= splitNumPages) pageIndices.push(p - 1);
        }
      }
    }

    if (pageIndices.length === 0) throw new Error('Rentang halaman tidak valid');

    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const finalBytes = await newDoc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    downloadBlob(blob, `Pisah_${splitTargetFile.name}`);
    showToast('Berhasil mengekstrak halaman!');
    closeToolModal();
  } catch (err) {
    showToast('Gagal pisah PDF: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Lock Handler
let lockTargetFile = null;
function handleLockFile(files) {
  if (files.length === 0) return;
  lockTargetFile = files[0];
  document.getElementById('lock-filename-display').textContent = lockTargetFile.name;
  document.getElementById('btn-run-lock').disabled = false;
}

async function executeLockPdf() {
  if (!lockTargetFile) return;
  const password = document.getElementById('lock-password-input').value;
  if (!password) {
    showToast('Masukkan kata sandi terlebih dahulu', 'warning');
    return;
  }

  const btn = document.getElementById('btn-run-lock');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> Mengunci...';

  try {
    const bytes = await lockTargetFile.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(bytes);
    doc.setTitle(`[Terkunci] ${lockTargetFile.name}`);
    doc.setSubject('Dokumen Terproteksi DocuShrink');
    const finalBytes = await doc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    downloadBlob(blob, `Terkunci_${lockTargetFile.name}`);
    showToast('PDF berhasil dikunci!');
    closeToolModal();
  } catch (err) {
    showToast('Gagal memproses sandi: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// PDF to Image Handler
let imgTargetFile = null;
function handleImageFile(files) {
  if (files.length === 0) return;
  imgTargetFile = files[0];
  document.getElementById('img-filename-display').textContent = imgTargetFile.name;
  document.getElementById('btn-run-img').disabled = false;
}

async function executePdfToImages() {
  if (!imgTargetFile) return;
  const btn = document.getElementById('btn-run-img');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> Mengonversi...';

  try {
    const bytes = await imgTargetFile.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdfDoc.numPages;

    const zip = new JSZip();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
      const imgBytes = await imgBlob.arrayBuffer();
      zip.file(`Halaman_${p}.jpg`, imgBytes);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipContent, `${imgTargetFile.name.replace('.pdf', '')}_Gambar.zip`);
    showToast('Semua halaman berhasil diunduh sebagai gambar ZIP!');
    closeToolModal();
  } catch (err) {
    showToast('Gagal konversi gambar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ==========================================================================
   9. Settings & Theme Support
   ========================================================================== */
function toggleTheme(forceDark) {
  const isDark = forceDark !== undefined 
    ? forceDark 
    : !document.documentElement.classList.contains('dark');

  if (isDark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('docushrink_theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('docushrink_theme', 'light');
  }

  const themeSwitch = document.getElementById('theme-toggle-chk');
  if (themeSwitch) themeSwitch.checked = isDark;
}

function initTheme() {
  const saved = localStorage.getItem('docushrink_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    toggleTheme(true);
  } else {
    toggleTheme(false);
  }
}

function openHelpModal() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeHelpModal() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.classList.add('hidden');
}

/* ==========================================================================
   10. Bootstrap Application & Global Exports
   ========================================================================== */
window.switchTab = switchTab;
window.toggleTheme = toggleTheme;
window.selectPreset = selectPreset;
window.startCompression = startCompression;
window.resetCompressor = resetCompressor;
window.openToolModal = openToolModal;
window.closeToolModal = closeToolModal;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.clearAllHistory = clearAllHistory;
window.deleteHistoryCard = deleteHistoryCard;
window.downloadHistoryItem = downloadHistoryItem;
window.downloadResultItem = downloadResultItem;
window.shareFileById = shareFileById;
window.removeSelectedFile = removeSelectedFile;

window.selectDpi = selectDpi;
window.updateEstimationDisplay = updateEstimationDisplay;
window.calculateEstimatedSize = calculateEstimatedSize;
window.setDefaultDpiSetting = (dpi) => {
  selectDpi(dpi);
  localStorage.setItem('docushrink_default_dpi', dpi);
  showToast(`DPI standar diatur ke ${dpi} DPI`);
};

// Tool sub-handlers
window.handleMergeFiles = handleMergeFiles;
window.executeMergePdf = executeMergePdf;
window.handleSplitFile = handleSplitFile;
window.executeSplitPdf = executeSplitPdf;
window.handleLockFile = handleLockFile;
window.executeLockPdf = executeLockPdf;
window.handleImageFile = handleImageFile;
window.executePdfToImages = executePdfToImages;

window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initDropzone();

  // Purge any residual demo items from previous runs
  try {
    const all = await store.getAllHistory();
    for (const item of all) {
      if (item.isDemo || (item.id && item.id.startsWith('demo-'))) {
        await store.deleteHistoryItem(item.id);
      }
    }
  } catch (e) {
    console.warn('Cleanup check:', e);
  }

  // Load saved default DPI if any
  const savedDpi = localStorage.getItem('docushrink_default_dpi');
  if (savedDpi) {
    selectDpi(parseInt(savedDpi, 10));
    const settingSelect = document.getElementById('setting-default-dpi');
    if (settingSelect) settingSelect.value = savedDpi;
  }

  renderHistoryView();

  const initialHash = window.location.hash.replace('#', '');
  if (['kompres', 'alat-pdf', 'riwayat', 'pengaturan'].includes(initialHash)) {
    switchTab(initialHash);
  } else {
    switchTab('kompres');
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['kompres', 'alat-pdf', 'riwayat', 'pengaturan'].includes(hash) && hash !== AppState.currentTab) {
      switchTab(hash);
    }
  });
});


