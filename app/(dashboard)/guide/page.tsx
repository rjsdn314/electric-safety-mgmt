'use client';
// 사용설명서 — 화면에서 뺀 설명을 한곳에 모아둔 페이지
import { useState } from 'react';
import { ClipboardList, Thermometer, FolderOpen, SlidersHorizontal, Plug, Bot, HelpCircle, ChevronDown, type LucideIcon } from 'lucide-react';

type Section = { id: string; icon: LucideIcon; title: string; body: React.ReactNode };

export default function GuidePage() {
  const [open, setOpen] = useState<string>('start');

  const sections: Section[] = [
    {
      id: 'start', icon: ClipboardList, title: '점검표 만들기',
      body: (
        <ol>
          <li><b>점검 생성</b>에서 충전소를 고릅니다. 점검 유형은 날짜에 따라 자동으로 정해집니다.</li>
          <li>전압과 전류를 입력합니다. 반기와 연차는 접지저항 칸도 나옵니다.</li>
          <li>열화상 사진이 아직 노트북에 없으면 <b>비워두고</b> 생성합니다.</li>
          <li>생성 버튼을 누르면 엑셀이 만들어지고, 저장 폴더를 지정해 두었으면 PC에도 저장됩니다.</li>
        </ol>
      ),
    },
    {
      id: 'thermal', icon: Thermometer, title: '열화상 사진 넣기',
      body: (
        <>
          <p>현장에서 먼저 점검표를 만들고, 사무실에서 사진을 넣는 흐름입니다.</p>
          <ol>
            <li>카메라 사진을 노트북으로 옮깁니다. 수배전반이 여러 개면 <b>수배전반마다 폴더를 따로</b> 만듭니다.</li>
            <li><b>점검 이력</b>에서 그 점검 줄의 온도계 버튼을 누릅니다.</li>
            <li><b>사진 폴더 선택</b>으로 사진 폴더를 고릅니다. 수배전반이 여러 개면 #1, #2 칸마다 각각 고릅니다.</li>
            <li>사진마다 부위가 붙어 나옵니다. <b>틀린 것만</b> 바꿉니다. <b>엑셀에 들어감</b> 표시가 붙은 사진이 엑셀에 들어갑니다.</li>
            <li><b>점검표에 반영</b>을 누르면 끝입니다.</li>
          </ol>
          <p>반영하면 별지7에 온도, 판정, 사진이 들어가고 PC의 엑셀도 새 파일로 바뀝니다.</p>
          <p className="tip">사진이 이미 노트북에 있으면 점검 생성할 때 바로 넣어도 됩니다.</p>
        </>
      ),
    },
    {
      id: 'photos', icon: FolderOpen, title: '사진은 어디에 저장되나',
      body: (
        <>
          <p>반영하거나 생성하면 고른 사진 전부가 점검 폴더로 들어갑니다.</p>
          <pre>{String.raw`현장폴더\20260915_문막휴게소(인천방향)_분기\문막\1\RB….JPG
                                              \2\RB….JPG`}</pre>
          <ul>
            <li><b>폴더 이름(문막 등):</b> 그 현장의 이전 점검 폴더에서 쓰던 이름을 그대로 씁니다. 없으면 <b>열화상</b>으로 만듭니다.</li>
            <li><b>번호 폴더:</b> 수배전반이 2개 이상일 때만 1, 2로 나뉩니다.</li>
            <li>고른 사진은 점검 폴더로 <b>옮겨지고 원래 폴더에서는 지워집니다</b>. 휴대폰처럼 폴더를 고를 수 없는 곳에서는 <b>사진 선택</b>으로 고르며, 이때는 원본이 남습니다.</li>
            <li>복사가 끝난 것을 확인한 뒤에만 원본을 지웁니다. 같은 사진을 다시 반영해도 덮어쓰지 않습니다.</li>
          </ul>
          <p className="tip">저장 폴더를 지정해야 하고, PC의 Chrome이나 Edge에서만 됩니다.</p>
        </>
      ),
    },
    {
      id: 'parts', icon: SlidersHorizontal, title: '부위 분류와 설정',
      body: (
        <>
          <ul>
            <li><b>기본 부위</b>는 PF, PT, CH입니다. 내가 찍는 부위가 다르면 <a href="/thermal-parts">열화상 부위</a> 메뉴에서 바꿉니다.</li>
            <li><b>현장별로 다를 때</b>는 열화상 칸의 <b>이 현장만 부위 바꾸기</b>에 <code>VCB, PT, CH</code>처럼 적습니다. 그 현장은 계속 이 목록을 쓰고, 엑셀 라벨도 이 이름으로 바뀝니다.</li>
            <li>순서대로 적어야 합니다. 맨 위에 적은 부위가 13행, 다음이 15행입니다.</li>
            <li>부위를 직접 고쳐서 반영하면 그 사진이 예시로 쌓여, 다음부터 자동 분류가 점점 맞아갑니다.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'low', icon: Plug, title: '저압반',
      body: (
        <>
          <p>저압반은 부위를 고를 필요가 없습니다.</p>
          <ul>
            <li>찍은 순서대로 <b>전경 1장과 상별 접속부 3장</b>을 한 세트로 봅니다.</li>
            <li>측정 3장의 온도가 Point 1~3에 들어가고, 전경은 온도 기입에서 빠집니다.</li>
            <li>엑셀의 온도 줄 하나가 저압반 하나입니다. 수배전반 #1은 첫 줄, #2는 둘째 줄에 들어갑니다.</li>
            <li>순서가 다르면 사진 아래에서 전경과 측정을 바꾸면 됩니다.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'ai', icon: Bot, title: 'AI 자동 분류 (선택)',
      body: (
        <>
          <p>AI 키가 없어도 온도 기입과 사진 삽입은 모두 됩니다. 부위 분류만 차이가 납니다.</p>
          <ul>
            <li><b>키가 없을 때:</b> 쌓인 내 예시 사진과 비교해 부위를 추천합니다(무료). 예시가 없으면 직접 고릅니다.</li>
            <li><b>키가 있을 때:</b> AI가 사진을 보고 분류합니다. 점검 1건에 100원 안팎입니다.</li>
          </ul>
          <p>키를 넣으려면 console.anthropic.com에서 API 키를 발급받아 크레딧을 충전한 뒤, Vercel 프로젝트의 Settings, Environment Variables에 <code>ANTHROPIC_API_KEY</code>로 저장하고 <b>Redeploy</b>를 누릅니다.</p>
        </>
      ),
    },
    {
      id: 'trouble', icon: HelpCircle, title: '자주 겪는 문제',
      body: (
        <ul>
          <li><b>“온도 데이터가 있는 사진을 찾지 못했습니다”</b>: 카메라 원본(RB…X.JPG, RB…Y.JPG)이 아니거나, 다른 프로그램에서 편집·압축된 사진입니다. 원본을 넣어주세요.</li>
          <li><b>“AI 키가 설정되지 않았습니다”</b>: 키를 넣었다면 Vercel에서 Redeploy를 눌렀는지 확인하세요.</li>
          <li><b>사진이 폴더에 안 들어갔을 때</b>: 저장 폴더를 지정했는지, 휴대폰이 아닌 PC의 Chrome이나 Edge인지 확인하세요.</li>
          <li><b>온도가 엉뚱한 줄에 들어갈 때</b>: 부위 순서가 양식과 다를 수 있습니다. 현장별 부위 설정에서 순서를 맞춰주세요.</li>
          <li><b>양식이 등록되지 않는 파일</b>: 확장자만 .xlsx이고 실제로는 옛 .xls인 경우가 있습니다. 엑셀에서 “Excel 통합 문서(.xlsx)”로 다시 저장해 올리세요.</li>
        </ul>
      ),
    },
  ];

  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px', maxWidth: 820 }}>
      <h1 style={{ margin: '0 0 4px' }}>사용설명서</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>항목을 누르면 설명이 열립니다.</p>

      {sections.map(s => {
        const isOpen = open === s.id;
        return (
          <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            <button onClick={() => setOpen(isOpen ? '' : s.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, textAlign: 'left' }}>
              <s.icon size={18} color="var(--text-tertiary)" strokeWidth={1.8} />
              <span style={{ flex: 1 }}>{s.title}</span>
              <ChevronDown size={16} color="var(--text-tertiary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {isOpen && <div className="guide-body" style={{ padding: '0 18px 18px' }}>{s.body}</div>}
          </div>
        );
      })}

      <style jsx global>{`
        .guide-body { font-size: 14px; color: var(--text-secondary); line-height: 1.75; }
        .guide-body p { margin: 0 0 10px; }
        .guide-body ol, .guide-body ul { margin: 0 0 10px; padding-left: 20px; }
        .guide-body li { margin-bottom: 6px; }
        .guide-body b { color: var(--text-primary); }
        .guide-body a { color: var(--accent); }
        .guide-body code { background: var(--bg-elevated); padding: 1px 6px; border-radius: 6px; font-size: 12.5px; }
        .guide-body pre { background: var(--bg-elevated); padding: 12px 14px; border-radius: 10px; font-size: 12px; overflow-x: auto; line-height: 1.6; }
        .guide-body .tip { font-size: 12.5px; color: var(--text-tertiary); }
      `}</style>
    </div>
  );
}
