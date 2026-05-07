// URL Web App GAS Anda (TIDAK PERLU DIGANTI LAGI)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzeSET0kRJfiop-JXFkmTKvk0FodL2kooru0kDJAYaWkuTr3zd76A4YEv_Q6mGkbwkX/exec';
let dataTableRekapan, dataTableMaster, dataTableLogs;
let globalLogs = [], rawDataPegawai = [], systemLogsData = [];
let chartAll, chartPersonal;
let isRekapanLoaded = false, isLogsLoaded = false;
let globalHariEfektifBulanan = {};

// ==========================================
// KEAMANAN & AUTENTIKASI PIN ADMIN
// ==========================================
async function hashPIN(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CORRECT_PIN_HASH = "cd4b0bba7f67328dcff29180fb217d06f0d3a43a95ed32d175797b60e3216f83";

async function checkAccessPin() {
  if (sessionStorage.getItem('admin_authenticated') === 'true') {
      initUI();
      loadDataServer(); 
      return;
  }

  const { value: pin } = await Swal.fire({
      title: '<h3 style="color: #0f172a; margin: 0;"><i class="fas fa-shield-alt text-primary"></i> Keamanan Admin</h3>',
      html: '<p style="font-size:0.9rem; color:#64748b; margin-top:5px;">Masukkan 6 digit PIN akses Administrator.</p>',
      input: 'password',
      inputPlaceholder: '******',
      inputAttributes: {
          maxlength: 6,
          autocapitalize: 'off',
          autocorrect: 'off',
          style: 'text-align: center; font-size: 1.5rem; letter-spacing: 10px; border-radius: 12px;'
      },
      allowOutsideClick: false,
      allowEscapeKey: false,
      confirmButtonText: '<i class="fas fa-unlock-alt me-2"></i> Buka Akses',
      confirmButtonColor: '#0d6efd',
      preConfirm: async (enteredPin) => {
          if (!enteredPin) {
              Swal.showValidationMessage('<i class="fas fa-exclamation-circle"></i> PIN tidak boleh kosong!');
              return false;
          }
          const hashedPin = await hashPIN(enteredPin.trim());
          if (hashedPin !== CORRECT_PIN_HASH) {
              Swal.showValidationMessage('<i class="fas fa-exclamation-triangle"></i> PIN salah! Akses ditolak.');
              return false;
          }
          return true;
      }
  });

  if (pin) {
      sessionStorage.setItem('admin_authenticated', 'true');
      Swal.fire({
          icon: 'success',
          title: 'Akses Diberikan',
          text: 'Selamat datang di Panel Admin',
          timer: 1500,
          showConfirmButton: false
      });
      initUI();
      loadDataServer();
  }
}

$(document).ready(function() {
  checkAccessPin();
});

// ==========================================
// KONTROL SIDEBAR & UI
// ==========================================
$('#sidebarCollapse').on('click', function() {
    $('#sidebar').toggleClass('active');
    $('.sidebar-overlay').toggleClass('active');
});

$('#closeSidebar').on('click', function(e) {
    e.preventDefault();
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

$('#sidebarOverlay').on('click', function() {
    $('#sidebar').removeClass('active');
    $('.sidebar-overlay').removeClass('active');
});

$('.sidebar-link').on('click', function() {
    if ($(window).width() <= 768) {
        $('#sidebar').removeClass('active');
        $('.sidebar-overlay').removeClass('active');
    }
});

function initUI() {
    document.getElementById('tanggal').valueAsDate = new Date();
    document.getElementById('tanggalMassal').valueAsDate = new Date();
    
    let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    $('#filterBulanRekapan').val(currentMonth);
    
    $('#selectGrafikPegawai').select2({ placeholder: "Ketik nama untuk mencari...", allowClear: true, width: '100%', theme: 'bootstrap-5' });
    $('#selectGrafikPegawai').on('change', updateChartPegawai);
    $('#nama').select2({ placeholder: "Pilih Pegawai...", width: '100%' });

    $('.sidebar-link').on('click', function(e) {
      e.preventDefault();
      let target = $(this).data('target');
      $('.sidebar-link').removeClass('active');
      $(this).addClass('active');
      $('#pageTitle').text('SIRA-MANGAN');
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
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, data: payload })
    });
    return await response.json();
  } catch (error) { throw new Error('Gagal terhubung ke server.'); }
}

