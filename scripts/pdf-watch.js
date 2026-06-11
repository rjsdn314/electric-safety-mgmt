#!/usr/bin/env node
// ============================================================
//  PDF 변환 도우미 (감시형)
//  사용법:  node scripts/pdf-watch.js "<감시할 폴더(직무고시 루트)>"
//
//  웹앱의 [PDF 저장]/[엑셀+PDF 저장] 버튼이 엑셀 옆에 마커파일을 만들면
//  (파일명.xlsx.pdfonly / 파일명.xlsx.pdfboth), 이 도우미가 감지해
//  Excel로 실제 모양 그대로 PDF를 생성한다.
//   · .pdfboth → 엑셀 + PDF 둘 다 남김
//   · .pdfonly → PDF 생성 후 엑셀은 삭제(PDF만 남김)
//  민감도 레이블(보호) 파일은 변환 불가 → 안내 텍스트 파일을 남기고 마커 제거.
//  Excel이 설치된 PC에서, 로그인 상태로 실행하세요. (창 닫으면 중지)
// ============================================================
const { PDFDocument } = require('pdf-lib');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('감시할 폴더를 주세요:  node scripts/pdf-watch.js "<폴더>"');
  process.exit(1);
}

const PS = `
param([string]$Src, [string]$OutDir)
$ErrorActionPreference='Continue'
$xl = New-Object -ComObject Excel.Application
$xl.Visible=$false; $xl.DisplayAlerts=$false; $xl.ScreenUpdating=$false
$miss = [System.Reflection.Missing]::Value
$code = 0
try {
  $wb = $xl.Workbooks.Open($Src, 0, $true)
  $protected = $false
  try { if ([string]($wb.SensitivityLabel.GetLabel().LabelId) -ne "") { $protected = $true } } catch {}
  if ($protected) { $code = 2 }
  else {
    $legacy = $false
    try { $fsr=[System.IO.File]::OpenRead($Src); $hb=New-Object byte[] 4; [void]$fsr.Read($hb,0,4); $fsr.Close(); $legacy = ($hb[0] -eq 0xD0 -and $hb[1] -eq 0xCF -and $hb[2] -eq 0x11 -and $hb[3] -eq 0xE0) } catch {}
    $n = 0
    foreach ($ws in $wb.Worksheets) {
      if ($ws.Visible -ne -1) { continue }
      $n++
      if (-not $legacy) {
        try { $ws.PageSetup.Zoom=$false; $ws.PageSetup.FitToPagesWide=1; $ws.PageSetup.FitToPagesTall=1 } catch {}
        try {
          $pa=[string]$ws.PageSetup.PrintArea
          if ([string]::IsNullOrWhiteSpace($pa)) {
            $lrc=$ws.Cells.Find('*',$ws.Cells.Item(1,1),-4163,$miss,1,2)
            $lcc=$ws.Cells.Find('*',$ws.Cells.Item(1,1),-4163,$miss,2,2)
            if ($lrc -ne $null -and $lcc -ne $null) { $ws.PageSetup.PrintArea = $ws.Range($ws.Cells.Item(1,1),$ws.Cells.Item($lrc.Row,$lcc.Column)).Address() }
          }
        } catch {}
      }
      try { $ws.ExportAsFixedFormat(0, (Join-Path $OutDir ("s{0:D3}.pdf" -f $n)), 0, $true, $false) } catch {}
    }
  }
  $wb.Close($false)
} catch { $code = 1 }
$xl.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
exit $code
`;
const psPath = path.join(os.tmpdir(), 'esm-watch-export.ps1');
fs.writeFileSync(psPath, PS, 'utf8');

function findMarkers(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) findMarkers(f, out, depth + 1);
    else if (/\.(pdfonly|pdfboth)$/i.test(e.name)) out.push(f);
  }
  return out;
}

async function convert(marker) {
  const mode = marker.toLowerCase().endsWith('.pdfonly') ? 'only' : 'both';
  const xlsx = marker.replace(/\.(pdfonly|pdfboth)$/i, '');
  const name = path.basename(xlsx);
  if (!fs.existsSync(xlsx)) { try { fs.unlinkSync(marker); } catch {} return; }
  console.log(`변환 시작: ${name}`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'esmwatch-'));
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, xlsx, work], { stdio: 'pipe' });
  try {
    if (r.status === 2) {
      fs.writeFileSync(xlsx + '.PDF변환불가-보호됨.txt',
        '이 파일은 Microsoft 정보보호(민감도 레이블)로 잠겨 있어 PDF로 변환할 수 없습니다.\n' +
        'Excel에서 파일을 연 뒤 [민감도] → "없음/공개"로 바꿔 저장하면 변환됩니다.\n', 'utf8');
      console.log(`  -> 보호된 파일, 건너뜀: ${name}`);
      try { fs.unlinkSync(marker); } catch {}
      return;
    }
    const parts = fs.readdirSync(work).filter(n => n.endsWith('.pdf')).sort();
    if (!parts.length) { console.log(`  -> 실패(시트 추출 0): ${name}`); try { fs.unlinkSync(marker); } catch {}; return; }
    const merged = await PDFDocument.create();
    for (const p of parts) {
      const src = await PDFDocument.load(fs.readFileSync(path.join(work, p)), { updateMetadata: false });
      (await merged.copyPages(src, src.getPageIndices())).forEach(pg => merged.addPage(pg));
    }
    const outPdf = xlsx.replace(/\.xlsx?$/i, '.pdf');
    fs.writeFileSync(outPdf, await merged.save());
    if (mode === 'only') { try { fs.unlinkSync(xlsx); } catch {} }
    try { fs.unlinkSync(marker); } catch {}
    console.log(`  -> 완료 (${parts.length}페이지${mode === 'only' ? ', 엑셀 정리됨' : ''}): ${path.basename(outPdf)}`);
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    for (const m of findMarkers(root)) await convert(m);
  } catch (e) { console.error('오류:', e.message); }
  busy = false;
}

console.log('===========================================');
console.log(' PDF 변환 도우미 실행 중');
console.log(' 감시 폴더: ' + root);
console.log(' 웹앱에서 [PDF 저장]/[엑셀+PDF 저장]를 누르면 자동 변환됩니다.');
console.log(' (이 창을 닫으면 중지됩니다)');
console.log('===========================================');
tick();
setInterval(tick, 5000);
