#!/usr/bin/env node
// ============================================================
//  직무고시 한글(HWP) → PDF 일괄 변환
//  사용법:  node scripts/hwp-to-pdf.js "<폴더 경로>"
//
//  · 폴더(하위 포함)의 모든 .hwp/.hwpx 를 PDF로 변환(파일 옆에 같은이름.pdf).
//  · 한글(Hancom Office)을 구동해 "다른 이름으로 저장 → PDF" 방식으로 변환.
//  · 반드시 "한글이 설치된 본인 PC에서, 로그인된 상태"로 실행하세요.
// ============================================================
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.argv[2];
if (!root || !fs.existsSync(root)) {
  console.error('폴더 경로를 주세요:  node scripts/hwp-to-pdf.js "<폴더>"');
  process.exit(1);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.hwpx?$/i.test(e.name) && !e.name.startsWith('~')) files.push(f);
  }
})(root);
console.log(`대상 HWP: ${files.length}개`);
if (!files.length) process.exit(0);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'esmhwp-'));
fs.writeFileSync(path.join(work, 'files.txt'), files.join('\n'), 'utf8');

const ps = `
param([string]$WorkDir)
$ErrorActionPreference='Continue'
$files = Get-Content (Join-Path $WorkDir 'files.txt') -Encoding UTF8 | Where-Object { $_ -ne '' }
try { $hwp = New-Object -ComObject "HWPFrame.HwpObject" } catch { Write-Host "한글(Hancom)을 찾을 수 없습니다. 한글 설치 필요."; exit 1 }
try { [void]$hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") } catch {}
$i = 0
foreach ($f in $files) {
  $i++
  $pdf = [System.IO.Path]::ChangeExtension($f, '.pdf')
  Write-Host ("[{0}/{1}] {2}" -f $i, $files.Count, (Split-Path $f -Leaf))
  try {
    [void]$hwp.Open($f, "", "")
    [void]$hwp.SaveAs($pdf, "PDF", "")
    try { [void]$hwp.Clear(1) } catch {}
  } catch { Write-Host ("   -> 오류: " + $_.Exception.Message); try { [void]$hwp.Clear(1) } catch {} }
}
try { $hwp.Quit() } catch {}
Write-Host "DONE"
`;
const psPath = path.join(work, 'hwp-export.ps1');
fs.writeFileSync(psPath, ps, 'utf8');

console.log('한글(Hancom)로 PDF 변환 중...');
const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, work], { stdio: 'inherit' });

// 결과 집계
let ok = 0;
for (const f of files) { if (fs.existsSync(f.replace(/\.hwpx?$/i, '.pdf'))) ok++; }
try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
console.log(`\n완료:  PDF 생성 ${ok} / ${files.length}`);
