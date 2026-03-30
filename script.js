// URL Web App GAS Anda (TIDAK PERLU DIGANTI LAGI)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxH5x1BXWMqkJVjTpYMM2tL60ysBGDIo2I4vHSAME6my9vbHVlQ9kRNnS_En8pwBZY/exec';
let dataTableRekapan, dataTableMaster, dataTableLogs;
let globalLogs = [], rawDataPegawai = [], systemLogsData = [];
let chartAll, chartPersonal;
let isRekapanLoaded = false, isLogsLoaded = false;

$(document).ready(function() {
    initUI();
    loadDataServer(); // Panggil data pertama kali
  });
// Toggle sidebar (buka/tutup) saat klik hamburger
$('#sidebarCollapse').on('click', function() {
    $('#sidebar').toggleClass('active');
    $('.sidebar-overlay').toggleClass('active');
});

// Tutup sidebar saat klik tombol X
$('#closeSidebar').on('click', function(e) {
    e.preventDefault();
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

// Tutup sidebar saat klik overlay
$('#sidebarOverlay').on('click', function() {
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

// Tutup sidebar otomatis saat klik menu (khusus mobile)
$('.sidebar-link').on('click', function() {
    if ($(window).width() <= 768) {
        $('#sidebar').removeClass('active');
        $('.sidebar-overlay').removeClass('active');
    }
});
// ==========================================
// INISIALISASI UI & SIDEBAR NAVIGATION
// ==========================================
function initUI() {
    document.getElementById('tanggal').valueAsDate = new Date();
    document.getElementById('tanggalMassal').valueAsDate = new Date();
    
    let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    $('#filterBulanRekapan, #selectBulanGlobal, #selectBulanGrafik').val(currentMonth);
    
    $('#selectGrafikPegawai').select2({ placeholder: "Ketik nama untuk mencari...", allowClear: true, width: '100%' });
    $('#selectGrafikPegawai').on('change', updateChartPegawai);
    $('#nama').select2({ placeholder: "Pilih Pegawai...", width: '100%' });

  
    $('.sidebar-link').on('click', function(e) {
      e.preventDefault();
      let target = $(this).data('target');
      $('.sidebar-link').removeClass('active');
      $(this).addClass('active');
      $('#pageTitle').text($(this).text().trim());
      $('.content-section').hide();
      $('#' + target).fadeIn(300);
    });
  }

// ==========================================
// CORE DATA FETCHING (API CALLS)
// ==========================================
function initData() {
  loadDataServer();
  setInterval(function() { loadDataServer(true); }, 60000);
}

async function fetchPost(action, payload) {
  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Menghindari block CORS
      body: JSON.stringify({ action: action, data: payload })
    });
    return await response.json();
  } catch (error) { throw new Error('Gagal terhubung ke server.'); }
}

function setDatabaseStatus(status) {
  const badge = document.getElementById('dbStatusBadge');
  if (status === 'connecting') {
    badge.className = 'badge bg-warning text-dark px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-circle-notch fa-spin me-2"></i> Sinkronisasi...';
  } else if (status === 'connected') {
    badge.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill status-badge';
    badge.innerHTML = '<i class="fas fa-wifi me-2"></i> Terhubung';
  } else if (status === 'error') {
    badge.className = 'badge bg-danger text-white px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i> Gagal Terhubung';
  }
}
function updateLastUpdated() {
  const now = new Date();
  document.getElementById('lastUpdate').innerText = `Diperbarui: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}
async function loadDataServer(isSilent = false) {
  isRekapanLoaded = false;
  isLogsLoaded = false;
  setDatabaseStatus('connecting');
  
  if (!isSilent) {
    document.getElementById('tabelBody').innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <div class="spinner-border text-primary opacity-50 mb-3" style="width: 2.5rem; height: 2.5rem;"></div>
          <h6 class="text-muted fw-normal">Menarik data terbaru dari server...</h6>
        </td>
      </tr>`;
  }
  
  try {
    // Tambahkan parameter time (t) untuk menghindari cache browser
    const response = await fetch(`${GAS_API_URL}?t=${new Date().getTime()}`);
    if (!response.ok) throw new Error('Jaringan bermasalah.');
    const result = await response.json();
    
    if (result.status === 'success') {
      // 1. Simpan data ke variabel global
      rawDataPegawai = result.data.rekapan;
      globalLogs = result.data.logs;
      systemLogsData = result.data.systemLogs || []; 
      globalHariEfektifBulanan = result.data.hariEfektifBulanan || {};
      
      // 2. Jalankan fungsi populasi komponen UI
      if (!isSilent) {
        populateDropdownPegawai(rawDataPegawai);
        // Tambahkan populasi lain jika ada (seperti Daftar Pegawai atau Group)
        if (typeof populateDaftarPegawai === 'function') populateDaftarPegawai(rawDataPegawai);
        if (typeof populateDropdownGroup === 'function') populateDropdownGroup(rawDataPegawai);
      }
      
      isRekapanLoaded = true;
      isLogsLoaded = true;
      
      // 3. Update Status dan Waktu Terakhir
      setDatabaseStatus('connected');
      const lastUpdateElem = document.getElementById('lastUpdate');
      if (lastUpdateElem) {
        lastUpdateElem.innerText = `Diperbarui: ${new Date().toLocaleTimeString('id-ID')}`;
      }

      // 4. TAMPILKAN LOG SISTEM (Penting agar log muncul)
      if (typeof populateLogAktivitas === 'function') {
        populateLogAktivitas(systemLogsData);
      }
      
      // 5. Render Grafik dan Filter Tabel
      try {
        applyFilterBulan(); // Ini akan memproses tabel berdasarkan filter yang aktif
        renderChartBulanKeseluruhan();
        updateChartPegawai();
        if (typeof checkAndRenderRekapan === 'function') checkAndRenderRekapan();
      } catch (graphError) {
        console.warn("Grafik/Filter gagal dimuat, tetapi data berhasil ditarik:", graphError);
      }

    } else { 
      throw new Error(result.message); 
    }
  } catch (error) {
    console.error("Error: ", error);
    setDatabaseStatus('error');
    if (!isSilent) {
      document.getElementById('tabelBody').innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-danger bg-danger bg-opacity-10 rounded">
            <i class="fas fa-exclamation-circle fs-2 mb-2"></i><br>
            Koneksi ke Database gagal: ${error.message}
          </td>
        </tr>`;
    }
  }
}
  
  // Perbaikan pada bagian Registrasi Plugin di renderChartBulanKeseluruhan
  function renderChartBulanKeseluruhan() {
    // ... kode persiapan data ...
    
    const ctx = document.getElementById('chartAllBulan').getContext('2d');
    if(chartAll) chartAll.destroy(); 
    
    // Periksa apakah library plugin tersedia sebelum digunakan
    const plugins = [];
    if (typeof ChartDataLabels !== 'undefined') {
      plugins.push(ChartDataLabels);
    }
  
    chartAll = new Chart(ctx, {
      type: 'bar',
      data: { /* ... data ... */ },
      plugins: plugins, // Gunakan array plugin yang sudah dicek
      options: {
          // ... opsi grafik ...
      }
    });
  }

function checkAndRenderRekapan() {
  if (isRekapanLoaded && isLogsLoaded) {
    applyFilterBulan();
    updateLastUpdated();
    setDatabaseStatus('connected'); 
  }
}

// ==========================================
// DATA PROCESSING & POPULATION
// ==========================================
function applyFilterBulan() {
  let selectBulan = document.getElementById('filterBulanRekapan');
  let bulanTerpilih = selectBulan.value;
  let teksBulanTerpilih = selectBulan.options[selectBulan.selectedIndex].text;
  
  // UPDATE LABEL BULAN DINAMIS DI CARD
  let labelBulanStat = document.getElementById('labelBulanStat');
  if(labelBulanStat) {
    labelBulanStat.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${bulanTerpilih === "ALL" ? "Sepanjang Tahun" : teksBulanTerpilih}`;
  }

  let currentYear = new Date().getFullYear();
  let filteredData = [];
  
  let totalKeseluruhanHadir = 0;
  let totalKeseluruhanAbsen = 0;

  if (bulanTerpilih === "ALL") {
    filteredData = rawDataPegawai;
    rawDataPegawai.forEach(p => {
      totalKeseluruhanHadir += parseInt(p.jumlahKehadiran) || 0;
      totalKeseluruhanAbsen += parseInt(p.jmlTidakHadir) || 0;
    });
  } else {
    let formatBulan = `${currentYear}-${bulanTerpilih}`; 
    
    rawDataPegawai.forEach(pegawai => {
      let logsBulanIni = globalLogs.filter(log => log.nama === pegawai.nama && log.bulan === formatBulan);
      
      let jmlHadir = 0, jmlCuti = 0, jmlDL = 0, jmlTK = 0;
      let notesBulanIni = []; 
      
      logsBulanIni.forEach(log => {
        let st = log.status.toUpperCase();
        if (st === "HADIR") jmlHadir++;
        else if (st === "DINAS LUAR" || st === "DL") jmlDL++;
        else if (st === "TANPA KETERANGAN" || st === "TK") jmlTK++;
        else if (st.includes("CUTI")) jmlCuti++; 
        
        if (log.keterangan && log.keterangan.trim() !== "") {
          let hariTgl = log.tanggal.split('-')[2]; 
          notesBulanIni.push(`Tgl ${hariTgl}: <span class="text-dark">${log.keterangan}</span>`);
        }
      });
      
      let jmlTidakHadir = jmlCuti + jmlDL + jmlTK;
      
      let hariEfektif = 0;
      if (bulanTerpilih === "ALL") {
        hariEfektif = pegawai.hariEfektif || pegawai["HARI EFEKTIF"] || pegawai.HariEfektif || 0; 
      } else {
        if (globalHariEfektifBulanan[formatBulan] && globalHariEfektifBulanan[formatBulan][pegawai.nama]) {
          hariEfektif = globalHariEfektifBulanan[formatBulan][pegawai.nama];
        } else {
          hariEfektif = 0;
        }
      }
      
      let finalKeterangan = notesBulanIni.length > 0 ? notesBulanIni.join('<br>') : '<span class="text-muted fst-italic">-</span>';

      totalKeseluruhanHadir += jmlHadir;
      totalKeseluruhanAbsen += jmlTidakHadir;

      filteredData.push({
        no: pegawai.no, nama: pegawai.nama, golongan: pegawai.golongan,
        hariEfektif: hariEfektif, cuti: jmlCuti, dl: jmlDL, tk: jmlTK,
        jmlTidakHadir: jmlTidakHadir, jumlahKehadiran: jmlHadir, keterangan: finalKeterangan
      });
    });
  }

  // Animasi angka tanpa menimpa elemen span/text HTML di dalamnya
  animateValue("statTotalPegawai", 0, filteredData.length, 500);
  document.getElementById("statTotalHadir").innerHTML = `${totalKeseluruhanHadir} <span class="fs-6 text-muted fw-normal">Hari</span>`;
  document.getElementById("statTotalAbsen").innerHTML = `${totalKeseluruhanAbsen} <span class="fs-6 text-muted fw-normal">Hari</span>`;

  populateTabelRekapan(filteredData);
}
function animateValue(id, start, end, duration, suffix = '') {
  const obj = document.getElementById(id); if(!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start) + suffix;
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function populateTabelRekapan(data) {
  let currentPage = 0; let currentSearch = '';
  if (dataTableRekapan) {
    currentPage = dataTableRekapan.page(); currentSearch = dataTableRekapan.search(); dataTableRekapan.destroy();
  }
  
  let tbody = '';
  data.forEach(row => {
    tbody += `<tr>
      <td class="text-muted fw-medium">${row.no}</td>
      <td class="text-start fw-bold text-dark">${row.nama}</td>
      <td><span class="badge bg-light text-secondary border border-secondary border-opacity-25 px-2 py-1">${row.golongan}</span></td>
      <td class="fw-bold text-primary">${row.hariEfektif}</td>
      <td class="text-muted">${row.cuti}</td>
      <td class="text-muted">${row.dl}</td>
      <td class="text-muted">${row.tk}</td>
      <td class="fw-bold text-danger bg-danger bg-opacity-10">${row.jmlTidakHadir}</td>
      <td class="fw-bold text-success bg-success bg-opacity-10">${row.jumlahKehadiran}</td>
      <td class="text-start small lh-sm">${row.keterangan}</td>
    </tr>`;
  });
  document.getElementById('tabelBody').innerHTML = tbody;
  
  dataTableRekapan = $('#tabelRekapan').DataTable({ 
     pageLength: 10, 
     language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
     dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>',
  });
  
  if (currentSearch) dataTableRekapan.search(currentSearch);
  dataTableRekapan.page(currentPage).draw('page');
}

function populateDaftarPegawai(data) {
  let currentPage = 0; let currentSearch = '';
  if (dataTableMaster) { currentPage = dataTableMaster.page(); currentSearch = dataTableMaster.search(); dataTableMaster.destroy(); }
  let tbody = '';
  data.forEach(row => {
    tbody += `<tr>
      <td>${row.no}</td><td class="text-start fw-bold">${row.nama}</td><td>${row.golongan}</td>
      <td>${row.group !== "-" && row.group !== "" ? `<span class="badge bg-secondary">${row.group}</span>` : "-"}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-primary m-1 shadow-sm" onclick="bukaModalEdit('${row.nama}', '${row.golongan}', '${row.group}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger m-1 shadow-sm" onclick="hapusData('${row.nama}')"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>`;
  });
  $('#masterPegawaiBody').html(tbody);
  
  // MENGGUNAKAN HTTPS UNTUK CDN
  dataTableMaster = $('#tabelMasterPegawai').DataTable({ 
    pageLength: 5, 
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' }
  });
  
  if (currentSearch) dataTableMaster.search(currentSearch); dataTableMaster.page(currentPage).draw('page');
}

function populateDropdownPegawai(data) {
    let options = '<option value="">Pilih/Ketik Pegawai...</option>';
    
    // Menggunakan data asal tanpa .sort() agar mengikut urutan pangkalan data
    data.forEach(row => { 
      options += `<option value="${row.nama}">${row.nama}</option>`; 
    });
    
    $('#selectGrafikPegawai').html(options).trigger('change');
    $('#nama').html(options).trigger('change');
  }

function populateDropdownGroup(data) {
  // 1. Ambil data unik Group dan Golongan
  let uniqueGroups = [...new Set(data.map(item => item.group))].filter(g => g !== "-" && g !== "" && g !== undefined);
  let uniqueGolongan = [...new Set(data.map(item => item.golongan))].filter(g => g !== "-" && g !== "" && g !== undefined);

  // 2. Siapkan template options
  let optionsMassal = '<option value="ALL" class="fw-bold text-primary">Semua Group (Seluruh Pegawai)</option>';
  let listGroupHTML = ''; 
  let optionsSearch = '<option value="">-- Silakan Pilih Group --</option>';
  
  // 3. Loop untuk mengisi konten dropdown
  uniqueGroups.forEach(g => { 
    optionsMassal += `<option value="${g}">${g}</option>`; 
    listGroupHTML += `<option value="${g}">${g}</option>`; 
    optionsSearch += `<option value="${g}">${g}</option>`; 
  });

  // --- RENDER KE ELEMENT HTML ---
  
  // Menu Dropdown (Status Massal & Hari Efektif)
$('#groupMassal, #groupEfektif').html(optionsMassal);
  // Menu List (Datalist untuk input manual)
  $('#listGroup').html(listGroupHTML);
  
  // Menu Filter & Pindah Group
  $('#searchGroup').html(optionsSearch);
  $('#pindahTargetGroup').html(optionsSearch.replace('-- Silakan Pilih Group --', 'Pilih target group tujuan...'));
  
  // List Golongan
  let listGolonganHTML = ''; 
  uniqueGolongan.forEach(g => { 
    listGolonganHTML += `<option value="${g}">${g}</option>`; 
  });
  $('#listGolongan').html(listGolonganHTML);
}

// ==========================================
// CHARTS
// ==========================================
const colorMap = { "Hadir": "#10b981", "Cuti Tahunan": "#0ea5e9", "Cuti Melahirkan": "#d63384", "Cuti Sakit": "#f59e0b", "Cuti Besar": "#8b5cf6", "Cuti Diluar Tanggungan Negara": "#64748b", "Cuti Alasan Penting": "#eab308", "Dinas Luar": "#3b82f6", "Tanpa Keterangan": "#ef4444" };
const statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Diluar Tanggungan Negara", "Cuti Alasan Penting", "Dinas Luar", "Tanpa Keterangan"];

function renderChartBulanKeseluruhan() {
  let bulanTerpilih = $('#selectBulanGlobal').val(); let currentYear = new Date().getFullYear(); let formatBulan = `${currentYear}-${bulanTerpilih}`; let mapData = {};
  globalLogs.forEach(log => {
    let isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    if(isMatch && log.status !== "LIBUR") {
      if(!mapData[log.bulan]) { mapData[log.bulan] = {"Hadir": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0}; }
      let st = log.status.toUpperCase();
      if(st === "HADIR") mapData[log.bulan]["Hadir"]++; else if(st === "DL") mapData[log.bulan]["Dinas Luar"]++; else if(st === "TK") mapData[log.bulan]["Tanpa Keterangan"]++;
      else mapData[log.bulan][Object.keys(colorMap).find(k => k.toUpperCase() === st)]++;
    }
  });

  let labels = Object.keys(mapData).sort(); let datasets = [];
  statusKeys.forEach(key => {
    let dataArray = labels.map(b => mapData[b][key]);
    if (dataArray.some(val => val > 0)) datasets.push({ label: key, data: dataArray, backgroundColor: colorMap[key], borderRadius: 4, barPercentage: 0.8 });
  });

  const ctx = document.getElementById('chartAllBulan').getContext('2d');
  if(chartAll) chartAll.destroy(); if (typeof ChartDataLabels === 'undefined') { Chart.register(ChartDataLabels); }

  chartAll = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels.length ? labels.map(l => l.substring(5)) : ['No Data'], datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0] }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 15, font: { family: "'Plus Jakarta Sans'" } } }, datalabels: { color: '#fff', font: { weight: 'bold', size: 10 }, formatter: (value) => value > 0 ? value : '' } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { precision: 0 } } }
    }
  });
}

