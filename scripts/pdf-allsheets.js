#!/usr/bin/env node
// ============================================================
//  직무고시 Excel → PDF (전체 시트, 시트당 1페이지)
//  사용법:  node scripts/pdf-allsheets.js "<직무고시 폴더 경로>"
//
//  · 폴더(하위 포함)의 모든 .xlsx/.xls 를 PDF로 변환(파일 옆에 같은이름.pdf).
//  · Excel을 구동해 "각 시트를 개별 PDF로 추출" 후 pdf-lib로 1개 PDF로 병합.
//    (구형 .xls는 통째 내보내면 1페이지로 뭉개지는 버그가 있어 시트별로 추출함)
//  · 반드시 "엑셀이 설치된 본인 PC에서, 로그인된 상태"로 실행하세요.
// ============================================================
const { PDFDocument } = require('pdf-lib');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('폴더 경로를 주세요:  node scripts/pdf-allsheets.js "<폴더>"');
  process.exit(1);
}

// 1) 대상 파일 수집
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.xlsx?$/i.test(e.name) && !e.name.startsWith('~$')) files.push(f);
  }
})(root);
console.log(`대상 엑셀: ${files.length}개`);
if (!files.length) process.exit(0);

// 2) 작업 폴더 + 파일목록(UTF-8)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'esmpdf-'));
fs.writeFileSync(path.join(work, 'files.txt'), files.join('\n'), 'utf8');

// 3) Excel 시트별 추출 PowerShell (ASCII — 한글경로는 files.txt에서 UTF-8로 읽음)
const ps = `
param([string]$WorkDir)
$ErrorActionPreference='Continue'
$files = Get-Content (Join-Path $WorkDir 'files.txt') -Encoding UTF8 | Where-Object { $_ -ne '' }
$xl = New-Object -ComObject Excel.Application
$xl.Visible=$false; $xl.DisplayAlerts=$false; $xl.ScreenUpdating=$false
$miss = [System.Reflection.Missing]::Value
$man = @()
$i = 0
foreach ($f in $files) {
  $i++
  $sub = Join-Path $WorkDir ("f$i")
  New-Item -ItemType Directory -Force $sub | Out-Null
  Write-Host ("[{0}/{1}] {2}" -f $i, $files.Count, (Split-Path $f -Leaf))
  try {
    $wb = $xl.Workbooks.Open($f, 0, $true)
    # 구형 .xls(xlExcel8=56)는 PageSetup 수정 시 export가 깨지므로 원본설정 그대로 사용.
    # .xlsx는 fit 설정이 없으면 시트가 퍼지므로 "1페이지 맞춤" + 인쇄영역을 적용.
    $legacy = $false
    try { $fsr=[System.IO.File]::OpenRead($f); $hb=New-Object byte[] 4; [void]$fsr.Read($hb,0,4); $fsr.Close(); $legacy = ($hb[0] -eq 0xD0 -and $hb[1] -eq 0xCF -and $hb[2] -eq 0x11 -and $hb[3] -eq 0xE0) } catch {}
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
      $out = Join-Path $sub ("s{0:D3}.pdf" -f $n)
      try { $ws.ExportAsFixedFormat(0, $out, 0, $true, $false) } catch { Write-Host ("   sheet $n fail: " + $_.Exception.Message) }
    }
    $wb.Close($false)
  } catch { Write-Host ("   open/err: " + $_.Exception.Message) }
  $man += ($f + "\`t" + $sub)
}
$xl.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
$man | Set-Content (Join-Path $WorkDir 'manifest.txt') -Encoding UTF8
`;
const psPath = path.join(work, 'export.ps1');
fs.writeFileSync(psPath, ps, 'utf8');

// 4) PowerShell 실행 (사용자 대화형 세션에서 node를 돌리면 Excel COM 정상 동작)
console.log('Excel로 시트 추출 중... (창은 안 뜹니다)');
const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, work], { stdio: 'inherit' });
if (r.status !== 0) console.error('PowerShell 추출 단계 경고/오류 (계속 진행)');

// 5) 시트 PDF 병합 → 원본 옆에 .pdf
(async () => {
  const manifest = fs.readFileSync(path.join(work, 'manifest.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
  let ok = 0, fail = 0;
  for (const line of manifest) {
    const [orig, sub] = line.split('\t').map(s => s.trim());
    if (!orig || !sub || !fs.existsSync(sub)) { fail++; continue; }
    const parts = fs.readdirSync(sub).filter(n => n.endsWith('.pdf')).sort();
    if (!parts.length) { fail++; continue; }
    try {
      const merged = await PDFDocument.create();
      for (const p of parts) {
        const src = await PDFDocument.load(fs.readFileSync(path.join(sub, p)), { updateMetadata: false });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(pg => merged.addPage(pg));
      }
      const outPdf = orig.replace(/\.xlsx?$/i, '.pdf');
      fs.writeFileSync(outPdf, await merged.save());
      ok++;
    } catch (e) { console.error('병합 실패:', path.basename(orig), e.message); fail++; }
  }
  // 정리
  try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  console.log(`\n완료:  성공 ${ok} / 실패 ${fail}`);
})();