function setDatabaseStatus(status) {
  const badge = document.getElementById('dbStatusBadge');
  if (!badge) return;
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
  let el = document.getElementById('lastUpdate');
  if(el) el.innerText = `Diperbarui: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadDataServer(isSilent = false) {
  isRekapanLoaded = false;
  isLogsLoaded = false;
  setDatabaseStatus('connecting');
  
  if (!isSilent) {
    let tBody = document.getElementById('tabelBody');
    if(tBody) tBody.innerHTML = `<tr><td colspan="10" class="text-center py-5"><div class="spinner-border text-primary opacity-50 mb-3" style="width: 2.5rem; height: 2.5rem;"></div><h6 class="text-muted fw-normal">Menarik data terbaru dari server...</h6></td></tr>`;
  }
  
  try {
    const response = await fetch(`${GAS_API_URL}?t=${new Date().getTime()}`);
    if (!response.ok) throw new Error('Jaringan bermasalah.');
    const result = await response.json();
    
    if (result.status === 'success') {
      rawDataPegawai = result.data.rekapan;
      globalLogs = result.data.logs;
      systemLogsData = result.data.systemLogs || []; 
      globalHariEfektifBulanan = result.data.hariEfektifBulanan || {};
      
      if (!isSilent) {
        populateDropdownPegawai(rawDataPegawai);
        if (typeof populateDaftarPegawai === 'function') populateDaftarPegawai(rawDataPegawai);
        if (typeof populateDropdownGroup === 'function') populateDropdownGroup(rawDataPegawai);
      }
      
      isRekapanLoaded = true;
      isLogsLoaded = true;
      
      setDatabaseStatus('connected');
      updateLastUpdated();

      if (typeof populateLogAktivitas === 'function') populateLogAktivitas(systemLogsData);
      
      try {
        applyFilterBulan(); 
      } catch (graphError) {
        console.warn("Grafik/Filter gagal dimuat:", graphError);
      }

    } else { 
      throw new Error(result.message); 
    }
  } catch (error) {
    console.error("Error: ", error);
    setDatabaseStatus('error');
    if (!isSilent) {
      let tBody = document.getElementById('tabelBody');
      if(tBody) tBody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger bg-danger bg-opacity-10 rounded"><i class="fas fa-exclamation-circle fs-2 mb-2"></i><br>Koneksi ke Database gagal: ${error.message}</td></tr>`;
    }
  }
}

// ==========================================
// DATA PROCESSING, TABLES & ANIMATIONS
// ==========================================
function checkAndRenderRekapan() {
  if (isRekapanLoaded && isLogsLoaded) {
    applyFilterBulan();
    updateLastUpdated();
    setDatabaseStatus('connected'); 
  }
}