function updateChartPegawai() {
  let namaPegawai = document.getElementById('selectGrafikPegawai').value;
  if(!namaPegawai) return;

  // 1. Ambil target Hari Efektif pegawai dari database (bukan hasil hitung log)
  let pegawai = rawDataPegawai.find(p => p.nama === namaPegawai);
  let targetHariEfektif = 0;
  if (pegawai) {
    targetHariEfektif = parseInt(pegawai.hariEfektif || pegawai["HARI EFEKTIF"] || pegawai.HariEfektif) || 0;
  }

  let bulanTerpilih = document.getElementById('selectBulanGrafik').value;
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`;
  let stats = { "Hadir": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, "Cuti Bersama": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0 };
  // 2. Hitung jumlah log kehadiran yang sudah masuk
  globalLogs.forEach(log => {
    if(log.nama === namaPegawai && (bulanTerpilih === "ALL" || log.bulan === formatBulan)) {
      let st = log.status.toUpperCase();
      if(st === "HADIR") stats["Hadir"]++;
      else if(st === "CUTI TAHUNAN") stats["Cuti Tahunan"]++;
      else if(st === "CUTI MELAHIRKAN") stats["Cuti Melahirkan"]++;
      else if(st === "CUTI SAKIT") stats["Cuti Sakit"]++;
      else if(st === "CUTI BESAR") stats["Cuti Besar"]++;
      else if(st === "CUTI DILUAR TANGGUNGAN NEGARA") stats["Cuti Diluar Tanggungan Negara"]++;
      else if(st === "CUTI ALASAN PENTING") stats["Cuti Alasan Penting"]++;
      else if(st === "DINAS LUAR" || st === "DL") stats["Dinas Luar"]++;
      else if(st === "TANPA KETERANGAN" || st === "TK") stats["Tanpa Keterangan"]++;
      else if(st === "CUTI BERSAMA") stats["Cuti Bersama"]++;
    }
  });

  let labels = [], dataCounts = [], bgColors = [], totalTercatat = 0;
  for (let key in stats) {
    if (stats[key] > 0) { 
      labels.push(key); 
      dataCounts.push(stats[key]); 
      bgColors.push(colorMap[key]); 
      totalTercatat += stats[key]; 
    }
  }

  // 3. LOGIKA PERSENTASE BERDASARKAN HARI EFEKTIF
  // Pembagi 100% didasarkan pada Hari Efektif dari Sheet. 
  let pembagi = targetHariEfektif > 0 ? targetHariEfektif : totalTercatat;

  // Tambahkan irisan "Sisa Hari" ke dalam Pie Chart jika log terekam masih kurang dari Hari Efektif
  // Ini memastikan secara visual potongan persentase "Hadir" akurat di dalam lingkaran
  if (targetHariEfektif > totalTercatat) {
    labels.push("Libur/Cuti/DL/TK");
    dataCounts.push(targetHariEfektif - totalTercatat);
    bgColors.push("#e2e8f0"); // Warna abu-abu netral
  }

const ctx = document.getElementById('chartPerPegawai').getContext('2d');
if (chartPersonal) chartPersonal.destroy();
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

  chartPersonal = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels.length ? labels : ['Belum Ada Data'],
      datasets: [{ 
        data: dataCounts.length ? dataCounts : [1], 
        backgroundColor: bgColors.length ? bgColors : ['#f8f9fa'], 
        borderWidth: 1, 
        hoverOffset: 4 
      }]
    },
    
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: {
        
        legend: { 
          position: 'right', 
          labels: { 
            usePointStyle: true, 
            padding: 15, 
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } 
          } 
        },
        datalabels: { 
          color: (context) => {
             let label = context.chart.data.labels[context.dataIndex];
             // Buat teks gelap agar terbaca pada irisan abu-abu (Sisa Hari)
             return label === 'Belum Ada Data' || label === 'Sisa Hari (Belum Absen)' ? '#475569' : '#ffffff';
          },
          font: { weight: 'bold', size: 12 },
          formatter: (value, context) => {
            let label = context.chart.data.labels[context.dataIndex];
            if (label === 'Belum Ada Data' || pembagi === 0) return '';
            
            // Kalkulasi matematis: (Nilai Kehadiran / Target Hari Efektif) * 100
            let percentage = ((value / pembagi) * 100).toFixed(1);
            return percentage > 0 ? percentage + '%' : ''; 
          }
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.9)', 
          titleColor: '#2c3e50', 
          bodyColor: '#2c3e50', 
          borderColor: '#e9ecef', 
          borderWidth: 1, 
          callbacks: { 
            label: (c) => {
              if (pembagi === 0) return ' Belum Ada Data';
              let percentage = ((c.raw / pembagi) * 100).toFixed(1);
              return ` ${c.label}: ${c.raw} Hari (${percentage}%)`;
            }
          } 
        }
      }
    }
  });
  if (typeof renderChartBulanKeseluruhan === 'function') {
      renderChartBulanKeseluruhan();
  }
}
// ==========================================
// CRUD ACTIONS (POST)
// ==========================================
function showToast(message, type) {
  let bgColor = type === 'success' ? 'bg-success' : (type === 'error' ? 'bg-danger' : 'bg-primary');
  let toastHTML = `
    <div class="toast align-items-center text-white ${bgColor} border-0 show shadow mb-2" role="alert">
      <div class="d-flex">
        <div class="toast-body fw-bold">
          ${type === 'success' ? '<i class="fas fa-check-circle me-2"></i>' : (type==='error'?'<i class="fas fa-exclamation-triangle me-2"></i>':'<i class="fas fa-info-circle me-2"></i>')}
          ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.parentElement.parentElement.remove()"></button>
      </div>
    </div>`;
  let container = document.getElementById('toastContainer');
  let tempDiv = document.createElement('div'); tempDiv.innerHTML = toastHTML;
  container.appendChild(tempDiv.firstElementChild);
  setTimeout(() => { if(container.lastChild) { container.lastChild.style.opacity='0'; setTimeout(()=>container.lastChild.remove(),300); } }, 4000);
}

// 1. HANDLE ABSENSI INDIVIDUAL (TAB PENGECUALIAN)
async function handleAbsensiSubmit(e) {
  e.preventDefault();
  
  // Ambil referensi tombol
  let btn = $('#btnSubmitAbsen'); 
  // Simpan konten asli agar bisa dikembalikan dengan tepat (termasuk ikon)
  let originalContent = '<i class="fas fa-save me-2"></i>Simpan Perubahan';
  
  // AKTIFKAN LOADING
  btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);
  
  let obj = { 
    tanggal: $('#tanggal').val(), 
    nama: $('#nama').val(), 
    status: $('#status').val(), 
    keterangan: $('#keterangan').val() 
  };
  
  try {
    let res = await fetchPost('submitAbsensi', obj);
    showToast(res.message, res.status); 
    
    // Logika reset form tetap dipertahankan
    if(res.status === 'success') {
      $('#formAbsensi')[0].reset(); 
      $('#nama').val(null).trigger('change');
      loadDataServer(true);
    }
  } catch(err) { 
    showToast(err.message, "error"); 
  } finally {
    // KEMBALIKAN TOMBOL (Tanpa mengurangi kode sebelumnya)
    btn.html(originalContent).prop('disabled', false);
  }
}

// 2. HANDLE HARI EFEKTIF
async function handleHariEfektif(e) {
  e.preventDefault();
  
  const grp = $('#groupEfektif').val();
  const namaBulan = $('#bulanEfektif option:selected').text();
  const jmlHari = $('#jumlahHari').val();
  
  let confirmMsg = `Update hari efektif di TAB [${namaBulan}] untuk Group: ${grp}?`;

  if (confirm(confirmMsg)) {
    const btn = $('#btnSubmitEfektif');
    let originalContent = '<i class="fas fa-save me-2"></i>Simpan Konfigurasi';
    
    // AKTIFKAN LOADING
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);

    const obj = {
      targetSheet: namaBulan,
      group: grp,
      hariEfektif: parseInt(jmlHari)
    };

    try {
      let res = await fetchPost('setHariEfektif', obj);
      showToast(res.message, res.status);
      if (res.status === 'success') {
        $('#formHariEfektif')[0].reset();
        loadDataServer(true); 
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      // KEMBALIKAN TOMBOL
      btn.html(originalContent).prop('disabled', false);
    }
  }
}

// 3. HANDLE STATUS MASSAL
async function handleStatusMassal(e) {
  e.preventDefault(); 
  let grp = $('#groupMassal').val();
  let confirmMsg = grp === "ALL" ? "Status SELURUH PEGAWAI akan diubah jadi HADIR. Lanjutkan?" : `Status seluruh pegawai di GROUP ${grp} akan diubah jadi HADIR. Lanjutkan?`;
  
  if(confirm(confirmMsg)) {
    let btn = $('#btnStatusMassal'); 
    let originalContent = '<i class="fas fa-bolt me-2"></i>Eksekusi Perubahan';
    
    // AKTIFKAN LOADING
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
    
    let obj = { 
      tanggal: $('#tanggalMassal').val(), 
      group: grp, 
      status: $('#statusMassal').val(), 
      keterangan: "" 
    };

    try {
      let res = await fetchPost('setStatusMassal', obj);
      showToast(res.message, res.status); 
      if(res.status === 'success') {
        $('#formStatusMassal')[0].reset();
        loadDataServer(true);
      }
    } catch(err) { 
      showToast(err.message, "error"); 
    } finally {
      // KEMBALIKAN TOMBOL
      btn.html(originalContent).prop('disabled', false);
    }
  }
}

async function handlePegawaiSubmit(e) {
  e.preventDefault(); let btn = $('#btnSubmitPegawai'); btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
  let obj = { namaBaru: $('#namaBaru').val(), golongan: $('#golongan').val(), group: $('#groupBaru').val() };
  try {
    let res = await fetchPost('simpanPegawaiBaru', obj);
    showToast(res.message, res.status); $('#formPegawai')[0].reset();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-plus me-2"></i>Tambahkan').prop('disabled', false);
}

function bukaModalEdit(nama, golongan, group) {
  $('#editOldNama').val(nama); $('#editNewNama').val(nama); $('#editNewGolongan').val(golongan); $('#editNewGroup').val(group === "-" ? "" : group);
  new bootstrap.Modal(document.getElementById('modalEdit')).show();
}

async function handleEditSubmit(e) {
  e.preventDefault(); let btn = $('#btnSimpanEdit'); btn.html('Menyimpan...').prop('disabled', true);
  let obj = { oldNama: $('#editOldNama').val(), newNama: $('#editNewNama').val(), newGolongan: $('#editNewGolongan').val(), newGroup: $('#editNewGroup').val() };
  try {
    let res = await fetchPost('editPegawai', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalEdit')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('Simpan Perubahan').prop('disabled', false);
}

async function hapusData(nama) {
  if (confirm(`Peringatan! Hapus permanen data pegawai: ${nama}?`)) {
    showToast(`Menghapus data ${nama}...`, 'info');
    try {
      let res = await fetchPost('hapusPegawai', nama);
      showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
    } catch(err) { showToast(err.message, "error"); }
  }
}

async function handleResetAbsensi() {
  if (confirm("🚨 PERINGATAN BAHAYA!\n\nAnda yakin ingin MENGHAPUS SEMUA ISI ABSENSI di semua bulan untuk memulai dari awal?")) {
    if (prompt("Ketik 'RESET' untuk melanjutkan:") === "RESET") {
      showToast("Mereset data...", "info");
      try {
        let res = await fetchPost('resetSemuaAbsensi', {});
        showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
      } catch(err) { showToast(err.message, "error"); }
    } else showToast("Proses dibatalkan.", "error");
  }
}

// --- MANAJEMEN GROUP ---
function tampilkanAnggotaGroup() {
  let selectedGroup = $('#searchGroup').val(); let tbody = $('#bodyAnggotaGroup');
  if(!selectedGroup) { tbody.html('<tr><td colspan="4" class="text-muted py-5"><i class="fas fa-info-circle me-2"></i>Pilih group pada dropdown.</td></tr>'); return; }
  let anggota = rawDataPegawai.filter(p => p.group === selectedGroup);
  if(anggota.length === 0) { tbody.html(`<tr><td colspan="4" class="text-danger fw-bold py-5"><i class="fas fa-exclamation-triangle me-2"></i>Tidak ada pegawai di group ini.</td></tr>`); return; }
  
  let html = '';
  anggota.forEach((p, idx) => {
    html += `<tr><td>${idx + 1}</td><td class="text-start fw-bold">${p.nama}</td><td>${p.golongan}</td>
      <td>
        <button class="btn btn-sm btn-info text-white mx-1 shadow-sm" onclick="bukaModalPindahGroup('${p.nama}', '${p.group}')"><i class="fas fa-exchange-alt"></i> Pindah</button>
        <button class="btn btn-sm btn-outline-danger mx-1 shadow-sm" onclick="hapusDariGroup('${p.nama}')"><i class="fas fa-user-minus"></i> Keluarkan</button>
      </td></tr>`;
  });
  tbody.html(html);
}

async function hapusDariGroup(nama) {
  if(confirm(`Keluarkan ${nama} dari group ini?`)) {
    showToast(`Mengeluarkan ${nama}...`, "info");
    try {
      let res = await fetchPost('ubahGroupPegawai', {nama: nama, newGroup: "-"});
      showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
    } catch(err) { showToast(err.message, "error"); }
  }
}

function bukaModalPindahGroup(nama) {
  $('#pindahNamaPegawai').val(nama); $('#labelPindahNama').text(nama);
  new bootstrap.Modal(document.getElementById('modalPindahGroup')).show();
}

async function simpanPindahGroup(e) {
  e.preventDefault(); let btn = $('#btnSimpanPindah'); btn.html("Memproses...").prop('disabled', true);
  let obj = { nama: $('#pindahNamaPegawai').val(), newGroup: $('#pindahTargetGroup').val() };
  try {
    let res = await fetchPost('ubahGroupPegawai', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalPindahGroup')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html("Konfirmasi Pindah").prop('disabled', false);
}

function bukaModalBuatGroup() {
  let html = '';
  [...rawDataPegawai].sort((a,b) => a.nama.localeCompare(b.nama)).forEach(p => {
    let badge = p.group !== "-" && p.group !== "" ? `<span class="badge bg-secondary bg-opacity-25 text-secondary ms-2" style="font-size:0.65em;">${p.group}</span>` : '';
    html += `<div class="col-md-6 mb-2"><div class="form-check border-bottom pb-2"><input class="form-check-input chk-pegawai shadow-sm" type="checkbox" value="${p.nama}" id="chk_${p.no}"><label class="form-check-label w-100" style="cursor:pointer;" for="chk_${p.no}">${p.nama} ${badge}</label></div></div>`;
  });
  $('#listCheckboxPegawai').html(html); $('#namaGroupBaru').val("");
  new bootstrap.Modal(document.getElementById('modalBuatGroup')).show();
}

async function simpanGroupBaru(e) {
  e.preventDefault(); let checkedBoxes = document.querySelectorAll('.chk-pegawai:checked');
  if(checkedBoxes.length < 2) { alert("Harap centang minimal 2 pegawai!"); return; }
  let btn = $('#btnSimpanGroupBaru'); btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);
  let obj = { namaGroup: $('#namaGroupBaru').val(), pegawaiList: Array.from(checkedBoxes).map(cb => cb.value) };
  try {
    let res = await fetchPost('buatGroupBaru', obj);
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalBuatGroup')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-save me-2"></i>Simpan Group').prop('disabled', false);
}

// ==========================================
// RENDER TABEL LOG AKTIVITAS
// ==========================================
function populateLogAktivitas(sysLogs) {
    if (dataTableLogs) { dataTableLogs.destroy(); }
    
    let tbody = '';
    // MENGURUTKAN OTOMATIS: dari perubahan data yang paling terbaru
    const sortedLogs = [...sysLogs].sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
    
    sortedLogs.forEach(log => {
      let badgeClass = 'bg-light text-dark border';
      let act = log.aktivitas.toUpperCase();
      
      // Penyesuaian warna badge berdasarkan jenis aktivitas (Edit, Hapus, Absen, dll)
      if(act.includes('ABSEN')) badgeClass = 'bg-success bg-opacity-10 text-success border-success border-opacity-25';
      else if(act.includes('HAPUS') || act.includes('RESET')) badgeClass = 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-25';
      else if(act.includes('PEGAWAI') || act.includes('GROUP')) badgeClass = 'bg-primary bg-opacity-10 text-primary border-primary border-opacity-25';
      else if(act.includes('EDIT')) badgeClass = 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-25';
  
      // Format tampilan waktu
      let dateObj = new Date(log.waktu);
      let timeStr = dateObj.toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
  
      tbody += `<tr>
        <td class="fw-medium text-muted text-start" style="white-space: nowrap;"><i class="fas fa-clock me-2 opacity-50"></i>${timeStr}</td>
        <td class="fw-bold"><span class="badge ${badgeClass} px-3 py-2 w-100 rounded-pill">${log.aktivitas}</span></td>
        <td class="small text-start lh-sm">${log.keterangan || '<span class="text-muted fst-italic">-</span>'}</td>
      </tr>`;
    });
    
    $('#logAktivitasBody').html(tbody);
    
    dataTableLogs = $('#tabelLogAktivitas').DataTable({
      pageLength: 10,
      order: [[0, 'desc']], // Tetap pertahankan filter DataTable memprioritaskan terbaru
      language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
      dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>'
    });
  }

// ==========================================
// HAPUS SEMUA LOG AKTIVITAS
// ==========================================
async function handleHapusSemuaLog() {
    if (confirm("🚨 PERINGATAN!\n\nAnda yakin ingin MENGHAPUS SEMUA RIWAYAT LOG AKTIVITAS?\nData yang sudah dihapus tidak dapat dikembalikan.")) {
      
      // Konfirmasi keamanan ganda
      if (prompt("Ketik 'HAPUS' (huruf besar) untuk melanjutkan konfirmasi:") === "HAPUS") {
        showToast("Menghapus seluruh log aktivitas...", "info");
        
        try {
          let btn = $('button[onclick="handleHapusSemuaLog()"]');
          btn.html('<i class="fas fa-spinner fa-spin me-1"></i> Menghapus...').prop('disabled', true);
          
          let res = await fetchPost('hapusSemuaLog', {});
          showToast(res.message, res.status); 
          
          if(res.status === 'success') {
             loadDataServer(true); // Memuat ulang tabel di latar belakang
          }
          
          btn.html('<i class="fas fa-trash-alt me-1"></i> Kosongkan Log').prop('disabled', false);
        } catch(err) { 
          showToast(err.message, "error"); 
        }
      } else {
        showToast("Proses penghapusan log dibatalkan.", "error");
      }
    }
  }
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.addEventListener('click', function(e) {
    window.open(this.href, '_blank');
  });
});
/**
 * Memuat ulang iframe database dan memberikan feedback visual
 */
function refreshDatabase(e) {
  const btn = $('#btnRefreshDb');
  const frame = $('#frame-database');
  const originalHtml = '<i class="fas fa-sync-alt"></i>';
  
  // Aktifkan Spinner pada tombol
  btn.html('<i class="fas fa-sync-alt fa-spin"></i>').prop('disabled', true);
  
  // Reload Iframe
  const currentSrc = frame.attr('src');
  frame.attr('src', ''); // Kosongkan dulu sebentar
  
  // Gunakan timeout kecil agar transisi reload terasa
  setTimeout(() => {
    frame.attr('src', currentSrc);
    
    // Kembalikan tombol setelah proses selesai
    setTimeout(() => {
      btn.html(originalHtml).prop('disabled', false);
      if (typeof showToast === "function") {
        showToast("Database Absensi telah dimuat ulang", "info");
      }
    }, 1000);
  }, 100);
}
