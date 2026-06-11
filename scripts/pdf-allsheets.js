#!/usr/bin/env node
// ============================================================
//  직무고시 Excel → PDF (전체 시트, 시트당 1페이지)
//  사용법:  node scripts/pdf-allsheets.js "<직무고시 폴더 경로>"
//
//  · 폴더(하위 포함)의 모든 .xlsx/.xls 를 PDF로 변환(파일 옆에 같은이름.pdf).
//  · Excel을 구동해 "각 시트를 개별 PDF로 추출" 후 pdf-lib로 1개 PDF로 병합.
//    (구형 .xls는 통째 내보내면 1페이지로 뭉개지는 버그가 있어 시트별로 추출함)
//  · 민감도 레이블(보호)된 파일은 PDF가 암호화돼 읽을 수 없으므로 건너뜀.
//  · 25개씩 묶음 처리 + 완료목록 기록 → 중단돼도 재실행하면 이어서 진행.
//  · 반드시 "엑셀이 설치된 본인 PC에서, 로그인된 상태"로 실행하세요.
// ============================================================
const { PDFDocument } = require('pdf-lib');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('폴더 경로를 주세요:  node scripts/pdf-allsheets.js "<폴더>"');
  process.exit(1);
}

// 대상 수집
const all = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.xlsx?$/i.test(e.name) && !e.name.startsWith('~$')) all.push(f);
  }
})(root);

// 완료목록(재실행 시 이어서) — 루트 경로별로 분리
const doneFile = path.join(os.tmpdir(), 'esmpdf-done-' + crypto.createHash('md5').update(root).digest('hex').slice(0, 8) + '.txt');
const done = new Set(fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const files = all.filter(f => !done.has(f));
console.log(`대상 엑셀: ${all.length}개 (완료 ${done.size}, 남은 ${files.length})`);
if (!files.length) { console.log('모두 완료 상태입니다. 처음부터 다시 하려면 완료목록 삭제: ' + doneFile); process.exit(0); }

// 시트 추출 PowerShell (묶음 단위 실행, manifest는 파일마다 즉시 기록)
const PS = `
param([string]$WorkDir)
$ErrorActionPreference='Continue'
$files = Get-Content (Join-Path $WorkDir 'files.txt') -Encoding UTF8 | Where-Object { $_ -ne '' }
$manPath = Join-Path $WorkDir 'manifest.txt'
$miss = [System.Reflection.Missing]::Value
$xl = New-Object -ComObject Excel.Application
$xl.Visible=$false; $xl.DisplayAlerts=$false; $xl.ScreenUpdating=$false
$i = 0
foreach ($f in $files) {
  $i++
  $sub = Join-Path $WorkDir ("f$i")
  New-Item -ItemType Directory -Force $sub | Out-Null
  Write-Host ("  - {0}" -f (Split-Path $f -Leaf))
  $status = "OK"
  try {
    $wb = $xl.Workbooks.Open($f, 0, $true)
    $protected = $false
    try { if ([string]($wb.SensitivityLabel.GetLabel().LabelId) -ne "") { $protected = $true } } catch {}
    if ($protected) {
      Write-Host "      -> 보호(민감도 레이블)됨, 건너뜀"
      $status = "PROTECTED"
    } else {
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
        try { $ws.ExportAsFixedFormat(0, $out, 0, $true, $false) } catch { Write-Host ("      sheet $n fail: " + $_.Exception.Message) }
      }
    }
    $wb.Close($false)
  } catch { Write-Host ("      open err: " + $_.Exception.Message); $status = "OPENFAIL" }
  Add-Content $manPath ($f + "\`t" + $sub + "\`t" + $status) -Encoding UTF8
}
$xl.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
`;

const CHUNK = 25;
let ok = 0, skip = 0, fail = 0;

(async () => {
  for (let c = 0; c < files.length; c += CHUNK) {
    const chunk = files.slice(c, c + CHUNK);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'esmpdf-'));
    fs.writeFileSync(path.join(work, 'files.txt'), chunk.join('\n'), 'utf8');
    const psPath = path.join(work, 'export.ps1');
    fs.writeFileSync(psPath, PS, 'utf8');
    console.log(`\n[묶음 ${Math.floor(c / CHUNK) + 1}/${Math.ceil(files.length / CHUNK)}] ${chunk.length}개 추출...`);
    spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, work], { stdio: 'inherit' });

    // 이 묶음 즉시 병합 (manifest에 기록된 것만)
    const manPath = path.join(work, 'manifest.txt');
    const lines = fs.existsSync(manPath) ? fs.readFileSync(manPath, 'utf8').split(/\r?\n/).filter(Boolean) : [];
    for (const line of lines) {
      const [orig, sub, status] = line.split('\t').map(s => s && s.trim());
      if (!orig) continue;
      if (status === 'PROTECTED') { skip++; fs.appendFileSync(doneFile, orig + '\n'); continue; }
      if (!sub || !fs.existsSync(sub)) { fail++; continue; }
      const parts = fs.readdirSync(sub).filter(n => n.endsWith('.pdf')).sort();
      if (!parts.length) { fail++; continue; }
      try {
        const merged = await PDFDocument.create();
        for (const p of parts) {
          const src = await PDFDocument.load(fs.readFileSync(path.join(sub, p)), { updateMetadata: false });
          (await merged.copyPages(src, src.getPageIndices())).forEach(pg => merged.addPage(pg));
        }
        fs.writeFileSync(orig.replace(/\.xlsx?$/i, '.pdf'), await merged.save());
        ok++;
        fs.appendFileSync(doneFile, orig + '\n');
      } catch (e) { console.error('  병합 실패:', path.basename(orig), e.message); fail++; }
    }
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    console.log(`  누적: 성공 ${ok} / 보호건너뜀 ${skip} / 실패 ${fail}`);
  }
  console.log(`\n완료:  성공 ${ok} / 보호건너뜀 ${skip} / 실패 ${fail}`);
  console.log('(재실행하면 남은/실패 파일만 다시 시도합니다)');
})();