function applyFilterBulan() {
  let selectBulan = document.getElementById('filterBulanRekapan');
  if(!selectBulan) return;
  let bulanTerpilih = selectBulan.value;
  let teksBulanTerpilih = selectBulan.options[selectBulan.selectedIndex].text;
  
  let labelBulanStat = document.getElementById('labelBulanStat');
  if(labelBulanStat) labelBulanStat.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${bulanTerpilih === "ALL" ? "Sepanjang Tahun" : teksBulanTerpilih}`;

  let currentYear = new Date().getFullYear();
  let filteredData = [];

  const validCuti = ["CUTI TAHUNAN", "CUTI MELAHIRKAN", "CUTI SAKIT", "CUTI BESAR", "CUTI DILUAR TANGGUNGAN NEGARA", "CUTI ALASAN PENTING", "CUTI BERSAMA/PENGGANTI", "CUTI BERSAMA"];

  rawDataPegawai.forEach(pegawai => {
    let formatBulan = `${currentYear}-${bulanTerpilih}`;
    let logsBulanIni = globalLogs.filter(log => log.nama === pegawai.nama && (bulanTerpilih === "ALL" || log.bulan === formatBulan));
    
    let jmlHadir = 0, jmlCuti = 0, jmlDL = 0, jmlTK = 0;
    let notesBulanIni = []; 
    
    logsBulanIni.forEach(log => {
      let st = log.status ? log.status.toUpperCase() : "";
      if (st === "HADIR") jmlHadir++;
      else if (st === "DINAS LUAR" || st === "DL") jmlDL++;
      else if (st === "TANPA KETERANGAN" || st === "TK") jmlTK++;
      else if (validCuti.includes(st)) jmlCuti++; 
      
      if (log.keterangan && log.keterangan.trim() !== "") {
        let hariTgl = log.tanggal.split('-')[2]; 
        notesBulanIni.push(`&bull; Tgl ${hariTgl}: <span class="text-dark">${log.keterangan}</span>`);
      }
    });
    
    let jmlTidakHadir = jmlCuti + jmlDL + jmlTK;
    let hariEfektif = 0;
    
    if (bulanTerpilih === "ALL") {
      hariEfektif = parseInt(pegawai.hariEfektif || pegawai["HARI EFEKTIF"] || pegawai.HariEfektif) || 0;
    } else {
      hariEfektif = (globalHariEfektifBulanan[formatBulan] && globalHariEfektifBulanan[formatBulan][pegawai.nama]) ? globalHariEfektifBulanan[formatBulan][pegawai.nama] : 0;
    }
    
    let finalKeterangan = notesBulanIni.length > 0 ? notesBulanIni.join('<br>') : '<span class="text-muted fst-italic">-</span>';

    filteredData.push({
      no: pegawai.no, nama: pegawai.nama, golongan: pegawai.golongan,
      hariEfektif: hariEfektif, cuti: jmlCuti, dl: jmlDL, tk: jmlTK,
      jmlTidakHadir: jmlTidakHadir, jumlahKehadiran: jmlHadir, keterangan: finalKeterangan
    });
  });

  populateTabelRekapan(filteredData);
  renderChartBulanKeseluruhan();
  updateChartPegawai();
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
  
  let tBodyEl = document.getElementById('tabelBody');
  if(tBodyEl) tBodyEl.innerHTML = tbody;
  
  dataTableRekapan = $('#tabelRekapan').DataTable({ 
     pageLength: 10, 
     language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
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
  
  dataTableMaster = $('#tabelMasterPegawai').DataTable({ 
    pageLength: 5, 
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' }
  });
  
  if (currentSearch) dataTableMaster.search(currentSearch); dataTableMaster.page(currentPage).draw('page');
  document.getElementById('countPegawai').innerText = data.length;
}

function populateDropdownPegawai(data) {
    let options = '<option value="">Pilih/Ketik Pegawai...</option>';
    data.forEach(row => { options += `<option value="${row.nama}">${row.nama}</option>`; });
    $('#selectGrafikPegawai').html(options).trigger('change');
    $('#nama').html(options).trigger('change');
}

function populateDropdownGroup(data) {
  let uniqueGroups = [...new Set(data.map(item => item.group))].filter(g => g !== "-" && g !== "" && g !== undefined);
  let uniqueGolongan = [...new Set(data.map(item => item.golongan))].filter(g => g !== "-" && g !== "" && g !== undefined);

  let optionsMassal = '<option value="ALL" class="fw-bold text-primary">Semua Group (Seluruh Pegawai)</option>';
  let listGroupHTML = ''; 
  let optionsSearch = '<option value="">-- Silakan Pilih Group --</option>';
  
  uniqueGroups.forEach(g => { 
    optionsMassal += `<option value="${g}">${g}</option>`; 
    listGroupHTML += `<option value="${g}">${g}</option>`; 
    optionsSearch += `<option value="${g}">${g}</option>`; 
  });

  $('#groupMassal, #groupEfektif').html(optionsMassal);
  $('#listGroup').html(listGroupHTML);
  $('#searchGroup').html(optionsSearch);
  $('#pindahTargetGroup').html(optionsSearch.replace('-- Silakan Pilih Group --', 'Pilih target group tujuan...'));
  
  let listGolonganHTML = ''; 
  uniqueGolongan.forEach(g => { listGolonganHTML += `<option value="${g}">${g}</option>`; });
  $('#listGolongan').html(listGolonganHTML);
}

// ==========================================
// CHARTS (GLOBAL & PERSONAL)
// ==========================================
const colorMap = {
  "Hadir": "#198754", "Cuti Tahunan": "#0dcaf0", "Cuti Melahirkan": "#d63384",
  "Cuti Sakit": "#fd7e14", "Cuti Besar": "#6f42c1", "Cuti Bersama/Pengganti": "#6c757d",
  "Cuti Alasan Penting": "#ffc107", "Cuti Bersama": "#20c997", "Dinas Luar": "#0d6efd", 
  "Tanpa Keterangan": "#dc3545", "Libur": "#adb5bd", "Cuti Diluar Tanggungan Negara": "#e83e8c"
};

function renderChartBulanKeseluruhan() {
  const selectBulan = document.getElementById('filterBulanRekapan');
  if(!selectBulan) return;
  const bulanTerpilih = selectBulan.value; 
  const currentYear = new Date().getFullYear(); 
  const formatBulan = `${currentYear}-${bulanTerpilih}`; 
  
  let mapData = {};
  let grandTotalHadir = 0;
  let grandTotalAbsen = 0;

  globalLogs.forEach(log => {
    const isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    let st = log.status ? log.status.toUpperCase() : "";

    if(isMatch && st !== "LIBUR" && st !== "") {
      if(!mapData[log.bulan]) { 
        mapData[log.bulan] = { "Total Kehadiran": 0, "Total Cuti": 0, "DL": 0, "TK": 0 }; 
      }
      
      const cutiCategories = ["CUTI TAHUNAN", "CUTI MELAHIRKAN", "CUTI SAKIT", "CUTI BESAR", "CUTI BERSAMA/PENGGANTI", "CUTI ALASAN PENTING", "CUTI BERSAMA", "CUTI DILUAR TANGGUNGAN NEGARA"];

      if(st === "HADIR") {
        mapData[log.bulan]["Total Kehadiran"]++;
        grandTotalHadir++; 
      } else {
        grandTotalAbsen++; 
        if(st === "DL" || st === "DINAS LUAR") mapData[log.bulan]["DL"]++; 
        else if(st === "TK" || st === "TANPA KETERANGAN") mapData[log.bulan]["TK"]++;
        else if(cutiCategories.includes(st)) mapData[log.bulan]["Total Cuti"]++;
      }
    }
  });

  animateValue("statTotalHadir", 0, grandTotalHadir, 500, ' <span class="fs-6 text-muted fw-normal">Hari</span>');
  animateValue("statTotalAbsen", 0, grandTotalAbsen, 500, ' <span class="fs-6 text-muted fw-normal">Hari</span>');
  animateValue("statTotalPegawai", 0, rawDataPegawai.length, 500);

  let labelsOriginal = Object.keys(mapData).sort(); 
  const shortMonths = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun", "07": "Jul", "08": "Ags", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des" };
  let labelsNamaBulan = labelsOriginal.map(l => {
    let kodeBulan = l.includes('-') ? l.split('-')[1] : l;
    return shortMonths[kodeBulan] || kodeBulan;
  });

  let datasets = [];
  const customColorMap = { "Total Kehadiran": "#198754", "Total Cuti": "#fd7e14", "DL": "#0d6efd", "TK": "#dc3545" };

  Object.keys(customColorMap).forEach(key => {
    let dataArray = labelsOriginal.map(b => mapData[b][key] || 0);
    datasets.push({ 
      label: key, data: dataArray, backgroundColor: customColorMap[key], borderRadius: 4, barPercentage: 0.7, borderWidth: 0,
      datalabels: { anchor: 'end', align: 'top', offset: 2, color: customColorMap[key], font: { weight: 'bold', size: 11 } }
    });
  });

  const canvas = document.getElementById('chartAllBulan');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if(window.chartAll) window.chartAll.destroy(); 
  if(typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

  window.chartAll = new Chart(ctx, {
    type: 'bar',
    data: { labels: labelsNamaBulan.length ? labelsNamaBulan : ['No Data'], datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0], backgroundColor: '#e2e8f0' }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 35 } }, 
      plugins: { 
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, font: { family: "'Plus Jakarta Sans'", size: 11 } } },
        datalabels: { display: true, formatter: (value) => value > 0 ? value : '' }
      },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { display: false } } }
    }
  });
}

function updateChartPegawai() {
  let namaPegawai = document.getElementById('selectGrafikPegawai').value;
  if(!namaPegawai) return;

  let elBulan = document.getElementById('filterBulanRekapan');
  let bulanTerpilih = elBulan ? elBulan.value : "ALL";
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`;

  let stats = { 
    "Hadir": 0, "Libur": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, 
    "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Bersama/Pengganti": 0, "Cuti Alasan Penting": 0, 
    "Cuti Bersama": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0 
  };

  globalLogs.forEach(log => {
    if(log.nama === namaPegawai && (bulanTerpilih === "ALL" || log.bulan === formatBulan)) {
      let st = log.status ? log.status.toUpperCase() : "";
      if(st === "HADIR") stats["Hadir"]++;
      else if(st === "LIBUR") stats["Libur"]++;
      else if(st === "CUTI TAHUNAN") stats["Cuti Tahunan"]++;
      else if(st === "CUTI MELAHIRKAN") stats["Cuti Melahirkan"]++;
      else if(st === "CUTI SAKIT") stats["Cuti Sakit"]++;
      else if(st === "CUTI BESAR") stats["Cuti Besar"]++;
      else if(st === "CUTI DILUAR TANGGUNGAN NEGARA") stats["Cuti Diluar Tanggungan Negara"]++;
      else if(st === "CUTI BERSAMA/PENGGANTI") stats["Cuti Bersama/Pengganti"]++;
      else if(st === "CUTI ALASAN PENTING") stats["Cuti Alasan Penting"]++;
      else if(st === "DINAS LUAR" || st === "DL") stats["Dinas Luar"]++;
      else if(st === "TANPA KETERANGAN" || st === "TK") stats["Tanpa Keterangan"]++;
      else if(st === "CUTI BERSAMA") stats["Cuti Bersama"]++;
    }
  });

  let labels = [], dataCounts = [], bgColors = [], totalTercatat = 0;
  for (let key in stats) {
    if (stats[key] > 0) { 
      labels.push(key); dataCounts.push(stats[key]); bgColors.push(colorMap[key] || "#cccccc"); totalTercatat += stats[key]; 
    }
  }

  let pembagi = totalTercatat;
  const canvas = document.getElementById('chartPerPegawai');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if(chartPersonal) chartPersonal.destroy();

  chartPersonal = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels.length ? labels : ['Belum Ada Data'],
      datasets: [{ data: dataCounts.length ? dataCounts : [1], backgroundColor: bgColors.length ? bgColors : ['#f8f9fa'], borderWidth: 1, hoverOffset: 15 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, 
      animation: { animateRotate: true, animateScale: true, duration: 1500, easing: 'easeOutBounce' },
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, padding: 15, font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } } },
        datalabels: { 
          color: (context) => {
             let label = context.chart.data.labels[context.dataIndex];
             return label === 'Belum Ada Data' || label === 'Libur' ? '#475569' : '#ffffff';
          },
          font: { weight: 'bold', size: 12 },
          formatter: (value, context) => {
            let label = context.chart.data.labels[context.dataIndex];
            if (label === 'Belum Ada Data' || pembagi === 0) return '';
            let percentage = ((value / pembagi) * 100).toFixed(1);
            return percentage > 0 ? percentage + '%' : ''; 
          }
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.9)', titleColor: '#2c3e50', bodyColor: '#2c3e50', borderColor: '#e9ecef', borderWidth: 1, 
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

