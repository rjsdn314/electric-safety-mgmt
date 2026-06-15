#!/usr/bin/env node
// ============================================================
//  별지7(적외선 열화상) 정리 — 기존 점검표 파일 후처리
//  사용법:  node scripts/fix-byeolji7.js <파일목록.txt(UTF-8, 한 줄에 한 파일)>
//
//  각 .xlsx 의 별지7 시트에서:
//   · "온도측정" 행의 Point 1/2/3 온도값(H~AE열) 비우기
//   · 같은 행 온도차(AF열) = "5℃ 이하" 기본값
//   · 별지7에 박힌 사진(열화상/실화상) 제거 + 참조 안 되는 미디어 정리
//  (날짜·날씨 등 다른 내용은 건드리지 않음. x: 프리픽스 유무 모두 대응)
// ============================================================
const JSZip = require('jszip');
const fs = require('fs');

const listFile = process.argv[2];
if (!listFile || !fs.existsSync(listFile)) { console.error('파일목록 경로를 주세요'); process.exit(1); }
const files = fs.readFileSync(listFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
console.log(`대상 ${files.length}개`);

const dec = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colToNum = c => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
const numToCol = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function clearCell(xml, ref) {
  const re = new RegExp(`<(x:)?c r="${ref}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/(?:x:)?c>)`);
  return xml.replace(re, (_m, px = '', attrs) => {
    const s = (attrs.match(/\ss="\d+"/) || [''])[0];
    return `<${px || ''}c r="${ref}"${s}/>`;
  });
}
function setCellStr(xml, ref, value) {
  const re = new RegExp(`<(x:)?c r="${ref}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/(?:x:)?c>)`);
  if (!re.test(xml)) return xml;   // 셀 없으면 생성 안 함(레이아웃 보존)
  return xml.replace(re, (_m, px = '', attrs) => {
    px = px || '';
    const s = (attrs.match(/\ss="\d+"/) || [''])[0];
    return `<${px}c r="${ref}"${s} t="inlineStr"><${px}is><${px}t xml:space="preserve">${esc(value)}</${px}t></${px}is></${px}c>`;
  });
}
// 사진 앵커 제거(도형/격자 보존)
function removeDrawingPics(dx) {
  return dx.replace(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
    (block) => (/<xdr:pic[\s>]/.test(block) || /<a:blip\b/.test(block)) ? '' : block);
}

async function fixOne(path) {
  const buf = fs.readFileSync(path);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { skip: '보호/비zip' };   // PK 아니면 스킵
  const zip = await JSZip.loadAsync(buf);

  // sharedStrings
  const ssRaw = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
  const shared = [];
  for (const m of ssRaw.matchAll(/<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g)) {
    let t = ''; for (const tm of m[1].matchAll(/<(?:x:)?t[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)) t += tm[1];
    shared.push(dec(t));
  }
  // 별지7 시트 찾기
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rid2f = {};
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*worksheets\/sheet\d+\.xml)"/g)) rid2f[m[1]] = 'xl/' + m[2].replace(/^\.\//, '').replace(/^\//, '');
  const sm = [...wb.matchAll(/<(?:x:)?sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].filter(m => m[1].includes('별지7'));
  if (!sm.length) return { skip: '별지7 없음' };

  let touched = 0;
  for (const s of sm) {
    const f = rid2f[s[2]]; if (!f || !zip.file(f)) continue;
    let sx = await zip.file(f).async('string');

    // 1) "온도측정" 행 동적 탐지 → 그 행의 H(8)~AE(31) 비우고 AF(32)에 온도차 기본값
    const rows = new Set();
    for (const m of sx.matchAll(/<(?:x:)?c r="A(\d+)"[^>]*?t="s"[^>]*?><(?:x:)?v>(\d+)<\/(?:x:)?v>/g)) {
      if ((shared[+m[2]] || '').trim() === '온도측정') rows.add(+m[1]);
    }
    for (const row of rows) {
      for (let c = 8; c <= 31; c++) sx = clearCell(sx, `${numToCol(c)}${row}`);
      sx = setCellStr(sx, `AF${row}`, '5℃ 이하');
    }
    zip.file(f, sx);
    touched += rows.size;

    // 2) 별지7 사진 제거
    const dm = sx.match(/<(?:x:)?drawing r:id="([^"]+)"/);
    if (dm) {
      const relsPath = f.replace(/(worksheets)\/(sheet\d+)\.xml$/, '$1/_rels/$2.xml.rels');
      const dr = zip.file(relsPath) ? await zip.file(relsPath).async('string') : '';
      const tm = dr.match(new RegExp(`Id="${dm[1]}"[^>]*Target="([^"]+)"`)) || dr.match(new RegExp(`Target="([^"]+)"[^>]*Id="${dm[1]}"`));
      if (tm) {
        const dp = 'xl/' + tm[1].replace(/^\.\.\//, '').replace(/^\//, '');
        if (zip.file(dp)) { const dx = await zip.file(dp).async('string'); const nx = removeDrawingPics(dx); if (nx !== dx) zip.file(dp, nx); }
      }
    }
  }

  // 3) 미디어 GC (어떤 드로잉에서도 참조 안 되는 이미지 제거)
  const used = new Set();
  for (const n of Object.keys(zip.files)) {
    if (/^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/.test(n)) {
      const dx = await zip.file(n.replace(/_rels\/(drawing\d+)\.xml\.rels$/, '$1.xml'))?.async('string');
      const rx = await zip.file(n).async('string');
      for (const m of rx.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*media\/[^"]+)"/g)) {
        const id = m[1], media = 'xl/' + m[2].replace(/^\.\.\//, '');
        if (dx && new RegExp(`r:embed="${id}"`).test(dx)) used.add(media);
      }
    }
  }
  for (const n of Object.keys(zip.files)) if (/^xl\/media\//.test(n) && !used.has(n)) zip.remove(n);

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path, out);
  return { ok: true, rows: touched };
}

(async () => {
  let ok = 0, skip = 0;
  for (const f of files) {
    try {
      const r = await fixOne(f);
      if (r.ok) { ok++; console.log(`✅ ${f.split(/[\\/]/).pop()}  (온도측정 ${r.rows}행 정리)`); }
      else { skip++; console.log(`⏭  ${f.split(/[\\/]/).pop()}  (${r.skip})`); }
    } catch (e) { skip++; console.log(`❌ ${f.split(/[\\/]/).pop()}  ${e.message}`); }
  }
  console.log(`\n완료: 처리 ${ok} / 건너뜀 ${skip}`);
})();