async function handleAbsensiSubmit(e) {
  e.preventDefault();
  let btn = $('#btnSubmitAbsen'); 
  let originalContent = '<i class="fas fa-save me-2"></i>Simpan Perubahan';
  btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Menyimpan...').prop('disabled', true);
  
  let obj = { tanggal: $('#tanggal').val(), nama: $('#nama').val(), status: $('#status').val(), keterangan: $('#keterangan').val() };
  try {
    let res = await fetchPost('submitAbsensi', obj);
    showToast(res.message, res.status); 
    if(res.status === 'success') { $('#formAbsensi')[0].reset(); $('#nama').val(null).trigger('change'); loadDataServer(true); }
  } catch(err) { showToast(err.message, "error"); } finally { btn.html(originalContent).prop('disabled', false); }
}

async function handleHariEfektif(e) {
  e.preventDefault();
  const grp = $('#groupEfektif').val(); const namaBulan = $('#bulanEfektif option:selected').text(); const jmlHari = $('#jumlahHari').val();
  if (confirm(`Update hari efektif di TAB [${namaBulan}] untuk Group: ${grp}?`)) {
    const btn = $('#btnSubmitEfektif'); let originalContent = '<i class="fas fa-save me-2"></i>Simpan Konfigurasi';
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
    try {
      let res = await fetchPost('setHariEfektif', { targetSheet: namaBulan, group: grp, hariEfektif: parseInt(jmlHari) });
      showToast(res.message, res.status);
      if (res.status === 'success') { $('#formHariEfektif')[0].reset(); loadDataServer(true); }
    } catch (err) { showToast(err.message, "error"); } finally { btn.html(originalContent).prop('disabled', false); }
  }
}

async function handleStatusMassal(e) {
  e.preventDefault(); 
  let grp = $('#groupMassal').val();
  let confirmMsg = grp === "ALL" ? "Status SELURUH PEGAWAI akan diubah. Lanjutkan?" : `Status seluruh pegawai di GROUP ${grp} akan diubah. Lanjutkan?`;
  
  if(confirm(confirmMsg)) {
    let btn = $('#btnStatusMassal'); let originalContent = '<i class="fas fa-bolt me-2"></i>Eksekusi Perubahan';
    btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
    let obj = { tanggal: $('#tanggalMassal').val(), group: grp, status: $('#statusMassal').val(), keterangan: "" };
    try {
      let res = await fetchPost('setStatusMassal', obj);
      showToast(res.message, res.status); 
      if(res.status === 'success') { $('#formStatusMassal')[0].reset(); loadDataServer(true); }
    } catch(err) { showToast(err.message, "error"); } finally { btn.html(originalContent).prop('disabled', false); }
  }
}

async function handlePegawaiSubmit(e) {
  e.preventDefault(); let btn = $('#btnSubmitPegawai'); btn.html('<i class="fas fa-spinner fa-spin me-2"></i>Memproses...').prop('disabled', true);
  try {
    let res = await fetchPost('simpanPegawaiBaru', { namaBaru: $('#namaBaru').val(), golongan: $('#golongan').val(), group: $('#groupBaru').val() });
    showToast(res.message, res.status); $('#formPegawai')[0].reset();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-plus me-2"></i>Tambahkan Pegawai').prop('disabled', false);
}

function bukaModalEdit(nama, golongan, group) {
  $('#editOldNama').val(nama); $('#editNewNama').val(nama); $('#editNewGolongan').val(golongan); $('#editNewGroup').val(group === "-" ? "" : group);
  new bootstrap.Modal(document.getElementById('modalEdit')).show();
}

async function handleEditSubmit(e) {
  e.preventDefault(); let btn = $('#btnSimpanEdit'); btn.html('Menyimpan...').prop('disabled', true);
  try {
    let res = await fetchPost('editPegawai', { oldNama: $('#editOldNama').val(), newNama: $('#editNewNama').val(), newGolongan: $('#editNewGolongan').val(), newGroup: $('#editNewGroup').val() });
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalEdit')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('Simpan Perubahan').prop('disabled', false);
}

async function hapusData(nama) {
  if (confirm(`Peringatan! Hapus permanen data pegawai: ${nama}?`)) {
    try {
      let res = await fetchPost('hapusPegawai', nama);
      showToast(res.message, res.status); if (res.status === 'success') loadDataServer(true);
    } catch(err) { showToast(err.message, "error"); }
  }
}

async function handleResetAbsensi() {
  if (confirm("🚨 PERINGATAN BAHAYA!\n\nAnda yakin ingin MENGHAPUS SEMUA ISI ABSENSI?")) {
    if (prompt("Ketik 'RESET' untuk melanjutkan:") === "RESET") {
      try {
        let res = await fetchPost('resetSemuaAbsensi', {});
        showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true);
      } catch(err) { showToast(err.message, "error"); }
    } else showToast("Proses dibatalkan.", "error");
  }
}

// ==========================================
// MANAJEMEN GROUP
// ==========================================
function tampilkanAnggotaGroup() {
  let selectedGroup = $('#searchGroup').val(); let tbody = $('#bodyAnggotaGroup');
  if(!selectedGroup) { tbody.html('<tr><td colspan="4" class="text-muted py-5"><i class="fas fa-info-circle me-2"></i>Pilih group pada dropdown.</td></tr>'); return; }
  let anggota = rawDataPegawai.filter(p => p.group === selectedGroup);
  if(anggota.length === 0) { tbody.html(`<tr><td colspan="4" class="text-danger fw-bold py-5"><i class="fas fa-exclamation-triangle me-2"></i>Tidak ada pegawai di group ini.</td></tr>`); return; }
  
  let html = '';
  anggota.forEach((p, idx) => {
    html += `<tr><td>${idx + 1}</td><td class="text-start fw-bold">${p.nama}</td><td>${p.golongan}</td>
      <td>
        <button class="btn btn-sm btn-info text-white mx-1 shadow-sm" onclick="bukaModalPindahGroup('${p.nama}')"><i class="fas fa-exchange-alt"></i> Pindah</button>
        <button class="btn btn-sm btn-outline-danger mx-1 shadow-sm" onclick="hapusDariGroup('${p.nama}')"><i class="fas fa-user-minus"></i> Keluarkan</button>
      </td></tr>`;
  });
  tbody.html(html);
}

async function hapusDariGroup(nama) {
  if(confirm(`Keluarkan ${nama} dari group ini?`)) {
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
  try {
    let res = await fetchPost('ubahGroupPegawai', { nama: $('#pindahNamaPegawai').val(), newGroup: $('#pindahTargetGroup').val() });
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
  try {
    let res = await fetchPost('buatGroupBaru', { namaGroup: $('#namaGroupBaru').val(), pegawaiList: Array.from(checkedBoxes).map(cb => cb.value) });
    showToast(res.message, res.status); bootstrap.Modal.getInstance(document.getElementById('modalBuatGroup')).hide();
    if(res.status === 'success') loadDataServer(true);
  } catch(err) { showToast(err.message, "error"); }
  btn.html('<i class="fas fa-save me-2"></i>Simpan Group').prop('disabled', false);
}

// ==========================================
// RENDER TABEL LOG AKTIVITAS (FIXED SORTING)
// ==========================================
function populateLogAktivitas(sysLogs) {
  if (dataTableLogs) { dataTableLogs.destroy(); }
  
  let tbody = '';
  // Urutkan dari JS (opsional)
  const sortedLogs = [...sysLogs].sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
  
  sortedLogs.forEach(log => {
    let badgeClass = 'bg-light text-dark border'; 
    let act = log.aktivitas ? log.aktivitas.toUpperCase() : '';
    
    // Penyesuaian warna badge
    if(act.includes('ABSEN')) badgeClass = 'bg-success bg-opacity-10 text-success border-success border-opacity-25';
    else if(act.includes('HAPUS') || act.includes('RESET')) badgeClass = 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-25';
    else if(act.includes('PEGAWAI') || act.includes('GROUP')) badgeClass = 'bg-primary bg-opacity-10 text-primary border-primary border-opacity-25';
    else if(act.includes('EDIT')) badgeClass = 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-25';

    let dateObj = new Date(log.waktu);
    let timeStr = dateObj.toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});

    // KUNCI PERBAIKAN: Menambahkan data-sort="${log.waktu}" agar DataTables mengurutkan berdasarkan waktu asli
    tbody += `<tr>
      <td class="fw-medium text-muted text-start" data-sort="${log.waktu}" style="white-space: nowrap;"><i class="fas fa-clock me-2 opacity-50"></i>${timeStr}</td>
      <td class="fw-bold"><span class="badge ${badgeClass} px-3 py-2 w-100 rounded-pill">${log.aktivitas}</span></td>
      <td class="small text-start lh-sm">${log.keterangan || '<span class="text-muted fst-italic">-</span>'}</td>
    </tr>`;
  });
  
  $('#logAktivitasBody').html(tbody);
  
  dataTableLogs = $('#tabelLogAktivitas').DataTable({
    pageLength: 10,
    order: [[0, 'desc']], // Akan mengurutkan dari waktu terbaru dengan sempurna
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
    dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>'
  });
}

async function handleHapusSemuaLog() {
    if (confirm("🚨 PERINGATAN!\n\nAnda yakin ingin MENGHAPUS SEMUA RIWAYAT LOG AKTIVITAS?")) {
      if (prompt("Ketik 'HAPUS' (huruf besar) untuk melanjutkan konfirmasi:") === "HAPUS") {
        try {
          let res = await fetchPost('hapusSemuaLog', {});
          showToast(res.message, res.status); if(res.status === 'success') loadDataServer(true); 
        } catch(err) { showToast(err.message, "error"); }
      }
    }
}

document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.addEventListener('click', function(e) { window.open(this.href, '_blank'); });
});

function refreshDatabase(e) {
  const btn = $('#btnRefreshDb'); 
  const frame = $('#frame-database-absensi');
  const originalHtml = '<i class="fas fa-sync-alt"></i>';
  btn.html('<i class="fas fa-sync-alt fa-spin"></i>').prop('disabled', true);
  const currentSrc = frame.attr('src'); frame.attr('src', '');
  setTimeout(() => {
    frame.attr('src', currentSrc);
    setTimeout(() => { btn.html(originalHtml).prop('disabled', false); showToast("Database Absensi dimuat ulang", "info"); }, 1000);
  }, 100);
}

function refreshCuti() {
  const frame = $('#frame-cuti');
  const currentSrc = frame.attr('src'); frame.attr('src', '');
  setTimeout(() => { frame.attr('src', currentSrc); showToast("Sistem Cuti dimuat ulang", "info"); }, 100);
}
