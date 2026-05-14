import { useState, useRef, useEffect, useCallback } from "react";
import {
  ADMIN_ID, ADMIN_PW,
  KAKAO_CLIENT_ID, NAVER_CLIENT_ID,
  startKakaoLogin, startNaverLogin, handleOAuthCallback,
  getSession, saveSession, clearSession,
  registerUser, getUser,
  getAllUsers, deleteUser,
  formatPhone,
} from './auth.js';

// ─── Capacitor (모바일 네이티브 전용, 웹에서는 자동 무시) ──────────
let StatusBar, Style, CapApp, SplashScreen;
const IS_NATIVE = typeof window !== 'undefined' && !!(window?.Capacitor?.isNativePlatform?.());
if (IS_NATIVE) {
  Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
  ]).then(([sb, app, sp]) => {
    sb.StatusBar.setStyle({ style: sb.Style.Dark }).catch(()=>{});
    sb.StatusBar.setBackgroundColor({ color: '#14532D' }).catch(()=>{});
    sp.SplashScreen.hide().catch(()=>{});
    CapApp = app.App;
  }).catch(()=>{});
}

// ─── 환경변수에서 API 키 읽기 ─────────────────────────────────────
// Vercel/Netlify 배포 시: 환경변수 VITE_ANTHROPIC_KEY 설정
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY || '';

// ─── 상수 ─────────────────────────────────────────────────────────
const REGIONS = {
  '서울특별시':['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '부산광역시':['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'],
  '대구광역시':['군위군','남구','달서구','달성군','동구','북구','서구','수성구','중구'],
  '인천광역시':['강화군','계양구','남동구','동구','미추홀구','부평구','서구','연수구','옹진군','중구'],
  '광주광역시':['광산구','남구','동구','북구','서구'],
  '대전광역시':['대덕구','동구','서구','유성구','중구'],
  '울산광역시':['남구','동구','북구','울주군','중구'],
  '세종특별자치시':['세종시'],
  '경기도':['가평군','고양시 덕양구','고양시 일산동구','고양시 일산서구','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시 분당구','성남시 수정구','성남시 중원구','수원시 권선구','수원시 영통구','수원시 장안구','수원시 팔달구','시흥시','안산시 단원구','안산시 상록구','안성시','안양시 동안구','안양시 만안구','양주시','양평군','여주시','연천군','오산시','용인시 기흥구','용인시 수지구','용인시 처인구','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시'],
  '강원특별자치도':['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  '충청북도':['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','진천군','청주시 상당구','청주시 서원구','청주시 청원구','청주시 흥덕구','충주시'],
  '충청남도':['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시 동남구','천안시 서북구','청양군','태안군','홍성군'],
  '전북특별자치도':['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시 덕진구','전주시 완산구','정읍시','진안군'],
  '전라남도':['강진군','고흥군','곡성군','광양시','구례군','나주시','담양군','목포시','무안군','보성군','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'],
  '경상북도':['경산시','경주시','고령군','구미시','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시 남구','포항시 북구'],
  '경상남도':['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시 마산합포구','창원시 마산회원구','창원시 성산구','창원시 의창구','창원시 진해구','통영시','하동군','함안군','함양군','합천군'],
  '제주특별자치도':['서귀포시','제주시']
};

const EXTRA_OPTIONS=[
  {value:'청년(만 19~34세)',label:'🎓 청년 (만 19~34세)'},
  {value:'청년 1인 가구',label:'🏠 청년 1인 가구'},
  {value:'청년 창업 준비 중',label:'🚀 청년 창업 준비 중'},
  {value:'자영업자/소상공인',label:'🏪 자영업자 / 소상공인'},
  {value:'임산부',label:'🤰 임산부'},{value:'출산 후 1년 이내',label:'👶 출산 후 1년 이내'},
  {value:'신혼부부(혼인 7년 이내)',label:'💍 신혼부부 (혼인 7년 이내)'},{value:'결혼 준비 중(예비 신혼부부)',label:'💒 결혼 준비 중 (예비 신혼부부)'},
  {value:'다자녀 가구(2명 이상)',label:'👨‍👩‍👧‍👦 다자녀 가구 (2명 이상)'},{value:'한부모 가정',label:'👤 한부모 가정'},
  {value:'장애인 가구',label:'♿ 장애인 가구'},{value:'국가유공자/보훈 대상',label:'🎖️ 국가유공자 / 보훈'},
  {value:'기초생활수급자 또는 차상위계층',label:'📋 기초/차상위계층'},{value:'노인 단독 가구(65세 이상)',label:'👴 노인 단독 가구'},
];
const EXTRA_GROUPS=[
  {label:'청년 (Youth)',items:[
    {value:'청년(만 19~34세)',emoji:'🎓',label:'청년 (만 19~34세)',bc:'#bbf7d0'},
    {value:'청년 창업 준비 중',emoji:'🚀',label:'청년 창업 준비 중',bc:'#e9d5ff'},
    {value:'청년 1인 가구',emoji:'🏠',label:'청년 1인 가구',bc:'#bfdbfe'},
  ]},
  {label:'경제 / 직업',items:[
    {value:'자영업자/소상공인',emoji:'🏪',label:'자영업자 / 소상공인',bc:'#fde68a'},
    {value:'기초생활수급자 또는 차상위계층',emoji:'🪙',label:'기초 / 차상위계층',bc:'#fed7aa'},
  ]},
  {label:'가족 / 출산',items:[
    {value:'임산부',emoji:'🤰',label:'임산부',bc:'#fecdd3'},
    {value:'출산 후 1년 이내',emoji:'👶',label:'출산 후 1년 이내',bc:'#fbcfe8'},
    {value:'신혼부부(혼인 7년 이내)',emoji:'💍',label:'신혼부부 (혼인 7년 이내)',bc:'#fecaca'},
    {value:'결혼 준비 중(예비 신혼부부)',emoji:'💌',label:'결혼 준비 중 (예비 신혼부부)',bc:'#c7d2fe'},
    {value:'다자녀 가구(2명 이상)',emoji:'👨‍👩‍👧‍👦',label:'다자녀 가구 (2명 이상)',bc:'#a5f3fc'},
    {value:'한부모 가정',emoji:'👤',label:'한부모 가정',bc:'#99f6e4'},
  ]},
  {label:'기타 상황',items:[
    {value:'장애인 가구',emoji:'♿',label:'장애인 가구',bc:'#ddd6fe'},
    {value:'국가유공자/보훈 대상',emoji:'🎖️',label:'국가유공자 / 보훈',bc:'#fef08a'},
    {value:'노인 단독 가구(65세 이상)',emoji:'👴',label:'노인 단독 가구',bc:'#d1d5db'},
  ]},
];
const LOADING_STEPS=[
  "복지로·정부24 전국 복지 데이터 검토 중",
  "고용노동부·국민건강보험 혜택 매칭 중",
  "지자체 특화 지원사업 검색 중",
  "은행·금융기관 특별 상품 확인 중",
  "기업·협회·공공기관 숨겨진 혜택 발굴 중",
  "나이·소득·상황별 조건 정밀 매칭 중",
  "신청 가능한 실시간 진행 프로그램 확인 중",
  "최종 맞춤 혜택 목록 구성 중",
];
const CAT_COLOR={'주거':'#dbeafe','의료':'#fee2e2','금융':'#fef9c3','교육':'#dcfce7','고용':'#ede9fe','보육':'#fce7f3','노인':'#e0f2fe','장애':'#ecfccb','청년':'#ede9fe','기타':'#f3f4f6'};
const MONTH_KR=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const DAY_KR=['일','월','화','수','목','금','토'];

// ─── 브랜드 로고 SVG 컴포넌트 ──────────────────────────────────────
function BrandLogo({size=44, style={}}){
  // 런처 아이콘(512px)의 큐브 좌표를 44px로 스케일 (×0.08594)
  // 배경 + 여백 + 큐브 비율이 핸드폰 설치 아이콘과 동일
  return(
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 44 44" fill="none" style={style}>
      {/* 어두운 배경 — 런처 아이콘과 동일 */}
      <rect width="44" height="44" rx="8" fill="#ffffff"/>
      {/* 윗면 */}
      <polygon points="22,9 36,16 22,22 8,16" fill="#5fd45a"/>
      {/* 오른쪽 면 */}
      <polygon points="36,16 36,30 22,36 22,22" fill="#2a8f2a"/>
      {/* 왼쪽 면 */}
      <polygon points="8,16 22,22 22,36 8,30" fill="#3db83d"/>
      {/* 모서리 선 */}
      <polyline points="22,9 36,16 36,30 22,36 8,30 8,16 22,9" stroke="#1e6b1e" strokeWidth="1" strokeLinejoin="round" fill="none"/>
      <line x1="22" y1="22" x2="22" y2="36" stroke="#1e6b1e" strokeWidth="1"/>
      <line x1="22" y1="22" x2="36" y2="16" stroke="#1e6b1e" strokeWidth="1"/>
      <line x1="22" y1="22" x2="8"  y2="16" stroke="#1e6b1e" strokeWidth="1"/>
    </svg>
  );
}

// ─── localStorage 스토리지 헬퍼 (배포용) ─────────────────────────
function sGet(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}}
function sSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
function sList(prefix){try{return Object.keys(localStorage).filter(k=>k.startsWith(prefix));}catch{return[];}}
function sDel(k){try{localStorage.removeItem(k);}catch{}}

// ─── API 호출 ─────────────────────────────────────────────────────
// 로컬 개발: Vite 프록시(/api/claude) 경유 → CORS 문제 없음
// 배포(Vercel 등): 브라우저에서 직접 Anthropic API 호출
const IS_DEV = import.meta.env.DEV;
const API_URL = IS_DEV ? '/api/claude' : 'https://api.anthropic.com/v1/messages';
const WELFARE_BASE = IS_DEV ? '/api/welfare' : `${import.meta.env.VITE_API_BASE || ''}/api/welfare`;
const GOV24_BASE   = IS_DEV ? '/api/gov24'   : `${import.meta.env.VITE_API_BASE || ''}/api/gov24`;
const GG_BASE      = IS_DEV ? '/api/gg'           : `${import.meta.env.VITE_API_BASE || ''}/api/gg`;
const SEOUL_BASE   = IS_DEV ? '/api/seoul'        : `${import.meta.env.VITE_API_BASE || ''}/api/seoul`;
const YOUTH_BASE         = IS_DEV ? '/api/youth-policy'  : `${import.meta.env.VITE_API_BASE || ''}/api/youth-policy`;
const YOUTH_CONTENT_BASE = IS_DEV ? '/api/youth-content' : `${import.meta.env.VITE_API_BASE || ''}/api/youth-content`;

async function fetchBokjiroData({age, extras}) {
  try {
    const params = new URLSearchParams({ age: String(age), numOfRows: '100' });
    if (extras && extras.length) params.set('extras', extras.join(','));
    const resp = await fetch(`${WELFARE_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.benefits || [];
  } catch {
    return [];
  }
}

async function fetchGov24Data({age, extras, job, income}) {
  try {
    const params = new URLSearchParams({ age: String(age) });
    if (extras && extras.length) params.set('extras', extras.join(','));
    if (job)    params.set('job', job);
    if (income) params.set('income', income);
    const resp = await fetch(`${GOV24_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.benefits || [];
  } catch {
    return [];
  }
}

async function fetchSeoulData({age, address, extras}) {
  try {
    const params = new URLSearchParams({ age: String(age), address });
    if (extras && extras.length) params.set('extras', extras.join(','));
    const resp = await fetch(`${SEOUL_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.benefits || [];
  } catch {
    return [];
  }
}

async function fetchGGData({address, extras}) {
  try {
    const params = new URLSearchParams({ address });
    if (extras && extras.length) params.set('extras', extras.join(','));
    const resp = await fetch(`${GG_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.benefits || [];
  } catch {
    return [];
  }
}

async function fetchYouthPolicyData({age, extras, address}) {
  try {
    const params = new URLSearchParams({ age: String(age), address });
    if (extras && extras.length) params.set('extras', extras.join(','));
    const resp = await fetch(`${YOUTH_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.benefits || [];
  } catch {
    return [];
  }
}

async function fetchYouthContentData({age, extras, address}) {
  try {
    const params = new URLSearchParams({ age: String(age), address });
    if (extras && extras.length) params.set('extras', extras.join(','));
    const resp = await fetch(`${YOUTH_CONTENT_BASE}?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.contents || [];
  } catch {
    return [];
  }
}

async function callClaude(prompt, maxTokens = 4000) {
  if (!API_KEY) {
    throw new Error('API 키가 설정되지 않았습니다. .env 파일에 VITE_ANTHROPIC_KEY=sk-ant-... 를 추가하세요.');
  }

  const sanitizedKey = API_KEY.replace(/[^\x20-\x7E]/g, '').trim();
  if (!sanitizedKey || !sanitizedKey.startsWith('sk-')) {
    throw new Error('API 키 형식이 올바르지 않습니다. sk-ant-... 형태여야 합니다.');
  }

  // 로컬 dev: 프록시 서버가 x-api-key 주입 → 브라우저에서 보낼 필요 없음
  // 배포: 브라우저에서 직접 x-api-key 전송
  const headers = {
    'Content-Type': 'application/json',
    ...(!IS_DEV && {
      'x-api-key': sanitizedKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (fetchErr) {
    if (fetchErr.message?.includes('ISO-8859-1')) {
      throw new Error('.env 파일의 VITE_ANTHROPIC_KEY 값에 이상한 문자가 포함되어 있습니다. 키를 다시 복사해서 붙여넣으세요.');
    }
    throw new Error(`네트워크 오류: ${fetchErr.message}`);
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = data.content.map(i => i.text || '').join('');
  return text.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
}

// ─── JSON 복구 헬퍼 (응답이 잘렸을 때 최대한 살림) ──────────────
function repairJSON(raw) {
  // 1) 정상 파싱 시도
  try { return JSON.parse(raw); } catch {}

  // 2) 마크다운 코드블록 제거 후 재시도
  const cleaned = raw.trim()
    .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/i,'').trim();
  try { return JSON.parse(cleaned); } catch {}

  // 3) 마지막 완전한 benefit 객체까지만 잘라서 JSON 닫기
  let idx = cleaned.length;
  while (idx > 0) {
    idx = cleaned.lastIndexOf('}', idx - 1);
    if (idx === -1) break;
    const slice = cleaned.slice(0, idx + 1);
    // 여러 닫기 패턴 시도
    for (const suffix of [']}', ']}}',' ]}', '  ]}']) {
      try { return JSON.parse(slice + suffix); } catch {}
    }
  }

  throw new Error('응답이 너무 길어 JSON을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.');
}

// ─── 날짜 헬퍼 ────────────────────────────────────────────────────
function parseDeadline(str){if(!str||str==='수시 신청'||str==='수시')return null;const m=str.match(/(\d{4})[.\-년\s]+(\d{1,2})[.\-월\s]+(\d{1,2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);const m2=str.match(/(\d{1,2})[.\-월\s]+(\d{1,2})/);if(m2){const now=new Date();return new Date(now.getFullYear(),+m2[1]-1,+m2[2]);}return null;}
function formatDate(d){if(!d)return null;return`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;}
function daysLeft(d){if(!d)return null;return Math.ceil((d-new Date())/(1000*60*60*24));}

// ─── 캘린더 유틸 ──────────────────────────────────────────────────
function makeICS(b){const dl=parseDeadline(b.deadline);if(!dl)return null;const remind=new Date(dl);remind.setDate(remind.getDate()-7);const fmt=d=>d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';const docs=(b.requiredDocuments||[]).join(', ');return`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//네모혜//KR\r\nBEGIN:VEVENT\r\nUID:nemohye-${b.id||Date.now()}\r\nDTSTART:${fmt(remind)}\r\nDTEND:${fmt(remind)}\r\nSUMMARY:[네모혜] ${b.title||b.action} 마감 D-7\r\nDESCRIPTION:마감: ${formatDate(dl)}\\n서류: ${docs}\r\nURL:${b.applyUrl||'https://www.bokjiro.go.kr'}\r\nBEGIN:VALARM\r\nTRIGGER:-P7D\r\nACTION:DISPLAY\r\nDESCRIPTION:${b.title||b.action} 마감 D-7\r\nEND:VALARM\r\nBEGIN:VALARM\r\nTRIGGER:-P1D\r\nACTION:DISPLAY\r\nDESCRIPTION:${b.title||b.action} 마감 내일!\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR`;}
function openGoogleCalendar(b){const dl=parseDeadline(b.deadline);if(!dl)return;const title=encodeURIComponent(`[네모혜] ${b.title||b.action} 신청 마감`);const desc=encodeURIComponent(`필요서류: ${(b.requiredDocuments||[]).join(', ')}\n기관: ${b.institution||b.vendor||''}`);const gStart=dl.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${gStart}/${gStart}`,'_blank');}
function downloadICS(b){const ics=makeICS(b);if(!ics)return;const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`nemohye_${(b.title||b.action||'event').replace(/\s/g,'_')}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function requestNotifPermission(){if(!('Notification'in window))return'unsupported';if(Notification.permission==='granted')return'granted';return await Notification.requestPermission();}

// ─── 카카오 / 클립보드 ────────────────────────────────────────────
function copyToClip(text,toastMsg){if(navigator.clipboard){navigator.clipboard.writeText(text).then(()=>showToast(toastMsg));}else{const el=document.createElement('textarea');el.value=text;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);showToast(toastMsg);}}
function sendKakaoMe(b){const dl=parseDeadline(b.deadline);const docs=(b.requiredDocuments||[]).join(', ')||'없음';const plain=`[네모혜] 📌 ${b.title||b.action}\n📅 마감: ${dl?formatDate(dl):'수시 신청'}\n💰 지원: ${b.amount||'-'}\n📂 서류: ${docs}\n👉 ${b.applyUrl||'https://www.bokjiro.go.kr'}`;copyToClip(plain,'내용이 복사됐어요! 카카오톡 > 나에게 보내기에 붙여넣기 하세요.');}
function buildKakaoText(items){const lines=['[네모혜] 혜택·일정 마감 알림 📋\n'];items.forEach((b,i)=>{const dl=parseDeadline(b.deadline);lines.push(`${i+1}. ${b.categoryIcon||b.icon||'📌'} ${b.title||b.action}`);lines.push(`   마감: ${dl?formatDate(dl):'수시'}`);lines.push(`   서류: ${(b.requiredDocuments||b.documents||[]).slice(0,2).join(', ')||'기관 문의'}`);if(i<items.length-1)lines.push('');});return lines.join('\n');}

let toastTimer=null;
function showToast(msg){let el=document.getElementById('nemo-toast');if(!el){el=document.createElement('div');el.id='nemo-toast';el.style.cssText='position:fixed;bottom:calc(76px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%) translateY(8px);background:#1E293B;color:#fff;padding:12px 20px;border-radius:12px;font-size:13.5px;font-family:inherit;z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,0.28);max-width:320px;text-align:center;line-height:1.5;transition:opacity 0.25s,transform 0.25s;pointer-events:none;opacity:0;';document.body.appendChild(el);}el.textContent=msg;el.style.opacity='1';el.style.transform='translateX(-50%) translateY(0)';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(-50%) translateY(8px)';},3200);}

// ─── 주소 자동완성 ────────────────────────────────────────────────
function buildSugg(q){if(!q)return[];const out=[];for(const[sido,guguns]of Object.entries(REGIONS)){guguns.forEach(gu=>{const full=`${sido} ${gu}`;if(sido.startsWith(q)||full.startsWith(q)||full.includes(q)||gu.startsWith(q))out.push({full,sido});});}out.sort((a,b)=>(a.full.startsWith(q)?0:1)-(b.full.startsWith(q)?0:1)||a.full.localeCompare(b.full,'ko'));return out.slice(0,8);}
function AddrInput({value,onChange,paddingLeft}){const[sugg,setSugg]=useState([]);const[ai,setAi]=useState(-1);const[open,setOpen]=useState(false);const ref=useRef();useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);const onInput=v=>{onChange(v);const s=buildSugg(v.trim());setSugg(s);setOpen(s.length>0);setAi(-1);};const pick=s=>{onChange(s.full);setOpen(false);setSugg([]);};const hi=(t,q)=>{const i=t.indexOf(q);if(i<0)return t;return<>{t.slice(0,i)}<strong style={{color:'#1a6b6b'}}>{t.slice(i,i+q.length)}</strong>{t.slice(i+q.length)}</>;};const inputStyle=paddingLeft?{...IS,paddingLeft}:IS;return(<div ref={ref} style={{position:'relative'}}><input value={value} onChange={e=>onInput(e.target.value)} placeholder="예: 서울특별시 마포구" autoComplete="off" style={inputStyle} onFocus={()=>{if(sugg.length)setOpen(true);}} onKeyDown={e=>{if(!open)return;if(e.key==='ArrowDown'){e.preventDefault();setAi(i=>Math.min(i+1,sugg.length-1));}else if(e.key==='ArrowUp'){e.preventDefault();setAi(i=>Math.max(i-1,0));}else if(e.key==='Enter'&&ai>=0){e.preventDefault();pick(sugg[ai]);}else if(e.key==='Escape')setOpen(false);}}/>{open&&sugg.length>0&&(<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1.5px solid #1a6b6b',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:500,overflow:'hidden',maxHeight:220,overflowY:'auto'}}>{sugg.map((s,i)=>(<div key={s.full} onMouseDown={()=>pick(s)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0ebe0',background:i===ai?'#edf6f6':'#fff',fontSize:14}}><div style={{fontWeight:600}}>{hi(s.full,value.trim())}</div><div style={{fontSize:12,color:'#6b6560'}}>{s.sido}</div></div>))}</div>)}{!paddingLeft&&<p style={{fontSize:12,color:'#9ca3af',marginTop:3}}>시/도와 시/군/구까지 입력하면 자동완성됩니다</p>}</div>);}

// ─── 디자인 토큰 ──────────────────────────────────────────────────
const C={
  bg:'#F0FDF4',          // 앱 배경 (연한 그린)
  surface:'#FFFFFF',     // 카드 배경
  dark:'#14532D',        // 헤더·진한 그린
  primary:'#16A34A',     // 메인 그린
  grad:'linear-gradient(160deg,#22C55E 0%,#16A34A 45%,#14532D 100%)', // 히어로 그라디언트
  gold:'#D4A843',        // 골드 액센트 (로고 전용)
  teal:'#16A34A',        // 틸 → 그린으로 교체
  text1:'#0F172A',       // 본문
  text2:'#64748B',       // 서브텍스트
  text3:'#94A3B8',       // 힌트
  border:'#D1FAE5',      // 테두리 (그린 계열)
  err:'#DC2626',
  ok:'#16A34A',
};

// ─── 공통 스타일 상수 ─────────────────────────────────────────────
const IS={
  width:'100%',background:C.surface,border:`1.5px solid ${C.border}`,
  borderRadius:12,padding:'13px 16px',fontSize:15.4,fontFamily:'inherit',
  color:C.text1,outline:'none',boxSizing:'border-box',
  transition:'border-color 0.15s',
};
const SS={
  ...IS,appearance:'none',WebkitAppearance:'none',cursor:'pointer',
  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat:'no-repeat',backgroundPosition:'right 14px center',paddingRight:44,
};
const LS={fontSize:12,fontWeight:700,color:C.text2,letterSpacing:'0.6px',textTransform:'uppercase',display:'block',marginBottom:8};
const BP=(x={})=>({
  background:`linear-gradient(135deg,${C.primary} 0%,${C.dark} 100%)`,
  color:'#fff',border:'none',borderRadius:12,padding:'14px 22px',
  fontSize:15.4,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
  boxShadow:`0 4px 18px rgba(22,163,74,0.30)`,
  transition:'transform 0.12s,box-shadow 0.12s',
  ...x,
});
const CS={
  background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:'24px',
  boxShadow:'0 1px 3px rgba(15,23,42,0.04),0 8px 28px rgba(15,23,42,0.07)',
};
function Logo({size=38}){return(<svg width={size} height={size} viewBox="0 0 44 44" fill="none"><rect width="44" height="44" rx="8" fill="#ffffff"/><polygon points="22,9 36,16 22,22 8,16" fill="#5fd45a"/><polygon points="36,16 36,30 22,36 22,22" fill="#2a8f2a"/><polygon points="8,16 22,22 22,36 8,30" fill="#3db83d"/><polyline points="22,9 36,16 36,30 22,36 8,30 8,16 22,9" stroke="#1e6b1e" strokeWidth="1" strokeLinejoin="round" fill="none"/><line x1="22" y1="22" x2="22" y2="36" stroke="#1e6b1e" strokeWidth="1"/><line x1="22" y1="22" x2="36" y2="16" stroke="#1e6b1e" strokeWidth="1"/><line x1="22" y1="22" x2="8" y2="16" stroke="#1e6b1e" strokeWidth="1"/></svg>);}
const R=()=><span style={{color:C.err,marginLeft:2}}>*</span>;
function Divider({label}){return(<div style={{display:'flex',alignItems:'center',gap:10,margin:'22px 0 14px'}}><div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:2,whiteSpace:'nowrap'}}>{label}</span><div style={{flex:1,height:1,background:C.border}}/></div>);}

// ─── getBestApplyUrl: 혜택명/기관 키워드 → 실제 신청 페이지 URL ───
// 키워드 배열 중 하나라도 title/institution에 포함되면 해당 URL로 이동
const KNOWN_BENEFIT_URLS = [
  // ── 국세청 / 세금 ──
  {kw:['근로장려금','EITC'],url:'https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=WME3000'},
  {kw:['자녀장려금'],url:'https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=WME3000'},
  {kw:['종합소득세 환급','환급금 조회'],url:'https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=WME1400'},
  // ── 고용노동부 / 실업급여 / 취업 ──
  {kw:['실업급여','구직급여'],url:'https://ei.work24.go.kr/ei/eih/cp/cc/ccEminsrFollow/retrieveCc200Info.do'},
  {kw:['국민취업지원제도','취업지원제도','국민취업'],url:'https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do'},
  {kw:['청년일자리도약장려금','일자리도약'],url:'https://www.work.go.kr/youthjob/intro/yngJumpIntro.do'},
  {kw:['청년내일채움공제','내일채움공제'],url:'https://www.work.go.kr/youngtomorrow/index.do'},
  {kw:['육아휴직','출산전후휴가','배우자 출산휴가'],url:'https://www.moel.go.kr/policy/policyinfo/child/list7.do'},
  {kw:['고용보험 환급','직업능력개발 환급'],url:'https://www.hrd.go.kr/hrdp/ma/pmmao/indexNew.do'},
  // ── 복지로 (복지급여) ──
  {kw:['기초생활','생계급여','의료급여','주거급여','교육급여'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do'},
  {kw:['에너지바우처'],url:'https://www.energyv.or.kr/user/cstmrRqstPage.do'},
  {kw:['문화누리카드','문화바우처'],url:'https://www.mnuri.kr/mnuri/index.do'},
  {kw:['청소년 증'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do'},
  {kw:['장애인 활동지원','장애인활동'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do'},
  {kw:['돌봄서비스','노인돌봄'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do'},
  {kw:['아이돌봄','아이 돌봄'],url:'https://idolbom.go.kr/front/main/main.do'},
  {kw:['사회서비스 이용권','사회서비스바우처'],url:'https://www.socialservice.or.kr/user/main.do'},
  // ── 국민건강보험 ──
  {kw:['건강검진'],url:'https://www.nhis.or.kr/nhis/healthin/wbhaze01100m01.do'},
  {kw:['임신','출산 진료비','국민행복카드'],url:'https://www.nhis.or.kr/nhis/policy/wbhada04000m01.do'},
  {kw:['본인부담 상한제','본인부담금 환급'],url:'https://www.nhis.or.kr/nhis/policy/wbhada07300m01.do'},
  {kw:['노인 장기요양','장기요양'],url:'https://www.longtermcare.or.kr/npbs/e/b/101/npeb101m01.web'},
  // ── 국민연금 ──
  {kw:['국민연금 반환일시금','반환일시금'],url:'https://www.nps.or.kr/jsppage/service/apply/apply.jsp'},
  {kw:['국민연금 크레딧','출산 크레딧','군복무 크레딧'],url:'https://www.nps.or.kr/jsppage/info/easy/easy_04_01.jsp'},
  // ── 대중교통 K-패스 ──
  {kw:['k-패스','k패스','케이패스','대중교통 k','kpass'],url:'https://korea-pass.kr/info/card_guide.do'},
  // ── 주거 (서울 월세 — LH보다 먼저 매칭해야 함) ──
  {kw:['서울 청년 월세','서울청년 월세','청년 월세 지원','청년 월세 지원사업','신혼부부 월세','신혼 월세 지원'],url:'https://housing.seoul.go.kr/site/main/content/sh01_060513'},
  // ── 주거 (LH / HF / 주택도시기금) ──
  {kw:['청년월세','청년 월세'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['행복주택'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['전세임대','매입임대'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['버팀목 전세자금','버팀목전세'],url:'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp'},
  {kw:['디딤돌 대출','디딤돌대출'],url:'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp'},
  {kw:['주거급여'],url:'https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcList.do'},
  // ── 청년 특화 ──
  // 청년희망적금 — 상품 종료로 제거
  {kw:['청년저축계좌','내일저축계좌'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do'},
  {kw:['청년 정책','청년 지원','온통청년'],url:'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do'},
  {kw:['대학생 학자금','학자금 대출','한국장학재단'],url:'https://www.kosaf.go.kr/ko/loan.do?pg=loan01_01'},
  {kw:['국가장학금'],url:'https://www.kosaf.go.kr/ko/scholarship.do?pg=scholarship01_01_01'},
  // ── 소상공인 / 자영업 ──
  {kw:['소상공인 지원','소상공인 대출','소상공인시장진흥공단'],url:'https://www.sbiz.or.kr/sup/main.do'},
  {kw:['자영업자 고용보험'],url:'https://www.work.go.kr/empSpt/doEmpSptInfo.do'},
  // ── 산재 / 보상 ──
  {kw:['산재보험','산업재해','요양급여'],url:'https://www.kcomwel.or.kr/kcomwel/paym/acci/acci.jsp'},
  // ── 정부24 통합 ──
  {kw:['정부24'],url:'https://www.gov.kr/portal/serviceList'},
  // ── 소상공인 정책자금 / 대출 (ols.semas.or.kr) ──
  {kw:['소상공인 정책자금','정책자금 대출','소상공인 직접대출'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  {kw:['소상공인 대환대출','대환대출'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  {kw:['소공인특화자금','소공인 특화'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  {kw:['상생성장지원자금','상생성장 자금'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  {kw:['소상공인 대리대출','대리대출 정책자금'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  {kw:['혁신성장촉진자금'],url:'https://ols.semas.or.kr/ols/man/SMAN010M/page.do'},
  // ── 소상공인 온라인 교육 (edu.sbiz.or.kr) ──
  {kw:['소상공인 온라인 교육','소상공인 무료 교육','지식배움터','소상공인 교육','법정의무교육 소상공인'],url:'https://edu.sbiz.or.kr/edu/main/main.do'},
  {kw:['소상공인 식품위생교육','소방안전교육 소상공인'],url:'https://edu.sbiz.or.kr/edu/main/main.do'},
  // ── 소상공인 경영안정 바우처 (voucher.sbiz24.kr) ──
  {kw:['소상공인 경영안정 바우처','경영안정 바우처','소상공인 바우처'],url:'https://voucher.sbiz24.kr/'},
  // ── 소상공인 창업 지원 (sbiz24.kr) ──
  {kw:['소상공인 창업 지원금','소상공인 창업 혜택','소상공인24 창업','창업 지원 소상공인'],url:'https://www.sbiz24.kr/#/pbanc?rcrtTypeCd=FN'},
  {kw:['소상공인24','sbiz24'],url:'https://www.sbiz24.kr/'},
  // ── 서울복지포털 (wis.seoul.go.kr) ──
  {kw:['서울형 복지급여','서울 복지급여'],url:'https://wis.seoul.go.kr/main.do'},
  {kw:['서울 작은결혼식','서울시 결혼 지원','공정결혼','서울시 결혼','작은결혼'],url:'https://wis.seoul.go.kr/main.do'},
  {kw:['서울커리업','중장년 경력설계'],url:'https://wis.seoul.go.kr/main.do'},
  {kw:['돌봄SOS','돌봄 SOS'],url:'https://wis.seoul.go.kr/main.do'},
  {kw:['가족돌봄청년','청년 돌봄'],url:'https://wis.seoul.go.kr/main.do'},
  {kw:['신중년사회공헌','신중년 사회공헌'],url:'https://wis.seoul.go.kr/main.do'},
  // ── 서울청년몽땅정보통 (youth.seoul.go.kr) — 금융/복지 ──
  {kw:['서울 청년수당','서울청년수당','청년 수당'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=V202600005'},
  {kw:['희망두배 청년통장','희망두배청년통장'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?sprtInfoId=&plcyBizId=20250519005400210852&key=2309150002'},
  {kw:['서울 청년 마음건강','청년 마음건강 지원','청년마음건강'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=20250519005400210855'},
  {kw:['은둔청년','고립청년','청년 고립'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=R2023050912524'},
  // ── 서울청년몽땅정보통 — 주거 ──
  {kw:['청년 임차보증금 이자','청년 전세자금 이자'],url:'https://youth.seoul.go.kr/content.do?key=2310100047'},
  {kw:['청년 중개보수','청년 이사비','부동산 중개보수 이사비'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=R2024040321345'},
  // ── 서울청년몽땅정보통 — 일자리/취업 ──
  {kw:['미래 청년 일자리','점프업 청년'],url:'https://youth.seoul.go.kr/youthConts.do?key=2310100011'},
  {kw:['서울형 청년인턴','청년 직무캠프'],url:'https://youth.seoul.go.kr/content.do?key=2310100012'},
  {kw:['청년취업사관학교','새싹 SeSAC','SeSAC'],url:'https://sesac.seoul.kr/'},
  {kw:['서울 청년 예비 인턴'],url:'https://youth.seoul.go.kr/youthConts.do?key=2404040001'},
  {kw:['서울 매력일자리'],url:'https://youth.seoul.go.kr/api/jobNewDealBiz/list.do?key=2309240002'},
  {kw:['미취업 청년 자격증','청년 자격증 응시료','자격증 응시료 지원'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=R2024041821928'},
  // ── 서울청년몽땅정보통 — 창업 ──
  {kw:['서울 청년 창업지원시설','청년 창업 공간'],url:'https://youth.seoul.go.kr/content.do?key=2310100024'},
  {kw:['지역연계형 청년창업','청년 창업 지원'],url:'https://youth.seoul.go.kr/content.do?key=2310100026'},
  {kw:['청년쿡 비즈니스','청년 쿡 비즈니스'],url:'https://youth.seoul.go.kr/content.do?key=2310100028'},
  // ── 서울청년몽땅정보통 — 문화 ──
  {kw:['서울청년문화패스','청년 문화패스','청년 문화 바우처'],url:'https://www.youthcultureseoul.kr/'},
  // ── 서울 탄생육아 몽땅정보통 (umppa.seoul.go.kr) ──
  {kw:['임산부 교통비','임산부교통비'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=34B5EA8BEB354E2DB26136CFE52AEFF2'},
  {kw:['난자동결'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=DEC40D648D8647CABC7A5D7279EFCFB6'},
  {kw:['한의약 난임','난임 치료'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do'},
  {kw:['정난관 복원','난관 복원'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do'},
  {kw:['35세 이상 임산부','고령 임산부 의료비'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=BB80BABF442E40D3BF59EBA63F4DF1D7'},
  {kw:['엄마 북돋움','북돋움'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=4ECE63A5582C4749A34BF4867436AAB1'},
  {kw:['서울형 산후조리','산후조리경비'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=58D83411277E40D1BFF6255A10CBCDD5'},
  {kw:['서울엄마아빠택시','엄마아빠택시'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=3EF7489ACF614F939FEF8514308797D2'},
  {kw:['자영업자 임산부 출산급여','1인 자영업자 출산급여'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=16A62AE6CE142993E063A6022162A5D2'},
  {kw:['자영업자 배우자 출산휴가','1인 자영업자 배우자'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=CED87B1387034FF8B72CFF94402F9F87'},
  {kw:['자녀출산 무주택','출산 무주택 주거비'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=197DA8F773AAE8DCE063A6022162FF67'},
  {kw:['서울형 손주돌봄','손주돌봄수당'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=59F45FE9BC024848AD07143C962E6869'},
  {kw:['서울형 가사서비스','가사서비스 지원'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=9F04398B4B3648348729DB5796A4DC39'},
  {kw:['둘째 출산 첫째 돌봄','둘째 출산시 첫째'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=062A1CE5D5848B7EE063A602216299A4'},
  {kw:['소상공인 민간 아이돌봄','소상공인 아이돌봄'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=E9FF6E0FEFF74EBCA2E954130EAA7C74'},
  {kw:['서울아기 건강 첫걸음','건강 첫걸음'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do'},
  {kw:['유축기 대여'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do'},
  {kw:['서울키즈 오케이존','키즈 오케이존'],url:'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=99341E4FE02244FFA897EF1BF7678DD1'},
  // ── 수동 링크 수정 (오류 제보 대응) ──
  {kw:['임차보증금','임차 보증금','청년 임차'],url:'https://youth.seoul.go.kr/youthConts.do?key=2310100007'},
  {kw:['긴급복지 의료지원','긴급복지 의료'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveWlfareInfoDetlView.do?wlfareInfoId=WLF00000053'},
  {kw:['긴급복지 생계지원','긴급복지 생계'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveWlfareInfoDetlView.do?wlfareInfoId=WLF00000052'},
  {kw:['에너지 바우처','에너지바우처'],url:'https://www.energyv.or.kr/'},
  {kw:['통신요금 감면','통신비 지원','휴대폰 요금 감면'],url:'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveWlfareInfoDetlView.do?wlfareInfoId=WLF00000061'},
];
const APPLY_DOMAIN_MAP = {
  'bokjiro.go.kr':'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do',
  'gov.kr':'https://www.gov.kr/portal/serviceList',
  'work.go.kr':'https://www.work.go.kr/benefitService/doReceivingBenefit.do',
  'nhuf.molit.go.kr':'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp',
  'youthcenter.go.kr':'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do',
  'youth.go.kr':'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do',
  'nhis.or.kr':'https://www.nhis.or.kr/nhis/policy/wbhada02800m01.do',
  'nps.or.kr':'https://www.nps.or.kr/jsppage/service/apply/apply.jsp',
  'kcomwel.or.kr':'https://www.kcomwel.or.kr/kcomwel/paym/acci/acci.jsp',
  'hf.go.kr':'https://www.hf.go.kr/hf/sub04/sub04_01_01.do',
  'lh.or.kr':'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do',
  'apply.lh.or.kr':'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do',
  'sbcrc.or.kr':'https://www.semas.or.kr/',
  'kosaf.go.kr':'https://www.kosaf.go.kr/ko/loan.do?pg=loan01_01',
  'hometax.go.kr':'https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=WME3000',
  'kinfa.or.kr':'https://kinfa.or.kr/',
  'energyv.or.kr':'https://www.energyv.or.kr/user/cstmrRqstPage.do',
  'mnuri.kr':'https://www.mnuri.kr/mnuri/index.do',
  'longtermcare.or.kr':'https://www.longtermcare.or.kr/npbs/e/b/101/npeb101m01.web',
  'idolbom.go.kr':'https://idolbom.go.kr/front/main/main.do',
  'socialservice.or.kr':'https://www.socialservice.or.kr/user/main.do',
  'sbiz.or.kr':'https://www.sbiz.or.kr/sup/main.do',
  'wis.seoul.go.kr':'https://wis.seoul.go.kr/main.do',
  'welfare.seoul.kr':'https://wis.seoul.go.kr/main.do',
  'umppa.seoul.go.kr':'https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do',
  'youth.seoul.go.kr':'https://youth.seoul.go.kr/mainB.do',
  'sesac.seoul.kr':'https://sesac.seoul.kr/',
  'youthcultureseoul.kr':'https://www.youthcultureseoul.kr/',
  'smyc.kr':'https://www.smyc.kr/',
  'ols.semas.or.kr':'https://ols.semas.or.kr/ols/man/SMAN010M/page.do',
  'semas.or.kr':'https://ols.semas.or.kr/ols/man/SMAN010M/page.do',
  'edu.sbiz.or.kr':'https://edu.sbiz.or.kr/edu/main/main.do',
  'voucher.sbiz24.kr':'https://voucher.sbiz24.kr/',
  'sbiz24.kr':'https://www.sbiz24.kr/#/pbanc?rcrtTypeCd=FN',
  'www.sbiz24.kr':'https://www.sbiz24.kr/#/pbanc?rcrtTypeCd=FN',
  'ydpcf.or.kr':'https://www.ydpcf.or.kr/festival/festival.do',
  'www.ydpcf.or.kr':'https://www.ydpcf.or.kr/festival/festival.do',
  'giff.flower.or.kr':'https://giff.flower.or.kr/main/',
  'flower.or.kr':'https://giff.flower.or.kr/main/',
};
function getBestApplyUrl(url, title='', institution=''){
  const haystack=(title+' '+institution).toLowerCase();
  // 1) 키워드 매핑 우선
  for(const{kw,url:dest}of KNOWN_BENEFIT_URLS){
    if(kw.some(k=>haystack.includes(k.toLowerCase())))return dest;
  }
  
  // 2) 일반 도메인(메인 페이지)인 경우 검색 페이지 유도
  const GENERIC_DOMAINS = ['gov.kr', 'bokjiro.go.kr', 'youthcenter.go.kr', 'youth.go.kr', 'seoul.go.kr'];
  try {
    if (url) {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      if (GENERIC_DOMAINS.some(d => host === d || host.endsWith('.' + d)) && (parsed.pathname === '/' || parsed.pathname === '')) {
        return `https://www.gov.kr/portal/main?srchField=1&searchWrd=${encodeURIComponent(title)}`;
      }
    }
  } catch(e) {}

  if(!url)return`https://www.gov.kr/portal/main?srchField=1&searchWrd=${encodeURIComponent(title)}`;
  
  try{
    const parsed=new URL(url);
    const host=parsed.hostname.replace(/^www\./,'');
    // 3) 이미 서브페이지면 그대로
    if(parsed.pathname&&parsed.pathname!=='/'&&parsed.pathname.length>1)return url;
    // 4) 도메인 매핑
    for(const[domain,dest]of Object.entries(APPLY_DOMAIN_MAP)){
      if(host===domain||host.endsWith('.'+domain))return dest;
    }
  }catch{}
  return url || `https://www.gov.kr/portal/main?srchField=1&searchWrd=${encodeURIComponent(title)}`;
}

// ─── 청년미래적금 (출시 예정 고정 혜택) ──────────────────────────────
const YOUTH_HOUSING_DREAM_BANKS = [
  { id:'woori', name:'우리은행', short:'WOORI', bg:'#1f6feb', fg:'#ffffff', url:'https://www.wooribank.com/', phone:'1599-0800' },
  { id:'kb', name:'KB국민은행', short:'KB', bg:'#ffcc00', fg:'#111827', url:'https://obank.kbstar.com/', phone:'1599-1771' },
  { id:'ibk', name:'IBK기업은행', short:'IBK', bg:'#2b6cb0', fg:'#ffffff', url:'https://www.ibk.co.kr/', phone:'1566-2566' },
  { id:'nh', name:'NH농협은행', short:'NH', bg:'#00a86b', fg:'#ffffff', url:'https://banking.nonghyup.com/', phone:'1588-2100' },
  { id:'shinhan', name:'신한은행', short:'SOL', bg:'#1e40af', fg:'#ffffff', url:'https://bank.shinhan.com/', phone:'1599-8000' },
  { id:'hana', name:'하나은행', short:'Hana', bg:'#0f766e', fg:'#ffffff', url:'https://www.kebhana.com/', phone:'1599-1111' },
  { id:'im', name:'iM뱅크', short:'iM', bg:'#60a5fa', fg:'#0f172a', url:'https://www.imbank.co.kr/', phone:'1588-0956' },
  { id:'busan', name:'부산은행', short:'BNK', bg:'#ef4444', fg:'#ffffff', url:'https://www.busanbank.co.kr/', phone:'1800-1333' },
  { id:'kn', name:'경남은행', short:'BNK', bg:'#b91c1c', fg:'#ffffff', url:'https://www.knbank.co.kr/', phone:'1600-8585' },
];

function isYouthHousingDreamBenefit(benefitOrTitle='', institution=''){
  const title = typeof benefitOrTitle === 'object'
    ? `${benefitOrTitle?.title||''} ${benefitOrTitle?.institution||''} ${benefitOrTitle?.applyUrl||''}`
    : `${benefitOrTitle||''} ${institution||''}`;
  return /청년\s*주택드림\s*청약통장/i.test(title);
}

function BankBrandLogo({bank, size=48}){
  return(
    <div style={{width:size,height:size,borderRadius:16,background:bank.bg,color:bank.fg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontWeight:800,fontSize:bank.short.length >= 4 ? 13 : 16,letterSpacing:'0.2px',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px rgba(15,23,42,0.12)'}}>
      {bank.short}
    </div>
  );
}

function YouthHousingDreamBankModal({onClose}){
  return(
    <div style={{position:'fixed',inset:0,zIndex:1100}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}}/>
      <div style={{position:'absolute',bottom:0,left:0,right:0,maxHeight:'88vh',background:'#fff',borderRadius:'28px 28px 0 0',display:'flex',flexDirection:'column'}}>
        <div style={{flexShrink:0,padding:'16px 20px',borderBottom:'1px solid #f3f4f6'}}>
          <div style={{width:36,height:4,borderRadius:2,background:'#d1d5db',margin:'0 auto 14px'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#15803d',background:'#dcfce7',padding:'3px 10px',borderRadius:20}}>주거</span>
                <span style={{fontSize:11,fontWeight:700,color:'#1d4ed8',background:'#dbeafe',padding:'3px 10px',borderRadius:20}}>취급은행 9곳</span>
              </div>
              <h2 style={{fontSize:18,fontWeight:800,color:'#111827',lineHeight:1.3,margin:0}}>청년주택드림 청약통장 신청 은행</h2>
              <p style={{fontSize:13,color:'#6b7280',margin:'6px 0 0'}}>은행을 선택하면 해당 은행 공식 사이트로 이동합니다.</p>
            </div>
            <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:'50%',width:34,height:34,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,fontFamily:'inherit'}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
          <div style={{background:'linear-gradient(135deg,#eff6ff,#f0fdf4)',border:'1px solid #dbeafe',borderRadius:16,padding:'14px 16px',marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:800,color:'#1e3a8a',marginBottom:4}}>공식 취급은행 안내</div>
            <p style={{fontSize:13,color:'#334155',lineHeight:1.65,margin:0}}>주택도시기금 상품안내 기준으로 우리, KB국민, IBK기업, NH농협, 신한, 하나, iM뱅크, 부산, 경남은행에서 가입할 수 있습니다.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:12}}>
            {YOUTH_HOUSING_DREAM_BANKS.map(bank=>(
              <a key={bank.id} href={bank.url} target="_blank" rel="noreferrer" style={{textDecoration:'none',background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:'14px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 8px 24px rgba(15,23,42,0.06)'}}>
                <BankBrandLogo bank={bank}/>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:'#111827'}}>{bank.name}</div>
                  <div style={{fontSize:12,color:'#6b7280',marginTop:3}}>대표번호 {bank.phone}</div>
                  <div style={{fontSize:12,fontWeight:700,color:'#15803d',marginTop:7}}>공식 사이트로 이동 →</div>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div style={{flexShrink:0,padding:'12px 20px',paddingBottom:'calc(12px + env(safe-area-inset-bottom,0px))',borderTop:'1px solid #f3f4f6'}}>
          <button onClick={onClose} style={{width:'100%',padding:'14px',borderRadius:14,background:'#f3f4f6',color:'#374151',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',fontFamily:'inherit'}}>닫기</button>
        </div>
      </div>
    </div>
  );
}

const YOUTH_FUTURE_SAVINGS = {
  id:'youth-future-savings-static',
  source:'금융/은행', sourceIcon:'🏦',
  category:'금융', categoryIcon:'💰',
  scope:'전국', isUrgent:false, isHidden:false, isComingSoon:true,
  title:'청년미래적금',
  institution:'금융위원회 · 서민금융진흥원',
  description:'청년도약계좌의 뒤를 잇는 정부 정책 적금으로 2026년 하반기 출시 예정입니다. 청년이 매월 일정 금액을 납입하면 정부가 기여금을 매칭하고, 이자소득 비과세 혜택을 제공합니다.',
  amount:'월 최대 50만원 납입 · 정부 기여금 매칭 (예정)',
  deadline:'2026년 하반기 출시 예정',
  requiredDocuments:['신분증 (주민등록증 또는 운전면허증)','소득 확인 서류 (건강보험료 납부 확인서 등)','청년 연령 확인 서류 (만 19~34세)','은행 계좌 개설 서류'],
  howToApply:'출시 후 서민금융진흥원 및 참여 은행 앱·영업점에서 신청 예정',
  applyUrl:'https://kinfa.or.kr',
};

// ─── K-패스 (대중교통, 성인 이상 고정 혜택) ──────────────────────────
const KPASS_BENEFIT = {
  id:'kpass-static',
  source:'정부복지', sourceIcon:'🚌',
  category:'생활/교통', categoryIcon:'🚇',
  scope:'전국', isUrgent:false, isHidden:false, isComingSoon:false,
  title:'대중교통 K-패스',
  institution:'국토교통부 · 한국교통안전공단',
  description:'월 15회 이상 대중교통(지하철·버스·GTX 등) 이용 시 교통비를 환급해 주는 국가 대중교통 정기 할인 카드입니다. 일반 성인 20%, 청년(만 19~34세) 30%, 저소득층 53%를 다음 달에 환급합니다.',
  amount:'월 교통비 최대 53% 환급 (일반 20% / 청년 30% / 저소득 53%)',
  deadline:'수시 신청',
  requiredDocuments:[
    '신분증 (주민등록증 또는 운전면허증)',
    'K-패스 제휴 카드 1종 선택 (KB국민·신한·하나·우리·NH농협·BC·삼성·현대 등)',
  ],
  howToApply:'korea-pass.kr에서 제휴 카드 선택 → 카드사 앱 또는 영업점에서 카드 신청 → K-패스 앱 설치 후 카드 등록 → 월 15회 이상 이용 시 다음 달 자동 환급',
  applyUrl:'https://korea-pass.kr/info/card_guide.do',
};

// ─── 국민취업지원제도 (고정 혜택 — AI 생성본 교체용) ───────────────────
const KUKMIN_EMPLOYMENT = {
  id:'kukmin-employment-static',
  source:'고용/취업', sourceIcon:'💼',
  category:'고용', categoryIcon:'💼',
  scope:'전국', isUrgent:false, isHidden:false, isComingSoon:false,
  title:'국민취업지원제도',
  institution:'고용노동부 · 고용센터',
  description:'취업을 원하는 국민에게 1:1 맞춤 상담·직업훈련·일경험 등 통합 취업지원서비스를 제공하는 제도입니다. Ⅰ유형(저소득·청년특례)은 구직촉진수당 월 60만원을 최대 6개월 지급하며, 고용보험 미가입자도 참여할 수 있습니다.\n\n▸ Ⅰ유형 대상: 만 15~69세, 중위소득 60% 이하(청년특례 120% 이하), 재산 4억원 이하\n▸ Ⅱ유형 대상: 청년(만 15~34세), 중장년(중위소득 100% 이하), 특정취약계층 27개 범주\n▸ 취업 성공 시 취업성공수당 최대 150만원(6개월 근속 50만원 + 12개월 근속 100만원) 별도 지급',
  amount:'Ⅰ유형 구직촉진수당 월 60만원 × 최대 6개월 (최대 360만원) · 취업성공수당 최대 150만원',
  deadline:'연중 상시 신청',
  requiredDocuments:[
    '신분증 (주민등록증 또는 운전면허증)',
    '취업지원 신청서 (별지 제1호 서식)',
    '개인정보·고유식별정보 수집·이용·제공 동의서',
    '소득·재산 증빙 서류 (건강보험료 납부확인서, 국세청 소득증빙 등)',
    '가족관계증명서 (해당 시)',
    '고용보험 자격이력 내역서 (해당 시)',
    '취업취약계층 증명 서류 (해당 시)',
  ],
  howToApply:'① work24.go.kr 접속 후 구직등록 → ② 안내 동영상 수강(1·2회차 필수) → ③ 온라인 신청서 작성·제출. 또는 거주지 관할 고용센터 방문 신청. 접수 후 1개월 이내 수급자격 인정 여부 통지. 문의: 고용노동부 ☎1350 / 고용24 ☎1577-7114',
  applyUrl:'https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do',
};

// ─── 이달의 행사·할인: 상시 이벤트 + 월별 축제 ──────────────────────
const PERMANENT_EVENTS=[
  {
    id:'event-culture-wednesday',
    eventType:'culture-day',
    categoryIcon:'🎨', category:'문화/할인',
    badge:'매주 수요일', badgeColor:'#2563eb', badgeBg:'#eff6ff',
    title:'문화가 있는 날',
    institution:'문화체육관광부',
    amount:'영화 7,000원 · 국공립 박물관·미술관 무료/할인',
    scope:'전국',
    museums:[
      {name:'국립중앙박물관',loc:'서울 용산',benefit:'상설전시 무료'},
      {name:'국립현대미술관 서울관',loc:'서울 종로',benefit:'무료'},
      {name:'국립현대미술관 덕수궁관',loc:'서울 중구',benefit:'무료'},
      {name:'국립현대미술관 과천관',loc:'경기 과천',benefit:'무료'},
      {name:'국립민속박물관',loc:'서울 종로',benefit:'무료'},
      {name:'국립고궁박물관',loc:'서울 종로',benefit:'무료'},
      {name:'대한민국역사박물관',loc:'서울 종로',benefit:'무료'},
      {name:'서울역사박물관',loc:'서울 종로',benefit:'무료'},
      {name:'전쟁기념관',loc:'서울 용산',benefit:'상설전시 무료'},
      {name:'서울시립미술관',loc:'서울 중구',benefit:'무료 (야간 포함)'},
      {name:'국립과천과학관',loc:'경기 과천',benefit:'상설전시 50% 할인'},
      {name:'국립해양박물관',loc:'부산 영도',benefit:'무료'},
      {name:'국립대구박물관',loc:'대구 수성',benefit:'무료'},
      {name:'국립광주박물관',loc:'광주 북구',benefit:'무료'},
      {name:'국립경주박물관',loc:'경북 경주',benefit:'무료'},
      {name:'국립제주박물관',loc:'제주 용담',benefit:'무료'},
    ],
    cinemas:[
      {name:'CGV',price:'7,000원',note:'2D 일반관 (IMAX·4DX·ScreenX 등 특별관 제외)'},
      {name:'롯데시네마',price:'7,000원',note:'2D 일반관 (특별관 제외)'},
      {name:'메가박스',price:'7,000원',note:'2D 일반관 (특별관 제외)'},
    ],
    applyUrl:'https://www.culture.go.kr/wday/',
  },
  {
    id:'event-local-performance',
    eventType:'local-performance',
    categoryIcon:'🎭', category:'문화/공연',
    badge:'이달의 행사', badgeColor:'#059669', badgeBg:'#ecfdf5',
    title:'지자체 무료 문화 공연',
    institution:'각 지방자치단체',
    amount:'무료 입장',
    scope:'전국',
    performances:[
      {city:'서울',name:'광화문 광장 열린 공연',desc:'서울시 주최 야외 무료 공연, 주말 및 행사 기간 상시 운영'},
      {city:'서울',name:'서울돈화문국악당 기획공연',desc:'국악 특별 공연, 월 1회 무료 공개 공연 (사전 예약)'},
      {city:'서울',name:'세종문화회관 시민 공연',desc:'클래식·국악 저가 시민 공연, 1만원 이하 다수'},
      {city:'부산',name:'부산시민회관 무료 공연',desc:'매월 시민 대상 무료 음악·공연 프로그램 운영'},
      {city:'대구',name:'대구오페라하우스 공개 리허설',desc:'공개 리허설 무료 관람 (사전 신청)'},
      {city:'광주',name:'국립아시아문화전당(ACC)',desc:'무료 공연·전시 상시 운영, 어린이문화원 무료'},
      {city:'인천',name:'인천문화예술회관',desc:'인천시 기획 무료 공연, 시민 초청 행사'},
      {city:'경기',name:'경기아트센터',desc:'온라인 무료 스트리밍 공연, 현장 저가 공연'},
      {city:'대전',name:'대전문화재단 무료 공연',desc:'으능정이 거리 야외 공연, 대전시민 무료'},
    ],
    applyUrl:'https://www.culture.go.kr/',
  },
];

// 월별 축제·이벤트 (1~12월)
const FESTIVALS_BY_MONTH={
  1:[
    {id:'f1-1',eventType:'festival',categoryIcon:'🐟',category:'축제',title:'화천 산천어 축제',institution:'강원 화천군',amount:'산천어 낚시 체험 포함',scope:'강원 화천',period:'1월 초~말 (통상 1/4~1/26)',highlight:'세계 4대 겨울 축제 · 얼음 산천어 낚시 · 눈썰매 · 빙판 체험',admission:'성인 5,000원 / 어린이 무료 (낚시는 별도)',tips:'주말 현장 혼잡. 산천어 낚시 체험은 사전 예약 권장.',applyUrl:'https://www.narafestival.com/'},
    {id:'f1-2',eventType:'festival',categoryIcon:'❄️',category:'축제',title:'태백산 눈꽃축제',institution:'강원 태백시',amount:'무료 입장 (일부 체험 유료)',scope:'강원 태백',period:'1월 중순~말 (통상 1/17~1/26)',highlight:'태백산 눈꽃 트레킹 · 눈 조각품 전시 · 흰 사슴 눈 조각 포토존',admission:'입장 무료 (케이블카 이용 시 유료)',tips:'방한 장비 필수. 대설 예보 시 도로 통제 가능.',applyUrl:'https://www.taebaek.go.kr/'},
    {id:'f1-3',eventType:'festival',categoryIcon:'🎋',category:'전통/문화',title:'설날 민속 체험 행사',institution:'국립민속박물관·각 지자체',amount:'무료 입장',scope:'전국',period:'설 연휴 3일간',highlight:'전통 민속놀이(윷놀이·연날리기·팽이치기) · 한복 무료 대여 · 떡국 시식',admission:'무료',tips:'국립민속박물관, 국립고궁박물관, 한국민속촌 등에서 동시 진행.',applyUrl:'https://www.nfm.go.kr/'},
  ],
  2:[
    {id:'f2-1',eventType:'festival',categoryIcon:'🐟',category:'축제',title:'인제 빙어축제',institution:'강원 인제군',amount:'빙어 낚시 체험 포함',scope:'강원 인제',period:'2월 초~중순 (통상 2/1~2/16)',highlight:'소양강 빙어 낚시 · 얼음 조각 전시 · 빙판 자전거 · 썰매',admission:'성인 3,000원 / 어린이 무료',tips:'방한 필수. 주말 방문 시 1~2시간 대기 가능.',applyUrl:'https://www.inje.go.kr/'},
    {id:'f2-2',eventType:'festival',categoryIcon:'🏔️',category:'축제',title:'대관령 눈꽃축제',institution:'강원 강릉시·평창군',amount:'무료 (일부 프로그램 유료)',scope:'강원 평창·강릉',period:'2월 초~중순',highlight:'대관령 눈꽃 산행 · 설경 포토존 · 겨울 레포츠',admission:'입장 무료',tips:'방한 필수. 평창 올림픽 스타디움 연계 방문 추천.',applyUrl:'https://www.visitkorea.or.kr/'},
    {id:'f2-3',eventType:'festival',categoryIcon:'🎋',category:'전통/문화',title:'정월대보름 민속 행사',institution:'각 지자체',amount:'무료',scope:'전국',period:'음력 1월 15일',highlight:'달집 태우기 · 쥐불놀이 · 오곡밥 나눔 · 지신밟기',admission:'무료',tips:'야간 행사 위주. 지역별 일정 확인 필수.',applyUrl:'https://www.culture.go.kr/'},
  ],
  3:[
    {id:'f3-1',eventType:'festival',categoryIcon:'🌸',category:'축제',title:'광양 매화 축제',institution:'전남 광양시',amount:'무료 입장',scope:'전남 광양',period:'3월 초~중순 (매화 개화 시기 따라 변동)',highlight:'섬진강 매화마을 10만 그루 · 야간 조명 · 매실 제품 시식',admission:'무료',tips:'섬진강 자전거 코스 연계 추천. 주말 주차 혼잡.',applyUrl:'https://www.maehwa.or.kr/'},
    {id:'f3-2',eventType:'festival',categoryIcon:'🌿',category:'축제',title:'삼일절 문화 행사',institution:'각 지자체·독립기념관',amount:'무료',scope:'전국',period:'3월 1일',highlight:'독립기념관 무료 개방 · 태극기 달기 · 독립선언서 낭독 행사',admission:'무료 (3/1 하루 한정)',tips:'천안 독립기념관 3/1 무료 입장. 전국 역사·기념관 대부분 무료.',applyUrl:'https://www.i815.or.kr/'},
    {id:'f3-3',eventType:'festival',categoryIcon:'🏃',category:'스포츠',title:'서울 국제 마라톤',institution:'서울시·동아일보',amount:'참가비 별도',scope:'서울',period:'3월 중순~말 (예정)',highlight:'풀코스 42.195km · 세계 6대 마라톤 · 광화문~잠실 코스',admission:'참가비: 55,000~70,000원',tips:'사전 참가 신청 필수. 응원 관람은 무료.',applyUrl:'https://www.donga-marathon.co.kr/'},
  ],
  4:[
    {id:'f4-1',eventType:'festival',categoryIcon:'🌸',category:'축제',title:'진해 군항제 (벚꽃)',institution:'창원시',amount:'무료 입장',scope:'경상남도 창원',period:'4월 초 (통상 4/1~4/10)',highlight:'국내 최대 벚꽃 축제 · 경화역·여좌천·안민도로 일대 360만 그루',admission:'무료',tips:'주말 극혼잡 예상, 평일 방문 권장. 진해역·창원역에서 셔틀버스 운행.',applyUrl:'https://www.changwon.go.kr/cwportal/depart/11063/11090/12962.web'},
    {id:'f4-2',eventType:'festival',categoryIcon:'🌸',category:'축제',title:'여의도 봄꽃축제',institution:'서울시 영등포구',amount:'무료 입장',scope:'서울 영등포',period:'4월 초~중순 (통상 4/5~4/14)',highlight:'한강 윤중로 벚꽃길 6km · 야간 조명 이벤트 · 푸드트럭 마켓',admission:'무료',tips:'지하철 5호선 여의나루역 하차. 주차 불가, 대중교통 이용 권장.',applyUrl:'https://www.ydpcf.or.kr/festival/festival.do'},
    {id:'f4-3',eventType:'festival',categoryIcon:'🏺',category:'축제',title:'이천 도자기 축제',institution:'이천시',amount:'입장료 성인 5,000원',scope:'경기 이천',period:'4월 중순~5월 초 (통상 4/19~5/11)',highlight:'도자기 체험·구매, 전통 도예 시연, 가마 불 지피기 체험',admission:'성인 5,000원 / 청소년 3,000원 / 어린이 무료',tips:'도자기 만들기 체험 사전 예약 권장. 주차장 무료.',applyUrl:'https://www.ceramic.or.kr/'},
    {id:'f4-4',eventType:'festival',categoryIcon:'🌼',category:'축제',title:'고양 국제꽃박람회',institution:'고양시',amount:'성인 12,000원 (사전 예매 할인 있음)',scope:'경기 고양',period:'4월 말~5월 초',highlight:'100만 송이 꽃 전시 · 대형 플라워 쇼 · 야간 경관',admission:'성인 12,000원 / 청소년 8,000원 / 어린이 6,000원',tips:'일산호수공원 일대. 사전 온라인 예매 시 최대 30% 할인.',applyUrl:'https://giff.flower.or.kr/main/'},
  ],
  5:[
    {id:'f5-1',eventType:'festival',categoryIcon:'🌹',category:'축제',title:'서울 장미 축제',institution:'서울시 중랑구',amount:'무료 입장',scope:'서울 중랑',period:'5월 중~말 (통상 5/17~5/25)',highlight:'중랑천 장미공원 100만 송이 · 야간 장미 조명 · 포토존 연출',admission:'무료',tips:'중랑천 산책로 따라 약 5.1km. 저녁 조명 연출이 특히 인기.',applyUrl:'https://www.jungnang.go.kr/'},
    {id:'f5-2',eventType:'festival',categoryIcon:'🎬',category:'축제',title:'전주 국제 영화제 (JIFF)',institution:'전주시',amount:'영화 1편 7,000원~',scope:'전북 전주',period:'5월 초 (통상 5/1~5/10)',highlight:'독립·예술 영화 중심 · 국내외 100편 이상 상영 · 야외 무료 상영',admission:'유료 (일부 야외 상영 무료)',tips:'전주한옥마을 인근. 좌석 사전 예약 권장.',applyUrl:'https://www.jiff.or.kr/'},
    {id:'f5-3',eventType:'festival',categoryIcon:'🧒',category:'행사',title:'어린이날 무료 문화 행사',institution:'각 지자체·국립기관',amount:'무료',scope:'전국',period:'5월 5일 (어린이날)',highlight:'국립 기관 무료 개방 · 어린이 체험 프로그램 · 가족 공연',admission:'무료 (국립박물관·미술관 등)',tips:'국립중앙박물관, 어린이대공원, 서울대공원 등 무료/할인 행사.',applyUrl:'https://www.culture.go.kr/'},
  ],
  6:[
    {id:'f6-1',eventType:'festival',categoryIcon:'🥁',category:'전통/문화',title:'강릉 단오제',institution:'강릉시',amount:'무료 입장',scope:'강원 강릉',period:'6월 초~중순 (음력 5월 5일 전후 1주일)',highlight:'유네스코 무형문화유산 · 굿판·씨름·그네·창포 머리감기',admission:'무료',tips:'남대천변 축제 마당 일대. 전국 최대 전통 제례 행사.',applyUrl:'https://www.danojefestival.or.kr/'},
    {id:'f6-2',eventType:'festival',categoryIcon:'🌿',category:'축제',title:'보성 다향 대축제',institution:'전남 보성군',amount:'무료 입장',scope:'전남 보성',period:'5월 말~6월 초',highlight:'녹차밭 투어 · 녹차 족욕 체험 · 녹차 아이스크림·음료 할인',admission:'무료 (일부 체험 유료)',tips:'보성 대한다원(녹차밭) 방문 세트 추천.',applyUrl:'https://www.boseong.go.kr/'},
    {id:'f6-3',eventType:'festival',categoryIcon:'✨',category:'축제',title:'무주 반딧불 축제',institution:'전북 무주군',amount:'일부 유료',scope:'전북 무주',period:'6월 말~7월 초',highlight:'자연 반딧불 관찰 · 천문 체험 · 래프팅·캠핑',admission:'입장 무료 (반딧불 투어 유료)',tips:'야간 반딧불 투어 사전 예약 필수.',applyUrl:'https://www.firefly.or.kr/'},
  ],
  7:[
    {id:'f7-1',eventType:'festival',categoryIcon:'🪸',category:'축제',title:'보령 머드 축제',institution:'충남 보령시',amount:'입장 무료 (머드 존 유료)',scope:'충남 보령',period:'7월 중 (통상 7/18~7/27)',highlight:'세계 4대 이색 축제 · 머드 슬라이드·풀장·마사지 체험',admission:'무료 (머드 풀 이용 별도)',tips:'수영복 필수. 사물함 사전 예약 권장.',applyUrl:'https://www.mudfestival.or.kr/'},
    {id:'f7-2',eventType:'festival',categoryIcon:'🌊',category:'축제',title:'부산 바다 축제',institution:'부산시',amount:'무료',scope:'부산 해운대·광안리',period:'7월 중 (통상 2주간)',highlight:'해수욕장 음악 공연 · 야간 드론쇼 · 서핑 강습 · 푸드마켓',admission:'무료',tips:'해운대·광안리·송정 해수욕장 연계 프로그램.',applyUrl:'https://sea.visitbusan.net/'},
    {id:'f7-3',eventType:'festival',categoryIcon:'💧',category:'축제',title:'물의 날 이벤트 (한강 수상 레저)',institution:'서울시',amount:'일부 무료',scope:'서울 한강',period:'7월~8월 (여름 시즌)',highlight:'한강 수영장 개장 · 수상 자전거·카약 · 야외 영화 상영',admission:'한강 수영장 무료 / 수상 레저 유료',tips:'여의도·뚝섬·광나루·잠원 한강공원 수영장 운영.',applyUrl:'https://hangang.seoul.go.kr/'},
  ],
  8:[
    {id:'f8-1',eventType:'festival',categoryIcon:'🎆',category:'축제',title:'부산 불꽃 축제',institution:'부산광역시',amount:'무료 관람',scope:'부산 광안리',period:'8월 말 (통상 10월로 연기되는 경우 있음)',highlight:'광안대교 배경 대형 불꽃쇼 · 드론 쇼 · 연 100만 명 관람',admission:'무료',tips:'광안리 해변 일대. 일찍 자리 잡을 것 권장.',applyUrl:'https://www.fireworks.or.kr/'},
    {id:'f8-2',eventType:'festival',categoryIcon:'⛰️',category:'축제',title:'함양 산삼 축제',institution:'경남 함양군',amount:'입장료 5,000원',scope:'경남 함양',period:'8월 중 (통상 8/1~8/10)',highlight:'산삼 채취 체험 · 한방 족욕 · 산삼 요리 시식',admission:'성인 5,000원 / 청소년 3,000원',tips:'산삼 경매 참여 가능. 한방 체험 사전 예약.',applyUrl:'https://www.sansam.org/'},
    {id:'f8-3',eventType:'festival',categoryIcon:'🏖️',category:'축제',title:'강원 여름 바다 축제',institution:'강원 양양·속초시',amount:'무료',scope:'강원 양양·속초',period:'8월 여름 시즌',highlight:'서핑 대회 · 비치 음악 축제 · 해돋이 포인트 투어',admission:'무료',tips:'양양 서핑은 초보자도 1일 강습 가능 (유료).',applyUrl:'https://www.yangyang.go.kr/'},
  ],
  9:[
    {id:'f9-1',eventType:'festival',categoryIcon:'🎭',category:'전통/문화',title:'안동 국제 탈춤 페스티벌',institution:'경북 안동시',amount:'입장료 있음',scope:'경북 안동',period:'9월 말~10월 초 (통상 5~10일간)',highlight:'세계 탈춤 공연 · 탈 만들기 체험 · 안동 하회마을 연계',admission:'성인 5,000원 / 청소년 3,000원',tips:'하회마을 세계문화유산 입장료 별도.',applyUrl:'https://www.maskdance.com/'},
    {id:'f9-2',eventType:'festival',categoryIcon:'🌾',category:'축제',title:'추석 민속 행사',institution:'각 지자체·국립기관',amount:'무료',scope:'전국',period:'추석 연휴 3일간',highlight:'전통 민속놀이 · 국립 기관 무료 개방 · 한가위 큰 잔치',admission:'무료 (국립박물관·고궁 무료)',tips:'5대 고궁(경복궁·창덕궁·덕수궁·창경궁·경희궁) 명절 무료 입장.',applyUrl:'https://www.cha.go.kr/'},
    {id:'f9-3',eventType:'festival',categoryIcon:'🌿',category:'축제',title:'금산 인삼 축제',institution:'충남 금산군',amount:'무료 입장',scope:'충남 금산',period:'9월 말~10월 초',highlight:'인삼 체험·구매 · 인삼 요리 시식 · 인삼 캐기 체험',admission:'무료',tips:'인삼 도매 시장 연계. 선물용 인삼 저렴하게 구매 가능.',applyUrl:'https://www.geumsan.go.kr/'},
  ],
  10:[
    {id:'f10-1',eventType:'festival',categoryIcon:'🎆',category:'축제',title:'서울 세계 불꽃 축제',institution:'서울시·한화',amount:'무료 관람',scope:'서울 여의도',period:'10월 첫째 주 토요일',highlight:'한강 대형 불꽃쇼 · 여의도 한강공원 일대 · 100만 관람 예상',admission:'무료',tips:'여의나루·영등포·이촌 한강공원에서 관람. 2~3시간 전 자리 확보 권장.',applyUrl:'https://www.hanwhafireworks.com/'},
    {id:'f10-2',eventType:'festival',categoryIcon:'🍂',category:'축제',title:'내장산 단풍 축제',institution:'전북 정읍시',amount:'입장료 성인 3,000원',scope:'전북 정읍',period:'10월 말~11월 초',highlight:'국내 최고의 단풍 명소 · 내장사 일주문길 1.8km · 케이블카',admission:'국립공원 입장료 성인 3,000원',tips:'단풍 절정은 10월 말. 주말 셔틀버스 운행.',applyUrl:'https://naejangsan.knps.or.kr/'},
    {id:'f10-3',eventType:'festival',categoryIcon:'🎨',category:'전시',title:'광주 비엔날레',institution:'광주광역시',amount:'입장료 있음',scope:'광주',period:'9~11월 (격년 개최)',highlight:'국제 현대 미술 전시 · 세계 40여 개국 참가 · 전시·퍼포먼스',admission:'성인 12,000원 / 학생 6,000원',tips:'격년 개최(짝수 연도). 광주 도심 복수 전시장.',applyUrl:'https://www.gwangjubiennale.org/'},
  ],
  11:[
    {id:'f11-1',eventType:'festival',categoryIcon:'🍁',category:'축제',title:'설악산 단풍 축제',institution:'강원 속초시·인제군',amount:'국립공원 입장 무료',scope:'강원 속초·인제',period:'10월 말~11월 초',highlight:'설악산 단풍 등산 · 케이블카 운행 · 천불동계곡 단풍',admission:'국립공원 입장 무료 (케이블카 유료)',tips:'단풍 절정 10월 말. 주말 케이블카 2~3시간 대기.',applyUrl:'https://seoraksan.knps.or.kr/'},
    {id:'f11-2',eventType:'festival',categoryIcon:'🌾',category:'축제',title:'순천만 갈대 축제',institution:'전남 순천시',amount:'입장료 성인 8,000원',scope:'전남 순천',period:'10월 말~11월 중',highlight:'순천만 갈대밭 황금빛 절경 · 생태 탐조 · 일몰 투어',admission:'성인 8,000원 / 청소년 6,000원',tips:'일몰 시간 맞춰 방문 추천. 갈대는 11월이 절정.',applyUrl:'https://www.suncheonbay.go.kr/'},
    {id:'f11-3',eventType:'festival',categoryIcon:'💡',category:'행사',title:'서울 빛 초롱 축제',institution:'서울시 종로구',amount:'무료 입장',scope:'서울 종로 청계천',period:'11월 초~12월 말',highlight:'청계천 일대 빛 조명 전시 · 전통 등불 작품 · 야간 포토존',admission:'무료',tips:'청계광장~삼일교 구간. 야간 방문 추천.',applyUrl:'https://www.seoullanternfestival.com/'},
  ],
  12:[
    {id:'f12-1',eventType:'festival',categoryIcon:'🎄',category:'행사',title:'전주 한옥마을 크리스마스 마켓',institution:'전북 전주시',amount:'무료 입장',scope:'전북 전주',period:'12월 초~12월 25일',highlight:'한옥마을 겨울 야시장 · 수공예 선물 · 전통 먹거리 · 크리스마스 조명',admission:'무료',tips:'전주 한옥마을 경기전 앞 일대. 저녁 시간 방문 추천.',applyUrl:'https://www.jeonju.go.kr/'},
    {id:'f12-2',eventType:'festival',categoryIcon:'🎆',category:'행사',title:'서울 새해맞이 제야의 종 행사',institution:'서울시 종로구',amount:'무료',scope:'서울 종로 보신각',period:'12월 31일 자정',highlight:'보신각 33번 타종 · 카운트다운 · 불꽃쇼',admission:'무료',tips:'자정 전 1~2시간 일찍 도착 필요. 12/31 심야버스 특별 운행.',applyUrl:'https://www.jongno.go.kr/'},
    {id:'f12-3',eventType:'festival',categoryIcon:'💡',category:'행사',title:'에버랜드 크리스마스 페스타',institution:'삼성물산 리조트',amount:'입장료 포함',scope:'경기 용인',period:'11월 말~12월 말',highlight:'대형 크리스마스 트리 · 눈 퍼레이드 · 야간 불꽃',admission:'대인 62,000원 (시즌권 있음)',tips:'연말 성수기 혼잡. 사전 예매 필수.',applyUrl:'https://www.everland.com/'},
  ],
};

// 현재 달에 맞는 이벤트 계산 — 렌더 시마다 호출해야 월 전환이 반영됨
function getMonthlyEvents(){
  const m=new Date().getMonth()+1; // 1~12, 호출할 때마다 현재 달 기준
  const label=`${m}월`;
  const festivals=(FESTIVALS_BY_MONTH[m]||[]).map(ev=>({
    ...ev,
    badge:`${label} 축제`,
    badgeColor:'#db2777',
    badgeBg:'#fdf2f8',
  }));
  return[...PERMANENT_EVENTS,...festivals];
}
// 모듈 상수로 고정하지 않음 — 렌더 시점에 getMonthlyEvents()를 직접 호출

// ─── EventDetailModal ──────────────────────────────────────────────
function EventDetailModal({ev,onClose}){
  const sheetStyle={position:'absolute',bottom:0,left:0,right:0,maxHeight:'90vh',background:'#fff',borderRadius:'28px 28px 0 0',display:'flex',flexDirection:'column'};
  const headerStyle={flexShrink:0,padding:'16px 20px',borderBottom:'1px solid #f3f4f6'};
  const scrollStyle={flex:1,overflowY:'auto',padding:'20px'};
  const btnAreaStyle={flexShrink:0,display:'flex',gap:8,padding:'12px 20px',paddingBottom:'calc(12px + env(safe-area-inset-bottom,0px))'};
  const secTitle=(icon,text,color='#111827')=>(
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
      <div style={{width:4,height:16,background:color,borderRadius:2}}/>
      <h3 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>{icon} {text}</h3>
    </div>
  );

  return(
    <div style={{position:'fixed',inset:0,zIndex:1000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}}/>
      <div style={sheetStyle}>
        {/* 헤더 */}
        <div style={headerStyle}>
          <div style={{width:36,height:4,borderRadius:2,background:'#d1d5db',margin:'0 auto 14px'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1,paddingRight:12}}>
              <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:11,fontWeight:700,color:ev.badgeColor,background:ev.badgeBg,padding:'3px 10px',borderRadius:20}}>{ev.badge}</span>
                <span style={{fontSize:11,fontWeight:700,color:'#374151',background:'#f3f4f6',padding:'3px 10px',borderRadius:20}}>{ev.scope}</span>
              </div>
              <h2 style={{fontSize:18,fontWeight:800,color:'#111827',lineHeight:1.3,margin:0}}>{ev.title}</h2>
              <p style={{fontSize:13,color:'#6b7280',margin:'4px 0 0'}}>{ev.institution}</p>
            </div>
            <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:'50%',width:34,height:34,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,fontFamily:'inherit'}}>✕</button>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div style={scrollStyle}>
          {ev.eventType==='culture-day'&&(<>
            {/* 영화관 */}
            {secTitle('🎬','영화관 할인 (7,000원)','#2563eb')}
            <div style={{background:'#eff6ff',borderRadius:14,padding:'14px',marginBottom:20}}>
              <p style={{fontSize:13,color:'#1e40af',lineHeight:1.65,margin:'0 0 12px',fontWeight:600}}>매주 수요일, 2D 일반관 7,000원 관람 가능 (특별관 제외)</p>
              {ev.cinemas.map(c=>(
                <div key={c.name} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid #bfdbfe'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#1e3a8a'}}>{c.name}</div>
                    <div style={{fontSize:12,color:'#3b82f6',marginTop:2}}>{c.note}</div>
                  </div>
                  <span style={{fontSize:15,fontWeight:800,color:'#1e40af',flexShrink:0,marginLeft:8}}>{c.price}</span>
                </div>
              ))}
            </div>
            {/* 박물관·미술관 */}
            {secTitle('🏛️','국공립 박물관·미술관 무료/할인','#059669')}
            <div style={{background:'#f9fafb',borderRadius:14,padding:'4px 16px',marginBottom:20}}>
              {ev.museums.map((m,i)=>(
                <div key={m.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:i<ev.museums.length-1?'1px solid #f0f0f0':'none'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#111827'}}>{m.name}</div>
                    <div style={{fontSize:12,color:'#9ca3af'}}>{m.loc}</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:'#059669',background:'#dcfce7',padding:'3px 10px',borderRadius:20,flexShrink:0,marginLeft:8}}>{m.benefit}</span>
                </div>
              ))}
            </div>
            <div style={{background:'#fef9c3',borderRadius:12,padding:'12px 14px',border:'1px solid #fde68a'}}>
              <p style={{fontSize:12,color:'#92400e',lineHeight:1.65,margin:0}}>⚠️ 일부 특별전·기획전은 별도 입장료가 있을 수 있습니다. 방문 전 해당 기관 홈페이지에서 확인하세요.</p>
            </div>
          </>)}

          {ev.eventType==='local-performance'&&(<>
            <p style={{fontSize:14,color:'#4b5563',lineHeight:1.75,margin:'0 0 20px',padding:'14px',background:'#f0fdf4',borderRadius:12}}>전국 각 지자체에서 운영하는 무료·저가 문화 공연 목록입니다. 사전 예약이 필요한 경우가 많으니 각 기관 홈페이지를 꼭 확인하세요.</p>
            {secTitle('🎭','지역별 무료 공연','#7c3aed')}
            <div style={{background:'#f9fafb',borderRadius:14,padding:'4px 16px',marginBottom:16}}>
              {ev.performances.map((p,i)=>(
                <div key={p.name} style={{padding:'12px 0',borderBottom:i<ev.performances.length-1?'1px solid #f0f0f0':'none'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',padding:'2px 8px',borderRadius:20}}>{p.city}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{p.name}</span>
                  </div>
                  <p style={{fontSize:13,color:'#4b5563',margin:0,lineHeight:1.55}}>{p.desc}</p>
                </div>
              ))}
            </div>
            <div style={{background:'#fef9c3',borderRadius:12,padding:'12px 14px',border:'1px solid #fde68a'}}>
              <p style={{fontSize:12,color:'#92400e',lineHeight:1.65,margin:0}}>💡 각 지자체 문화재단 또는 기관 홈페이지에서 월별 공연 일정을 확인하세요. 사전 예약 필수인 경우가 많습니다.</p>
            </div>
          </>)}

          {ev.eventType==='festival'&&(<>
            <div style={{background:'linear-gradient(135deg,#fdf2f8,#fce7f3)',borderRadius:14,padding:'16px',marginBottom:20,display:'flex',gap:12,alignItems:'flex-start'}}>
              <span style={{fontSize:28,flexShrink:0}}>{ev.categoryIcon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#be185d',marginBottom:4}}>{ev.period}</div>
                <p style={{fontSize:13,color:'#9d174d',lineHeight:1.65,margin:0}}>{ev.highlight}</p>
              </div>
            </div>
            {secTitle('🎟️','입장 정보','#db2777')}
            <div style={{background:'#f9fafb',borderRadius:14,padding:'4px 16px',marginBottom:20}}>
              {[
                {l:'📅 기간',v:ev.period},
                {l:'📍 장소',v:ev.scope},
                {l:'🏛️ 주관',v:ev.institution},
                {l:'💰 입장료',v:ev.admission},
              ].map(({l,v})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{fontSize:13,color:'#6b7280',flexShrink:0,marginRight:8}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#111827',textAlign:'right',flex:1}}>{v}</span>
                </div>
              ))}
            </div>
            {ev.tips&&(<>
              {secTitle('💡','방문 꿀팁','#f59e0b')}
              <div style={{background:'#fffbeb',borderRadius:12,padding:'14px',border:'1px solid #fde68a',marginBottom:16}}>
                <p style={{fontSize:13,color:'#92400e',lineHeight:1.7,margin:0}}>{ev.tips}</p>
              </div>
            </>)}
          </>)}

          {/* ── API 수집 축제 (KorService2 / 표준데이터) ── */}
          {ev.eventType==='festival-api'&&(<>
            {ev.thumbnail&&(
              <div style={{borderRadius:14,overflow:'hidden',marginBottom:16,aspectRatio:'16/9'}}>
                <img src={ev.thumbnail} alt={ev.title} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.currentTarget.style.display='none';}}/>
              </div>
            )}
            <div style={{background:'linear-gradient(135deg,#fdf2f8,#fce7f3)',borderRadius:14,padding:'14px 16px',marginBottom:16,display:'flex',gap:12,alignItems:'center'}}>
              <span style={{fontSize:26,flexShrink:0}}>{ev.categoryIcon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#be185d',marginBottom:2}}>{ev.period}</div>
                <div style={{fontSize:12,color:'#9d174d'}}>{ev.scope}</div>
              </div>
            </div>
            {secTitle('🎟️','행사 정보','#db2777')}
            <div style={{background:'#f9fafb',borderRadius:14,padding:'4px 16px',marginBottom:16}}>
              {[
                {l:'📅 기간',v:ev.period},
                {l:'📍 장소',v:ev.address||ev.scope},
                {l:'🏛️ 주관',v:ev.institution},
                ev.phone?{l:'📞 문의',v:ev.phone}:null,
              ].filter(Boolean).map(({l,v})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'11px 0',borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{fontSize:13,color:'#6b7280',flexShrink:0,marginRight:8}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#111827',textAlign:'right',flex:1}}>{v}</span>
                </div>
              ))}
            </div>
            {ev.amount&&ev.amount!=='현장 방문'&&(<>
              {secTitle('📋','행사 내용','#7c3aed')}
              <div style={{background:'#f5f3ff',borderRadius:12,padding:'14px',border:'1px solid #ddd6fe',marginBottom:16}}>
                <p style={{fontSize:13,color:'#5b21b6',lineHeight:1.7,margin:0}}>{ev.amount}</p>
              </div>
            </>)}
            <div style={{background:'#fffbeb',borderRadius:12,padding:'12px 14px',border:'1px solid #fde68a'}}>
              <p style={{fontSize:12,color:'#92400e',lineHeight:1.65,margin:0}}>💡 입장료·운영시간·세부 프로그램은 공식 홈페이지 또는 방문 전 전화로 확인하세요.</p>
            </div>
          </>)}
        </div>

        {/* 버튼 */}
        <div style={btnAreaStyle}>
          <button onClick={onClose} style={{flex:1,padding:'14px',borderRadius:14,background:'#f3f4f6',color:'#374151',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',fontFamily:'inherit'}}>닫기</button>
          <a href={ev.applyUrl} target="_blank" rel="noreferrer" style={{flex:2,padding:'14px',borderRadius:14,background:'#2563eb',color:'#fff',fontSize:14,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6,boxShadow:'0 4px 14px rgba(37,99,235,0.3)'}}>자세히 보기 →</a>
        </div>
      </div>
    </div>
  );
}

// ─── EventCard ────────────────────────────────────────────────────
function EventCard({ev}){
  const[open,setOpen]=useState(false);
  return(<>
    <div style={{background:'#fff',borderRadius:24,padding:'20px',marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)',border:'1px solid #f3f4f6'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:14}}>
        <div style={{width:48,height:48,borderRadius:18,background:ev.badgeBg||'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>
          {ev.categoryIcon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',gap:5,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontSize:10,fontWeight:700,color:ev.badgeColor,background:ev.badgeBg,padding:'2px 8px',borderRadius:6,border:`1px solid ${ev.badgeColor}33`}}>{ev.badge}</span>
            <span style={{fontSize:10,fontWeight:700,color:'#374151',background:'#f3f4f6',padding:'2px 8px',borderRadius:6}}>{ev.scope}</span>
          </div>
          <h3 style={{fontSize:15,fontWeight:700,color:'#111827',lineHeight:1.35,margin:0}}>{ev.title}</h3>
          <p style={{fontSize:12,color:'#6b7280',margin:'3px 0 0'}}>{ev.institution}</p>
        </div>
      </div>
      <div style={{background:'#f9fafb',borderRadius:14,padding:'12px 14px',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
          <span style={{fontSize:13,color:'#6b7280',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>혜택 내용</span>
          <span style={{fontSize:13,fontWeight:700,color:'#111827',textAlign:'right',wordBreak:'keep-all',overflowWrap:'break-word'}}>{ev.amount}</span>
        </div>
        {ev.period&&(<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
          <span style={{fontSize:13,color:'#6b7280',fontWeight:500}}>기간</span>
          <span style={{fontSize:13,fontWeight:600,color:'#374151'}}>{ev.period}</span>
        </div>)}
      </div>
      <button onClick={()=>setOpen(true)} style={{width:'100%',padding:'11px 0',borderRadius:12,background:'#f0f9ff',color:'#2563eb',fontSize:14,fontWeight:700,border:'1px solid #bfdbfe',cursor:'pointer',fontFamily:'inherit'}}>상세 보기</button>
    </div>
    {open&&<EventDetailModal ev={ev} onClose={()=>setOpen(false)}/>}
  </>);
}

// ─── BCard 카테고리 아이콘 색상 ─────────────────────────────────────
const CAT_ICON_STYLE={'주거':{bg:'#f0fdf4',color:'#16a34a'},'의료':{bg:'#fef2f2',color:'#dc2626'},'금융':{bg:'#eff6ff',color:'#2563eb'},'교육':{bg:'#f0fdf4',color:'#16a34a'},'고용':{bg:'#f5f3ff',color:'#7c3aed'},'보육':{bg:'#fdf2f8',color:'#db2777'},'노인':{bg:'#e0f2fe',color:'#0284c7'},'장애':{bg:'#ecfccb',color:'#65a30d'},'청년':{bg:'#f5f3ff',color:'#7c3aed'},'취업/직장':{bg:'#eff6ff',color:'#2563eb'},'생활/교통':{bg:'#fff7ed',color:'#ea580c'},'기타':{bg:'#f9fafb',color:'#6b7280'}};
function calcTotalYearly(benefits){
  // 대출·보증 성격 키워드가 포함된 혜택은 실수령 금액 아님 → 제외
  const LOAN_KW=/대출|전세자금|버팀목전세|임차보증금대출|구입자금|보증금대출|저금리대출|주택담보|구입·임차|매입임대|전세임대/;
  // 이자율(%)만 명시된 경우 → 원금 아닌 이율이므로 0 처리 (별도 만원 수치 없으면 자동으로 0)
  let total=0;
  for(const b of benefits){
    const combined=((b.title||'')+' '+(b.amount||'')).replace(/,/g,'');
    // 대출 성격 → 건너뜀
    if(LOAN_KW.test(combined)) continue;
    // 억 단위는 거의 항상 대출 원금 → 건너뜀
    if(/억/.test(combined)) continue;
    const s=(b.amount||'').replace(/,/g,'');
    const monthly=/월/.test(s)&&!/연/.test(s);
    // 퍼센트(%)만 있는 항목(이자율 감면 등)은 만원 수치 없으므로 자동으로 0
    const m=s.match(/(\d+)\s*만/);
    if(m){const v=parseInt(m[1]);total+=monthly?v*12:v;}
  }
  return total;
}

// ─── BenefitDetail 모달 ───────────────────────────────────────────
function shouldExcludeBenefitTitle(title=''){
  const t = String(title);
  if (/생활안정자금[\s(]*융자/i.test(t)) return true;
  if (/청년월세지원서울|청년\s*월세\s*지원\s*서울/i.test(t)) return true;
  return false;
}

// ── 특정 혜택명에 고정 아이콘 적용 (Claude 생성 결과 덮어쓰기용)
const BENEFIT_ICON_OVERRIDES = [
  { pattern: /서울\s*청년\s*수당/i,            categoryIcon: '💰', sourceIcon: '💰' },
  { pattern: /청년\s*월세\s*지원/i,            categoryIcon: '🏠', sourceIcon: '🏠' },
];

function applyIconOverrides(benefit) {
  const title = String(benefit?.title || '');
  for (const rule of BENEFIT_ICON_OVERRIDES) {
    if (rule.pattern.test(title)) {
      return { ...benefit, categoryIcon: rule.categoryIcon, sourceIcon: rule.sourceIcon };
    }
  }
  return benefit;
}

function filterExcludedBenefits(benefits=[]){
  return benefits
    .filter(b=>!shouldExcludeBenefitTitle(b?.title||b?.혜택명||''))
    .map(applyIconOverrides);
}

function BenefitDetail({b,onClose,days,dl}){
  const [bankModalOpen,setBankModalOpen]=useState(false);
  const isYouthHousingDream = isYouthHousingDreamBenefit(b);
  const steps=[
    {n:1,title:'서류 준비',icon:'📂',bg:'#eff6ff',color:'#1e40af',items:b.requiredDocuments||[],text:b.requiredDocuments?.length?'':'기관에 문의하여 필요 서류를 확인하세요.'},
    {n:2,title:'신청 방법',icon:'📝',bg:'#f0fdf4',color:'#166534',items:[],text:b.howToApply||'해당 기관 홈페이지 또는 주민센터 방문'},
    {n:3,title:'심사 및 처리',icon:'⏳',bg:'#fef9c3',color:'#854d0e',items:[],text:'서류 접수 후 담당 기관에서 자격 심사가 진행됩니다. 처리 기간은 기관마다 상이합니다.'},
    {n:4,title:'결과 통보',icon:'📣',bg:'#fce7f3',color:'#9d174d',items:[],text:'심사 완료 후 SMS, 우편 또는 홈페이지를 통해 결과를 안내받습니다.'},
    {n:5,title:'혜택 수령',icon:'✅',bg:'#dcfce7',color:'#166534',items:[],text:`지원금은 ${b.amount||'해당 혜택에 따라'} 지급됩니다.`},
  ];

  // ── 출시 예정 전용 레이아웃 ──
  if(b.isComingSoon){
    const infoRows=[
      {icon:'🎯',label:'가입 대상',value:'만 19~34세 대한민국 청년'},
      {icon:'💵',label:'월 납입 한도',value:'월 최대 50만원 (예정)'},
      {icon:'📅',label:'적금 기간',value:'3년 (예정)'},
      {icon:'🏛️',label:'정부 기여금',value:'납입액 대비 최대 6% 매칭 지원 (예정)'},
      {icon:'🚫',label:'세금 혜택',value:'이자소득 비과세 적용 (예정)'},
      {icon:'📈',label:'적용 금리',value:'시중 우대금리 + 정부 혜택 가산 (예정)'},
      {icon:'🏦',label:'취급 기관',value:'서민금융진흥원 · 참여 은행 (출시 시 공개)'},
      {icon:'🗓️',label:'출시 일정',value:'2026년 하반기 예정'},
    ];
    const prepSteps=[
      {icon:'📋',title:'가입 자격 미리 확인',desc:'만 19~34세이며, 직전 연도 총급여 7,500만원 이하(예정) 여부를 확인하세요.'},
      {icon:'📂',title:'소득 증빙 서류 준비',desc:'건강보험료 납부 확인서, 근로소득 원천징수 영수증 등을 미리 발급해 두세요.'},
      {icon:'📱',title:'거래 은행 앱 업데이트',desc:'출시 직후 빠르게 신청할 수 있도록 주거래 은행 앱을 최신 버전으로 유지하세요.'},
      {icon:'✅',title:'기존 청년 상품 수령 확인',desc:'청년희망적금 등 기존 정책 적금 만기·해지 여부를 확인하세요. 중복 가입 제한이 있을 수 있습니다.'},
      {icon:'🔔',title:'출시 알림 신청',desc:'서민금융진흥원(kinfa.or.kr) 또는 주거래 은행 앱에서 출시 알림을 사전에 등록하세요.'},
    ];
    return(
      <div style={{position:'fixed',inset:0,zIndex:1000}}>
        <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,maxHeight:'92vh',background:'#fff',borderRadius:'28px 28px 0 0',display:'flex',flexDirection:'column'}}>
          {/* 헤더 - 스크롤 밖 고정 */}
          <div style={{flexShrink:0,padding:'16px 20px',borderBottom:'1px solid #f3f4f6'}}>
            <div style={{width:36,height:4,borderRadius:2,background:'#d1d5db',margin:'0 auto 14px'}}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1,paddingRight:12}}>
                <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#eff6ff',padding:'3px 10px',borderRadius:20}}>금융</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#fff',background:'linear-gradient(90deg,#7c3aed,#2563eb)',padding:'3px 10px',borderRadius:20}}>🔜 출시 예정</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',background:'#f3f4f6',padding:'3px 10px',borderRadius:20}}>전국</span>
                </div>
                <h2 style={{fontSize:18,fontWeight:800,color:'#111827',lineHeight:1.3,margin:0}}>청년미래적금</h2>
                <p style={{fontSize:13,color:'#6b7280',margin:'4px 0 0'}}>금융위원회 · 서민금융진흥원</p>
              </div>
              <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:'50%',width:34,height:34,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,fontFamily:'inherit'}}>✕</button>
            </div>
          </div>
          {/* 스크롤 영역 */}
          <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
            {/* 출시 예정 배너 */}
            <div style={{background:'linear-gradient(135deg,#ede9fe 0%,#dbeafe 100%)',borderRadius:16,padding:'16px',marginBottom:20,display:'flex',gap:12,alignItems:'flex-start'}}>
              <span style={{fontSize:28,flexShrink:0}}>🚀</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#4c1d95',marginBottom:4}}>2026년 하반기 출시 예정</div>
                <p style={{fontSize:13,color:'#3730a3',lineHeight:1.65,margin:0}}>청년도약계좌의 후속 상품으로, 매월 납입 시 정부 기여금 매칭과 이자 비과세 혜택을 제공합니다. 정확한 조건은 출시 시 확정됩니다.</p>
              </div>
            </div>
            {/* 상품 정보 그리드 */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <div style={{width:4,height:16,background:'#2563eb',borderRadius:2}}/>
              <h3 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>상품 주요 정보 (예정)</h3>
            </div>
            <div style={{background:'#f9fafb',borderRadius:16,padding:'4px 16px',marginBottom:20}}>
              {infoRows.map(({icon,label,value})=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid #f0f0f0'}}>
                  <span style={{fontSize:13,color:'#6b7280',flexShrink:0,marginRight:8}}>{icon} {label}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'#111827',textAlign:'right',flex:1}}>{value}</span>
                </div>
              ))}
            </div>
            {/* 청년도약계좌 비교 */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <div style={{width:4,height:16,background:'#7c3aed',borderRadius:2}}/>
              <h3 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>청년도약계좌와 비교</h3>
            </div>
            <div style={{borderRadius:14,overflow:'hidden',border:'1px solid #e5e7eb',marginBottom:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'#111827'}}>
                {['구분','청년도약계좌(폐지)','청년미래적금(예정)'].map(h=>(
                  <div key={h} style={{padding:'10px 12px',fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.85)',textAlign:'center'}}>{h}</div>
                ))}
              </div>
              {[
                ['납입 한도','월 최대 70만원','월 최대 50만원'],
                ['기간','5년','3년'],
                ['정부 기여금','최대 6% 매칭','최대 6% 매칭'],
                ['비과세','이자 비과세','이자 비과세'],
                ['상태','2025년 폐지','출시 예정'],
              ].map(([label,old,next],i)=>(
                <div key={label} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:i%2===0?'#fff':'#f9fafb'}}>
                  <div style={{padding:'10px 12px',fontSize:12,fontWeight:600,color:'#374151',borderRight:'1px solid #f0f0f0'}}>{label}</div>
                  <div style={{padding:'10px 12px',fontSize:12,color:'#9ca3af',textAlign:'center',borderRight:'1px solid #f0f0f0',textDecoration:'line-through'}}>{old}</div>
                  <div style={{padding:'10px 12px',fontSize:12,fontWeight:700,color:'#2563eb',textAlign:'center'}}>{next}</div>
                </div>
              ))}
            </div>
            {/* 출시 전 준비사항 */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
              <div style={{width:4,height:16,background:'#15803d',borderRadius:2}}/>
              <h3 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>출시 전 미리 준비하기</h3>
            </div>
            <div style={{position:'relative'}}>
              <div style={{position:'absolute',left:19,top:20,bottom:20,width:2,background:'linear-gradient(to bottom,#c7d2fe,#bfdbfe)',zIndex:0}}/>
              {prepSteps.map((step,i)=>(
                <div key={step.title} style={{display:'flex',gap:14,marginBottom:i<prepSteps.length-1?14:0,position:'relative',zIndex:1}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                    {step.icon}
                  </div>
                  <div style={{flex:1,paddingTop:8}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#111827',marginBottom:4}}>{step.title}</div>
                    <p style={{fontSize:13,color:'#4b5563',lineHeight:1.6,margin:0}}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop:20,padding:'14px',background:'#fef9c3',borderRadius:14,border:'1px solid #fde68a'}}>
              <p style={{fontSize:12,color:'#92400e',lineHeight:1.65,margin:0}}>⚠️ 위 내용은 현재까지 공개된 정보를 바탕으로 작성되었습니다. 정확한 가입 조건·혜택·일정은 출시 시 금융위원회 및 서민금융진흥원 공식 발표를 확인해 주세요.</p>
            </div>
          </div>
          {/* 버튼 - 스크롤 밖 하단 고정 */}
          <div style={{flexShrink:0,display:'flex',gap:8,padding:'12px 20px',paddingBottom:'calc(12px + env(safe-area-inset-bottom,0px))'}}>
            <button onClick={onClose} style={{flex:1,padding:'14px',borderRadius:14,background:'#f3f4f6',color:'#374151',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',fontFamily:'inherit'}}>닫기</button>
            <button disabled style={{flex:2,padding:'14px',borderRadius:14,background:'#e5e7eb',color:'#9ca3af',fontSize:14,fontWeight:700,border:'none',cursor:'not-allowed',fontFamily:'inherit'}}>🔜 출시 예정</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{position:'fixed',inset:0,zIndex:1000}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)'}}/>
      <div style={{position:'absolute',bottom:0,left:0,right:0,maxHeight:'90vh',background:'#fff',borderRadius:'28px 28px 0 0',display:'flex',flexDirection:'column'}}>
        {/* 헤더 - 스크롤 밖 고정 */}
        <div style={{flexShrink:0,padding:'16px 20px',borderBottom:'1px solid #f3f4f6'}}>
          <div style={{width:36,height:4,borderRadius:2,background:'#d1d5db',margin:'0 auto 16px'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1,paddingRight:12}}>
              <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#15803d',background:'#dcfce7',padding:'3px 10px',borderRadius:20}}>{b.category}</span>
                {b.scope&&<span style={{fontSize:11,fontWeight:700,color:'#374151',background:'#f3f4f6',padding:'3px 10px',borderRadius:20}}>{b.scope}</span>}
                {b.isUrgent&&<span style={{fontSize:11,fontWeight:700,color:'#c2410c',background:'#fff7ed',padding:'3px 10px',borderRadius:20}}>⚡ 긴급</span>}
              </div>
              <h2 style={{fontSize:17,fontWeight:800,color:'#111827',lineHeight:1.3,margin:0}}>{b.title}</h2>
            </div>
            <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:'50%',width:34,height:34,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,fontFamily:'inherit'}}>✕</button>
          </div>
        </div>
        {/* 스크롤 영역 */}
        <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
          {b.description&&<p style={{fontSize:14,color:'#4b5563',lineHeight:1.75,margin:'0 0 20px',padding:'14px',background:'#f9fafb',borderRadius:14}}>{b.description}</p>}
          <div style={{background:'#f9fafb',borderRadius:16,padding:'4px 16px',marginBottom:20}}>
            {[{l:'💰 지원 내용',v:b.amount||'-'},{l:'🏛️ 담당 기관',v:b.institution||'-'},{l:'📅 신청 기한',v:b.deadline||'수시 신청',urgent:days!==null&&days<=14&&days>=0},{l:'📌 신청 방법',v:b.howToApply||'-'}].map(({l,v,urgent})=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid #f0f0f0'}}>
                <span style={{fontSize:13,color:'#6b7280',flexShrink:0,marginRight:8}}>{l}</span>
                <span style={{fontSize:13,fontWeight:600,color:urgent?'#c2410c':'#111827',textAlign:'right',flex:1}}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
            <div style={{width:4,height:16,background:'#15803d',borderRadius:2}}/>
            <h3 style={{fontSize:15,fontWeight:700,color:'#111827',margin:0}}>단계별 신청 가이드</h3>
          </div>
          {steps.map((step,i)=>(
            <div key={step.n} style={{display:'flex',gap:14,marginBottom:i<steps.length-1?16:24}}>
              <div style={{width:40,height:40,borderRadius:'50%',background:step.bg,color:step.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                {step.icon}
              </div>
              <div style={{flex:1,paddingTop:8}}>
                <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',marginBottom:2}}>Step {step.n}</div>
                <div style={{fontSize:14,fontWeight:700,color:'#111827',marginBottom:step.items.length?8:4}}>{step.title}</div>
                {step.items.length>0?(
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {step.items.map(doc=><span key={doc} style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'4px 10px',fontSize:12,color:'#1e40af',fontWeight:500}}>📄 {doc}</span>)}
                  </div>
                ):(
                  <p style={{fontSize:13,color:'#4b5563',lineHeight:1.65,margin:0}}>{step.text}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* 버튼 - 스크롤 밖 하단 고정 */}
        <div style={{flexShrink:0,display:'flex',gap:8,padding:'12px 20px',paddingBottom:'calc(12px + env(safe-area-inset-bottom,0px))'}}>
          <button onClick={onClose} style={{flex:1,padding:'14px',borderRadius:14,background:'#f3f4f6',color:'#374151',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',fontFamily:'inherit'}}>닫기</button>
          {isYouthHousingDream?(
            <button onClick={()=>setBankModalOpen(true)} style={{flex:2,padding:'14px',borderRadius:14,background:'#15803d',color:'#fff',fontSize:14,fontWeight:700,border:'none',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(21,128,61,0.3)'}}>은행 선택하기 →</button>
          ):(
            <a href={getBestApplyUrl(b.applyUrl,b.title,b.institution)} target="_blank" rel="noreferrer" style={{flex:2,padding:'14px',borderRadius:14,background:'#15803d',color:'#fff',fontSize:14,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',gap:6,boxShadow:'0 4px 14px rgba(21,128,61,0.3)'}}>바로 신청하기 →</a>
          )}
        </div>
      </div>
      {bankModalOpen&&<YouthHousingDreamBankModal onClose={()=>setBankModalOpen(false)}/>}
    </div>
  );
}

// ─── BCard ────────────────────────────────────────────────────────
function BCard({b,savedIds,onToggleSave}){const catStyle=CAT_ICON_STYLE[b.category]||{bg:'#f9fafb',color:'#6b7280'};const isSaved=savedIds?.has(String(b.id));const dl=parseDeadline(b.deadline);const days=daysLeft(dl);const[detailOpen,setDetailOpen]=useState(false);const[bankModalOpen,setBankModalOpen]=useState(false);const isYouthHousingDream=isYouthHousingDreamBenefit(b);
// Status badge
  let statusBadge;
  if(b.isComingSoon){
    statusBadge={label:'🔜 출시 예정',bg:'linear-gradient(90deg,#ede9fe,#dbeafe)',color:'#4c1d95',border:'#c4b5fd'};
  }else if(b.isUrgent||(days!==null&&days<=14&&days>=0)){
    statusBadge={label:days!==null&&days>=0?`D-${days}`:'조건확인',bg:'#fff7ed',color:'#c2410c',border:'#fed7aa'};
  }else if(b.deadline&&b.deadline!=='수시 신청'&&b.deadline!=='수시'){
    statusBadge={label:'신청가능',bg:'#eff6ff',color:'#1d4ed8',border:'#bfdbfe'};
  }else{
    statusBadge={label:'수시신청',bg:'#f0fdf4',color:'#15803d',border:'#bbf7d0'};
  }
  return(<>
    <div style={{background:'#fff',borderRadius:24,padding:'20px',marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)',border:`1px solid ${b.isComingSoon?'#c4b5fd':isSaved?'#86efac':'#f3f4f6'}`,transition:'box-shadow 0.15s'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div style={{display:'flex',gap:14,flex:1,minWidth:0}}>
          <div style={{width:48,height:48,borderRadius:18,background:b.isComingSoon?'#ede9fe':catStyle.bg,color:b.isComingSoon?'#7c3aed':catStyle.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>
            {b.categoryIcon||'📋'}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',gap:5,marginBottom:6,flexWrap:'wrap'}}>
              <span style={{fontSize:10,fontWeight:700,color:'#15803d',background:'#dcfce7',padding:'2px 8px',borderRadius:6}}>{b.category}</span>
              <span style={{fontSize:10,fontWeight:700,color:statusBadge.color,background:statusBadge.bg,padding:'2px 8px',borderRadius:6,border:`1px solid ${statusBadge.border}`}}>{statusBadge.label}</span>
              {b.isHidden&&<span style={{fontSize:10,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',padding:'2px 8px',borderRadius:6}}>숨겨진</span>}
            </div>
            <h3 style={{fontSize:15,fontWeight:700,color:'#111827',lineHeight:1.35,margin:0}}>{b.title}</h3>
          </div>
        </div>
        {onToggleSave&&!b.isComingSoon&&(
          <button onClick={()=>onToggleSave(b)} style={{background:'none',border:'none',cursor:'pointer',padding:'4px',flexShrink:0,fontSize:22,lineHeight:1,marginLeft:8}}>
            {isSaved?'❤️':'🤍'}
          </button>
        )}
      </div>
      <div style={{background:b.isComingSoon?'#f5f3ff':'#f9fafb',borderRadius:14,padding:'12px 14px',marginBottom:12}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:b.deadline?8:0}}>
          <span style={{fontSize:13,color:'#6b7280',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>지원 내용</span>
          <span style={{fontSize:13,fontWeight:700,color:'#111827',textAlign:'right',wordBreak:'keep-all',overflowWrap:'break-word'}}>{b.amount||'-'}</span>
        </div>
        {b.deadline&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,color:'#6b7280',fontWeight:500}}>{b.isComingSoon?'출시 일정':'신청 기한'}</span>
            <span style={{fontSize:13,fontWeight:600,color:b.isComingSoon?'#7c3aed':days!==null&&days<=14&&days>=0?'#c2410c':'#374151'}}>{b.deadline}</span>
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>setDetailOpen(true)} style={{flex:1,padding:'11px 0',borderRadius:12,background:b.isComingSoon?'#ede9fe':'#f0fdf4',color:b.isComingSoon?'#7c3aed':'#15803d',fontSize:14,fontWeight:700,border:`1px solid ${b.isComingSoon?'#c4b5fd':'#bbf7d0'}`,cursor:'pointer',fontFamily:'inherit'}}>상세 보기</button>
        {b.isComingSoon?(
          <button disabled style={{flex:1,padding:'11px 0',borderRadius:12,background:'#e5e7eb',color:'#9ca3af',fontSize:14,fontWeight:700,border:'none',cursor:'not-allowed',fontFamily:'inherit'}}>🔜 출시 예정</button>
        ):(
          <a href={getBestApplyUrl(b.applyUrl,b.title,b.institution)} onClick={(e)=>{if(isYouthHousingDream){e.preventDefault();setBankModalOpen(true);}}} target="_blank" rel="noreferrer" style={{flex:1,padding:'11px 0',borderRadius:12,background:'#15803d',color:'#fff',fontSize:14,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(21,128,61,0.25)'}}>바로 신청</a>
        )}
      </div>
    </div>
    {detailOpen&&<BenefitDetail b={b} onClose={()=>setDetailOpen(false)} days={days} dl={dl}/>}
    {bankModalOpen&&<YouthHousingDreamBankModal onClose={()=>setBankModalOpen(false)}/>}
  </>);}

// ─── CalendarWidget ───────────────────────────────────────────────
function CalendarWidget({events}){const today=new Date();const[viewYear,setViewYear]=useState(today.getFullYear());const[viewMonth,setViewMonth]=useState(today.getMonth());const[selected,setSelected]=useState(null);const[notifStatus,setNotifStatus]=useState(()=>typeof Notification!=='undefined'?Notification.permission:'default');
const firstDay=new Date(viewYear,viewMonth,1).getDay();const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();const cells=[];for(let i=0;i<firstDay;i++)cells.push(null);for(let d=1;d<=daysInMonth;d++)cells.push(d);while(cells.length%7!==0)cells.push(null);
const evMap={};events.forEach(ev=>{const dl=parseDeadline(ev.deadline);if(!dl)return;const key=`${dl.getFullYear()}-${String(dl.getMonth()+1).padStart(2,'0')}-${String(dl.getDate()).padStart(2,'0')}`;if(!evMap[key])evMap[key]=[];evMap[key].push(ev);const warn=new Date(dl);warn.setDate(warn.getDate()-7);const wKey=`${warn.getFullYear()}-${String(warn.getMonth()+1).padStart(2,'0')}-${String(warn.getDate()).padStart(2,'0')}`;if(!evMap[wKey])evMap[wKey]=[];if(!evMap[wKey].find(x=>x._warn&&(x.id||x.action)===(ev.id||ev.action)))evMap[wKey].push({...ev,_warn:true});});
const getCellKey=d=>d?`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;const selectedKey=selected?`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(selected).padStart(2,'0')}`:null;const selectedEvents=selectedKey?evMap[selectedKey]||[]:[];
const requestNotif=async()=>{const p=await requestNotifPermission();setNotifStatus(p);if(p==='granted'){events.forEach(ev=>{const dl=parseDeadline(ev.deadline);if(!dl)return;const now=new Date();const s7=new Date(dl);s7.setDate(s7.getDate()-7);if(s7-now>0)setTimeout(()=>new Notification(`[네모혜] ${ev.title||ev.action} 마감 D-7`,{body:formatDate(dl)}),s7-now);if(dl-now>0)setTimeout(()=>new Notification(`[네모혜] ${ev.title||ev.action} 오늘 마감!`,{}),dl-now);});}};
const sendAll=()=>{const txt=buildKakaoText(events);copyToClip(txt,`${events.length}개 일정이 복사됐어요! 카카오톡 > 나에게 보내기에 붙여넣기 하세요.`);};
const upcoming=events.filter(ev=>{const d=daysLeft(parseDeadline(ev.deadline));return d!==null&&d>=0&&d<=30;}).sort((a,b)=>parseDeadline(a.deadline)-parseDeadline(b.deadline));
return(<div>
  {notifStatus!=='granted'&&(<div style={{background:'linear-gradient(135deg,#1a6b6b,#0d4f4f)',borderRadius:12,padding:'14px 18px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}><div><div style={{color:'#fff',fontWeight:700,fontSize:14}}>🔔 마감일 알림 받기</div><div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginTop:2}}>마감 7일 전·당일 브라우저 알림</div></div><button onClick={requestNotif} style={BP({padding:'8px 16px',fontSize:13,borderRadius:8,background:'#c9a84c',color:'#0d1117'})}>{notifStatus==='denied'?'알림 차단됨 (설정에서 허용)':'알림 허용하기'}</button></div>)}
  {notifStatus==='granted'&&(<div style={{background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,color:'#166534'}}>✅ 브라우저 알림이 활성화되어 있습니다.</div>)}
  <button onClick={sendAll} style={{width:'100%',marginBottom:14,background:'#FEE500',border:'none',borderRadius:12,padding:'13px 18px',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',color:'#3C1E1E',display:'flex',alignItems:'center',justifyContent:'center',gap:10}}><span style={{width:26,height:26,background:'rgba(0,0,0,0.08)',borderRadius:6,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:17}}>💬</span>카카오톡으로 전체 일정 받기</button>
  {upcoming.length>0&&(<div style={{marginBottom:16}}><div style={{fontSize:13,fontWeight:700,color:'#c94f1a',marginBottom:8}}>⚡ 30일 내 마감 임박</div>{upcoming.map((ev,i)=>{const dl=parseDeadline(ev.deadline);const d=daysLeft(dl);return(<div key={i} style={{background:d<=7?'#fee2e2':'#fef9c3',border:`1px solid ${d<=7?'#fca5a5':'#fde68a'}`,borderRadius:10,padding:'10px 14px',marginBottom:7,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}><div><div style={{fontSize:14,fontWeight:700}}>{ev.categoryIcon||ev.icon||'📌'} {ev.title||ev.action}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{ev.institution||ev.vendor||''}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:18,fontWeight:900,color:d<=7?'#c94f1a':'#854f0b'}}>D-{d}</div><div style={{fontSize:11,color:'#6b6560'}}>{formatDate(dl)}</div></div></div>);})}</div>)}
  <div style={{background:'#fff',border:'1px solid #d4cdc2',borderRadius:14,overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',background:'#0d1117'}}><button onClick={()=>{if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1);setSelected(null);}} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',borderRadius:7,width:30,height:30,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button><span style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',color:'#fff'}}>{viewYear}년 {MONTH_KR[viewMonth]}</span><button onClick={()=>{if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1);setSelected(null);}} style={{background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',borderRadius:7,width:30,height:30,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',background:'#faf7f2'}}>{DAY_KR.map((d,i)=><div key={d} style={{textAlign:'center',padding:'8px 0',fontSize:12,fontWeight:700,color:i===0?'#c94f1a':i===6?'#1a5080':'#6b6560'}}>{d}</div>)}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>{cells.map((d,i)=>{const key=getCellKey(d);const hasEv=key&&evMap[key]?.length>0;const isDeadline=key&&evMap[key]?.some(e=>!e._warn);const isWarn=key&&evMap[key]?.some(e=>e._warn);const isToday=key===todayKey;const isSel=d&&selected===d;const dow=i%7;return(<div key={i} onClick={()=>{if(d&&hasEv)setSelected(isSel?null:d);}} style={{minHeight:44,borderRight:'1px solid #f0ebe0',borderBottom:'1px solid #f0ebe0',padding:'6px 4px',cursor:hasEv?'pointer':'default',background:isSel?'#edf6f6':isToday?'#fdf5e8':'#fff'}}>{d&&<div style={{width:24,height:24,borderRadius:'50%',background:isToday?'#0d1117':'transparent',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',fontSize:13,fontWeight:isToday?700:400,color:isToday?'#fff':dow===0?'#c94f1a':dow===6?'#1a5080':'#374151'}}>{d}</div>}{hasEv&&<div style={{display:'flex',justifyContent:'center',gap:2,marginTop:2}}>{isDeadline&&<div style={{width:5,height:5,borderRadius:'50%',background:'#c94f1a'}}/>}{isWarn&&<div style={{width:5,height:5,borderRadius:'50%',background:'#c9a84c'}}/>}</div>}</div>);})}</div>
  </div>
  {selectedEvents.length>0&&(<div style={{marginTop:12}}><div style={{fontSize:12,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{viewMonth+1}월 {selected}일 일정</div>{selectedEvents.map((ev,i)=>(<div key={i} style={{background:ev._warn?'#fef9c3':'#fee2e2',border:`1px solid ${ev._warn?'#fde68a':'#fca5a5'}`,borderRadius:10,padding:'12px 14px',marginBottom:7}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}><div><div style={{fontWeight:700,fontSize:14,color:'#0d1117',marginBottom:3}}>{ev._warn?'⚠️ D-7 준비 알림':'🔴 신청 마감일'} — {ev.title||ev.action}</div><div style={{fontSize:12,color:'#6b6560'}}>{ev.institution||ev.vendor||''}</div>{(ev.requiredDocuments||ev.documents||[]).length>0&&<div style={{fontSize:12,color:'#374151',marginTop:4}}>📂 {(ev.requiredDocuments||ev.documents).join(', ')}</div>}</div><div style={{display:'flex',gap:5,flexShrink:0}}><button onClick={()=>openGoogleCalendar(ev)} style={BP({padding:'6px 10px',fontSize:12,borderRadius:6,background:'#0d1117'})}>📱</button><button onClick={()=>sendKakaoMe(ev)} style={BP({padding:'6px 10px',fontSize:12,borderRadius:6,background:'#FEE500',color:'#3C1E1E'})}>💬</button></div></div></div>))}</div>)}
</div>);}

// ─── LandingScreen ────────────────────────────────────────────────
function LandingScreen({onStartAuth}){
  const [displayNum, setDisplayNum] = useState(0);
  useEffect(()=>{
    const target=1040000, dur=2000, start=Date.now();
    const ease=t=>1-Math.pow(1-t,3);
    const tick=()=>{
      const p=Math.min((Date.now()-start)/dur,1);
      setDisplayNum(Math.floor(ease(p)*target));
      if(p<1)requestAnimationFrame(tick);
    };
    const id=setTimeout(()=>requestAnimationFrame(tick),300);
    return()=>clearTimeout(id);
  },[]);

  const glassCard={
    background:'linear-gradient(135deg,rgba(249,250,251,0.9) 0%,rgba(243,244,246,0.8) 100%)',
    backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',
    border:'1px solid rgba(229,231,235,0.8)',
    boxShadow:'0 10px 25px -5px rgba(0,0,0,0.05),0 8px 10px -6px rgba(0,0,0,0.05)',
  };

  return(
    <div style={{width:'100%',height:'100vh',background:'#fff',fontFamily:"'Noto Sans KR','Inter',sans-serif",overflow:'hidden',position:'relative',display:'flex',flexDirection:'column'}}>
      <style>{`
        @keyframes landFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes landFloatD{0%,100%{transform:translateY(0)}50%{transform:translateY(14px)}}
        @keyframes landPulse{0%,100%{opacity:0.5}50%{opacity:0.8}}
        @keyframes shimmer{100%{transform:translateX(200%) skewX(-20deg)}}
        .land-float{animation:landFloat 6s ease-in-out infinite}
        .land-float-d{animation:landFloatD 7s ease-in-out infinite}
        .land-blob{animation:landPulse 4s cubic-bezier(0.4,0,0.6,1) infinite}
        .land-cta:active{transform:translateY(2px);box-shadow:0 5px 10px rgba(16,185,129,0.2)!important}
        .land-cta .shimmer{position:absolute;inset:0;transform:translateX(-100%) skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);transition:none}
        .land-cta:hover .shimmer{animation:shimmer 1.5s infinite}
      `}</style>

      {/* ── 배경 블롭 ── */}
      <div className="land-blob" style={{position:'absolute',top:'-10%',left:'-20%',width:'80%',height:'40%',background:'rgba(209,250,229,0.5)',borderRadius:'50%',mixBlendMode:'multiply',filter:'blur(80px)',pointerEvents:'none',zIndex:0}}/>
      <div style={{position:'absolute',bottom:'10%',right:'-10%',width:'70%',height:'50%',background:'rgba(240,253,244,0.6)',borderRadius:'50%',mixBlendMode:'multiply',filter:'blur(100px)',pointerEvents:'none',zIndex:0}}/>

      {/* ── 스크롤 가능한 콘텐츠 영역 ── */}
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>

        {/* ── 헤더 ── */}
        <header style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'0 24px',paddingTop:'calc(28px + env(safe-area-inset-top,0px))',paddingBottom:8,position:'relative',zIndex:20}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:6}}>
            <BrandLogo size={44} style={{flexShrink:0,filter:'drop-shadow(0 3px 8px rgba(0,0,0,0.12))'}}/>
            <span style={{fontFamily:'serif',fontSize:'1.7rem',fontWeight:900,color:'#111827',letterSpacing:-1}}>네모<span style={{background:'linear-gradient(135deg,#22C55E 0%,#4ADE80 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>혜</span></span>
          </div>
          <p style={{color:'#9ca3af',fontSize:12,letterSpacing:0.3,textAlign:'center',margin:0}}>내게 맞는 모든 혜택을 한 번에</p>
        </header>

        {/* ── 히어로 숫자 ── */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 24px 0',position:'relative',zIndex:20}}>
          <p style={{color:'#6b7280',fontSize:11,fontWeight:700,letterSpacing:0.8,marginBottom:6,textAlign:'center'}}>네모혜로 받을 수 있는 최대 혜택</p>
          <div style={{display:'flex',alignItems:'flex-start',gap:2}}>
            <span style={{fontSize:'1.1rem',fontWeight:700,color:'#059669',marginTop:5}}>₩</span>
            <span style={{fontSize:'2.4rem',fontWeight:800,letterSpacing:-2,color:'#111827',lineHeight:1}}>{displayNum.toLocaleString()}</span>
          </div>
          <div style={{display:'inline-flex',alignItems:'center',gap:5,background:'#f0fdf4',border:'1px solid #dcfce7',borderRadius:999,padding:'4px 10px',marginTop:20}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13 7 19 7 19 13"/><polyline points="19 7 11 15 7 11 1 17"/>
            </svg>
            <span style={{fontSize:10,fontWeight:700,color:'#065f46'}}>사용자들의 월 수입 15% 증가</span>
          </div>
        </div>

        {/* ── 카드 영역 ── */}
        <div style={{position:'relative',flex:1,width:'100%',zIndex:10,marginTop:16,minHeight:280}}>

          {/* 메인 글래스 카드 */}
          <div style={{...glassCard,position:'absolute',left:20,right:20,top:16,borderRadius:20,padding:16,zIndex:20}}>
            {/* 코인 플로팅 */}
            <div className="land-float" style={{
              position:'absolute',right:-10,top:-26,width:52,height:52,borderRadius:'50%',zIndex:30,
              background:'linear-gradient(135deg,#fde68a 0%,#fbbf24 50%,#f59e0b 100%)',
              boxShadow:'inset -3px -3px 6px rgba(0,0,0,0.15),inset 3px 3px 6px rgba(255,255,255,0.5),0 8px 16px rgba(251,191,36,0.3)',
              border:'1px solid rgba(251,191,36,0.8)',
              display:'flex',alignItems:'center',justifyContent:'center',
            }}>
              <span style={{fontSize:20,fontWeight:900,color:'rgba(255,255,255,0.95)',textShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>₩</span>
            </div>

            {/* 카드 헤더 */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:'#f0fdf4',border:'1px solid #dcfce7',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div>
                  <div style={{fontWeight:600,color:'#1f2937',fontSize:13}}>정부 &amp; 지자체 혜택</div>
                  <div style={{fontSize:11,color:'#9ca3af'}}>청년지원 혜택</div>
                </div>
              </div>
              <span style={{padding:'3px 7px',background:'#dcfce7',color:'#15803d',fontSize:9,fontWeight:700,borderRadius:4,textTransform:'uppercase',letterSpacing:1}}>사용가능</span>
            </div>

            {/* 혜택 리스트 */}
            {[
              {label:'청년월세지원',val:'월+₩500,000'},
              {label:'미취업청년수당',val:'월+₩500,000'},
              {label:'결혼지원금',val:'+₩1,000,000'},
            ].map((item,i,arr)=>(
              <div key={item.label}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1px 0'}}>
                  <span style={{fontSize:12,color:'#4b5563'}}>{item.label}</span>
                  <span style={{fontSize:12,fontWeight:600,color:'#111827'}}>{item.val}</span>
                </div>
                {i<arr.length-1&&<div style={{height:1,background:'linear-gradient(90deg,transparent,#e5e7eb,transparent)',margin:'7px 0'}}/>}
              </div>
            ))}
          </div>

          {/* 집 아이콘 (좌하단 플로팅) */}
          <div className="land-float-d" style={{
            position:'absolute',left:14,top:182,width:52,height:52,borderRadius:14,zIndex:30,
            background:'linear-gradient(135deg,#10b981 0%,#059669 50%,#064e3b 100%)',
            boxShadow:'inset -3px -3px 6px rgba(0,0,0,0.2),inset 3px 3px 6px rgba(255,255,255,0.3),0 8px 16px rgba(16,185,129,0.2)',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6"/>
            </svg>
          </div>

          {/* 미니 바 차트 카드 (우하단 플로팅) */}
          <div className="land-float" style={{...glassCard,position:'absolute',right:20,top:192,width:120,borderRadius:14,padding:10,zIndex:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:11,color:'#9ca3af'}}>나의 혜택</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:3,height:26,marginTop:6}}>
              {[{h:'40%',bg:'#e5e7eb'},{h:'60%',bg:'#d1d5db'},{h:'80%',bg:'#bbf7d0'},{h:'100%',bg:'#10b981'}].map((b,i)=>(
                <div key={i} style={{flex:1,height:b.h,background:b.bg,borderRadius:'2px 2px 0 0'}}/>
              ))}
            </div>
          </div>
        </div>

      </div>{/* 스크롤 끝 */}

      {/* ── 하단 CTA (화면 하단 고정) ── */}
      <div style={{flexShrink:0,width:'100%',paddingTop:0,paddingLeft:20,paddingRight:20,paddingBottom:'calc(20px + env(safe-area-inset-bottom,0px))',background:'#fff',zIndex:30}}>
        <button onClick={onStartAuth} className="land-cta" style={{
          width:'100%',
          background:'linear-gradient(135deg,#10b981 0%,#059669 100%)',
          boxShadow:'0 8px 16px rgba(16,185,129,0.25),inset 0 2px 0 rgba(255,255,255,0.2)',
          color:'#fff',fontWeight:700,fontSize:16,borderRadius:14,
          padding:'14px 0',border:'none',cursor:'pointer',fontFamily:'inherit',
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          position:'relative',overflow:'hidden',transition:'all 0.15s',
        }}>
          <span className="shimmer"/>
          <span>나의 혜택 받기</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <p style={{textAlign:'center',fontSize:11,color:'#9ca3af',marginTop:10,fontWeight:500}}>1초만에 회원가입하고 혜택 누리기</p>
      </div>
    </div>
  );
}

// ─── AuthScreen ───────────────────────────────────────────────────
function AuthScreen({onLogin}){
  const[step,setStep]=useState('social'); // 'social'|'admin'
  const[adminId,setAdminId]=useState('');
  const[adminPw,setAdminPw]=useState('');
  const[msg,setMsg]=useState({type:'',text:''});
  const[busy,setBusy]=useState(false);

  const showErr=t=>setMsg({type:'err',text:t});
  const clearMsg=()=>setMsg({type:'',text:''});

  const doKakaoLogin=()=>{
    try{ startKakaoLogin(); }
    catch(e){ showErr(e.message); }
  };
  const doNaverLogin=()=>{
    try{ startNaverLogin(); }
    catch(e){ showErr(e.message); }
  };
  const doAdminLogin=()=>{
    if(adminId===ADMIN_ID&&adminPw===ADMIN_PW){
      onLogin({name:'관리자',phone:ADMIN_ID,isAdmin:true,createdAt:new Date().toISOString()});
    }else{showErr('관리자 ID 또는 비밀번호가 틀렸습니다.');}
  };

return(
<div style={{minHeight:'100vh',background:`linear-gradient(160deg,${C.dark} 0%,#0f2744 55%,#0d1117 100%)`,display:'flex',flexDirection:'column',padding:'env(safe-area-inset-top,0px) 0 0'}}>
  {/* 상단 브랜드 영역 */}
  <div style={{flex:'0 0 auto',padding:'56px 32px 40px',textAlign:'center'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,marginBottom:14}}>
      <BrandLogo size={56} style={{flexShrink:0,filter:'drop-shadow(0 6px 20px rgba(0,0,0,0.25))'}}/>
      <span style={{fontFamily:'serif',fontSize:'2.8rem',fontWeight:900,color:'#fff',letterSpacing:-1.5}}>네모<span style={{background:'linear-gradient(135deg,#22C55E 0%,#4ADE80 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>혜</span></span>
    </div>
    <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,letterSpacing:0.5,margin:0}}>내게 맞는 모든 혜택을 한 번에</p>
  </div>

  {/* 카드 */}
  <div style={{flex:1,background:C.bg,borderRadius:'28px 28px 0 0',padding:'36px 24px 48px',overflow:'auto'}}>
    {step==='social'&&(<>
      <h2 style={{fontSize:22,fontWeight:800,color:C.text1,marginBottom:6,textAlign:'center'}}>간편 로그인</h2>
      <p style={{fontSize:14,color:C.text2,marginBottom:32,textAlign:'center'}}>소셜 계정으로 1초 만에 시작하세요</p>

      {/* 카카오 로그인 */}
      <button
        onClick={doKakaoLogin}
        disabled={busy}
        style={{
          width:'100%',padding:'16px',border:'none',borderRadius:14,
          fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
          background:'#FEE500',color:'#191919',
          display:'flex',alignItems:'center',justifyContent:'center',gap:10,
          marginBottom:12,boxSizing:'border-box',
          boxShadow:'0 2px 8px rgba(254,229,0,0.35)',
          opacity:busy?0.7:1,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3C6.477 3 2 6.697 2 11.253c0 2.93 1.87 5.504 4.694 6.97L5.6 21.47a.4.4 0 0 0 .578.44l4.43-2.954A11.5 11.5 0 0 0 12 19.506C17.523 19.506 22 15.81 22 11.253 22 6.697 17.523 3 12 3z" fill="#191919"/>
        </svg>
        카카오로 시작하기
      </button>

      {/* 네이버 로그인 */}
      <button
        onClick={doNaverLogin}
        disabled={busy}
        style={{
          width:'100%',padding:'16px',border:'none',borderRadius:14,
          fontSize:16,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
          background:'#03C75A',color:'#fff',
          display:'flex',alignItems:'center',justifyContent:'center',gap:10,
          marginBottom:32,boxSizing:'border-box',
          boxShadow:'0 2px 8px rgba(3,199,90,0.35)',
          opacity:busy?0.7:1,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M16.273 12.845 7.376 3H3v18h7.727V11.155L19.624 21H24V3h-7.727v9.845z" fill="#fff"/>
        </svg>
        네이버로 시작하기
      </button>

      {msg.text&&<div style={{background:'#FEE2E2',borderRadius:10,padding:'12px 14px',fontSize:13,color:C.err,marginBottom:20,textAlign:'center'}}>{msg.text}</div>}

      <div style={{background:'#f8f9fa',borderRadius:12,padding:'14px 16px',fontSize:12,color:'#6b7280',lineHeight:1.7,marginBottom:24}}>
        <strong style={{color:'#374151'}}>📌 로그인 안내</strong><br/>
        카카오 또는 네이버 계정으로 가입·로그인이 동시에 처리됩니다.<br/>
        별도 비밀번호 없이 소셜 계정으로 안전하게 이용하세요.
      </div>

      <div style={{textAlign:'center',paddingTop:16,borderTop:`1px solid ${C.border}`}}>
        <button onClick={()=>{setStep('admin');clearMsg();}} style={{background:'none',border:'none',color:C.text3,fontSize:12,cursor:'pointer',fontFamily:'inherit',padding:'4px 8px'}}>관리자 로그인</button>
      </div>
    </>)}

    {step==='admin'&&(<>
      <h2 style={{fontSize:20,fontWeight:800,color:C.text1,marginBottom:6}}>⚙️ 관리자 로그인</h2>
      <p style={{fontSize:14,color:C.text2,marginBottom:22}}>관리자 전용 페이지입니다</p>
      <div style={{marginBottom:14}}><label style={LS}>관리자 ID</label><input value={adminId} onChange={e=>setAdminId(e.target.value)} style={IS}/></div>
      <div style={{marginBottom:20}}><label style={LS}>비밀번호</label><input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} style={IS} onKeyDown={e=>e.key==='Enter'&&doAdminLogin()}/></div>
      {msg.text&&<div style={{background:'#FEE2E2',borderRadius:10,padding:'11px 14px',fontSize:13.5,color:C.err,marginBottom:16}}>{msg.text}</div>}
      <button onClick={doAdminLogin} style={BP({width:'100%',padding:'15px',fontSize:16,borderRadius:12})}>로그인</button>
      <button onClick={()=>{setStep('social');clearMsg();setAdminId('');setAdminPw('');}} style={{width:'100%',marginTop:12,background:'none',border:'none',color:C.text3,fontSize:13.5,cursor:'pointer',fontFamily:'inherit',padding:'8px 0'}}>← 소셜 로그인으로</button>
    </>)}
  </div>
</div>);}

// ─── AnalyzeTab ───────────────────────────────────────────────────

// ── 소득 등급 (1=최저, 8=최고) ─────────────────────────────────────
const INCOME_RANK_MAP = {
  '기초생활수급자': 1,
  '월 50만원 미만':  2,
  '월 50~100만원':   3,
  '월 100~200만원':  4,
  '월 200~300만원':  5,
  '월 300~500만원':  6,
  '월 500~700만원':  7,
  '월 700만원 이상': 8,
};

/**
 * DB에서 가져온 scraped 혜택이 유저 프로필에 적합한지 판단합니다.
 * "정보 없음" 또는 판단 불가인 경우 포함으로 처리합니다.
 */
function isDbBenefitEligible(benefit, { age, income, extras = [] }) {
  const target   = String(benefit.지원대상 || '').trim();
  const ageNum   = parseInt(age, 10) || 30;
  const rank     = INCOME_RANK_MAP[income] ?? 5;
  const extraStr = extras.join(',');
  const hasExtra = (kw) => extraStr.includes(kw);
  const hasNearPoverty = rank <= 2 || hasExtra('기초생활수급자 또는 차상위계층');

  // 판단 불가 → 포함
  if (!target || target === '정보 없음') return true;
  const t = target;

  // 전체 국민 대상 → 항상 포함
  if (/전국민|누구나|모든\s*국민|전체\s*국민/.test(t)) return true;

  // ── 소득 기준 ──────────────────────────────────────────────────
  // "기초생활수급자" 단독 → 기초수급자만
  if (/기초생활수급자|기초수급자/.test(t) && !/차상위/.test(t) && !/또는/.test(t)) {
    if (rank !== 1) return false;
  }
  // "차상위계층" 포함 → rank 3 이하 또는 차상위 선택자만
  if (/차상위/.test(t)) {
    if (!hasNearPoverty && rank > 3) return false;
  }
  // "저소득" 포함 → rank 5 이하
  if (/저소득/.test(t)) {
    if (rank > 5) return false;
  }

  // ── 나이 기준 ─────────────────────────────────────────────────
  // "청년" 키워드
  if (/청년/.test(t)) {
    if (ageNum < 19 || ageNum > 39) return false;
  }
  // 구체적 나이 범위 "만 19~34세" 등
  const ageRange = t.match(/만\s*(\d+)\s*[~～]\s*(\d+)\s*세/);
  if (ageRange) {
    const lo = parseInt(ageRange[1], 10), hi = parseInt(ageRange[2], 10);
    if (ageNum < lo || ageNum > hi) return false;
  }
  // "X세 이상"
  const ageAbove = t.match(/(\d+)\s*세\s*이상/);
  if (ageAbove && parseInt(ageAbove[1], 10) >= 40) {
    if (ageNum < parseInt(ageAbove[1], 10)) return false;
  }
  // "X세 이하"
  const ageBelow = t.match(/(\d+)\s*세\s*이하/);
  if (ageBelow) {
    if (ageNum > parseInt(ageBelow[1], 10)) return false;
  }
  // 노인 혜택
  if (/노인|어르신|65세/.test(t)) {
    if (ageNum < 65) return false;
  }

  // ── 특수 상황 기준 ────────────────────────────────────────────
  if (/임산부/.test(t) && !hasExtra('임산부') && !hasExtra('출산')) return false;
  if (/장애인/.test(t) && !hasExtra('장애인')) return false;
  if (/한부모/.test(t) && !hasExtra('한부모')) return false;
  if (/다자녀/.test(t) && !hasExtra('다자녀')) return false;
  if (/국가유공자/.test(t) && !hasExtra('국가유공자')) return false;

  return true;
}

// ─── 혜택 분석 프롬프트 빌더 ─────────────────────────────────────
function buildBenefitPrompt({age,gender,job,income,address,extra,today,mode='full',bokjiroData=null,gov24Data=null,ggData=null,seoulData=null,youthData=null,youthContentData=null}){
  const isYouth = extra.includes('청년');
  const isSME   = extra.includes('자영업자/소상공인') || extra.includes('소상공인') || job.includes('자영업');
  const isSeoul = address.includes('서울');

  // ── 신청자격 제한 지침 — Claude가 맞지 않는 혜택을 절대 포함하지 않도록 ──
  const incomeRankVal = INCOME_RANK_MAP[income] ?? 5;
  const ageNum2       = parseInt(age, 10) || 30;
  const exclusions    = [];
  if (incomeRankVal > 1) exclusions.push('기초생활수급자 전용 혜택');
  if (incomeRankVal > 3 && !extra.includes('차상위')) exclusions.push('차상위계층 전용 혜택');
  if (incomeRankVal > 5) exclusions.push('저소득층 전용 혜택');
  if (ageNum2 < 19 || ageNum2 > 39) exclusions.push('청년(만 19~39세) 전용 혜택');
  if (ageNum2 < 65) exclusions.push('노인(65세 이상) 전용 혜택');
  if (!extra.includes('임산부')) exclusions.push('임산부 전용 혜택');
  if (!extra.includes('장애인')) exclusions.push('장애인 전용 혜택');
  if (!extra.includes('한부모')) exclusions.push('한부모 전용 혜택');
  const ELIGIBILITY_CONSTRAINT = exclusions.length > 0
    ? `⚠️ 신청자격 엄수 — 아래 항목은 이 사람이 해당되지 않으므로 절대 포함 금지: ${exclusions.join(' / ')}`
    : '';

  // 핵심 URL만 포함 (나머지는 클라이언트 getBestApplyUrl 처리)
  const URL_GUIDE=`applyUrl: 신청 직접 페이지만. 복지로=https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do, 정부24=https://www.gov.kr/portal/serviceList, 고용24=https://www.work.go.kr/jobcenter/main.do, 건강보험=https://www.nhis.or.kr/nhis/policy/wbhada02800m01.do, 주택도시기금=https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp, 소상공인정책자금=https://ols.semas.or.kr/ols/man/SMAN010M/page.do${isSeoul?', 서울청년수당=https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=V202600005, 서울탄생육아=https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do':''}`;
  const SCHEMA=`{"id":숫자,"source":"정부복지|지자체|금융/은행|공공기관|기업/협회|민간/NGO 중 택1","sourceIcon":"이모지","category":"주거|의료|금융|교육|고용|보육|노인|장애|청년|소상공인|세금|통신|문화|식품|기타 중 택1","categoryIcon":"이모지","scope":"전국 또는 지역명","isUrgent":false,"isHidden":false,"title":"혜택명","institution":"기관명","description":"1문장 설명","amount":"금액","deadline":"YYYY년 MM월 DD일 또는 수시 신청","requiredDocuments":["서류1","서류2"],"howToApply":"방법","applyUrl":"https://..."}`;

  // ── 청년 특화 섹션 ──
  const YOUTH_SECTION = isYouth ? `
★★ 청년 특화 — 반드시 포함:
[전국] 청년희망적금, 국민취업지원제도, 청년내일저축계좌, 청년내일채움공제, 국가장학금, 청년 버팀목전세자금, 청년 월세 지원(LH), K-디지털 훈련, 청년일자리도약장려금
${isSeoul ? `[서울] 서울청년수당(월50만원), 희망두배청년통장, 청년취업사관학교새싹, 청년임차보증금이자지원, 서울청년문화패스` : ''}` : '';

  // ── 소상공인 특화 섹션 ──
  const SME_SECTION = isSME ? `
★★ 소상공인 특화 — 반드시 포함:
소상공인 정책자금 직접대출, 소상공인 대환대출, 소공인특화자금, 소상공인 온라인 무료교육, 소상공인 경영안정 바우처, 노란우산공제, 소상공인 고용보험료 지원` : '';

  if(mode==='hidden'){
    return `대한민국 복지 및 금융 전문가. 아래 사람의 숨겨진 혜택(Hidden Benefits)을 발굴하세요.
[정보] ${age}세/${gender}/${job}/${income}/${address}/추가:${extra}/${today}
${ELIGIBILITY_CONSTRAINT}

### 💡 발굴 대상 (반드시 포함할 것)
1. **은행/금융**: 시중 은행(국민, 신한, 우리, 농협 등)의 청년 우대 고금리 적금, 대출 이자 감면, 금융권 사회공헌 대출
2. **생활/통신**: 통신3사 취약계층·청년 요금 감면, 에너지바우처, 건강보험 환급금(본인부담상한제)
3. **민간 재단**: 아산재단, 카카오임팩트 등 민간 재단 장학금 및 청년 지원금
4. **연말정산/세금**: 놓치기 쉬운 세액 공제 항목 및 세금 환급 정보

순수 JSON만: {"benefits":[${SCHEMA}]}
6~8개 발굴. isHidden:true. ${URL_GUIDE}`;
  }

  // API 데이터: 핵심 항목만 압축 전달
  const BOKJIRO_SECTION = bokjiroData?.length > 0
    ? `\n[복지로API] ${bokjiroData.slice(0,12).map(b=>`${b.title}${b.summary?' ('+b.summary.slice(0,40)+')':''}`).join(' / ')}\n`
    : '';
  const GOV24_SECTION = gov24Data?.length > 0
    ? `\n[정부24API] ${gov24Data.slice(0,12).map(b=>`${b.title}${b.support?' ('+b.support.slice(0,35)+')':''}`).join(' / ')}\n`
    : '';
  const GG_SECTION = ggData?.length > 0
    ? `\n[경기도API] ${ggData.slice(0,10).map(b=>b.title).join(' / ')}\n`
    : '';
  const SEOUL_SECTION = seoulData?.length > 0
    ? `\n[서울API] ${seoulData.slice(0,10).map(b=>`${b.title}(${b.status})`).join(' / ')}\n`
    : '';
  const YOUTH_SECTION_API = youthData?.length > 0
    ? `\n[온통청년정책API] ${youthData.slice(0,15).map(b=>`${b.title}${b.support?' ('+b.support.slice(0,40)+')':''}`).join(' / ')}\n`
    : '';
  const YOUTH_CONTENT_SECTION = youthContentData?.length > 0
    ? `\n[온통청년콘텐츠API] ${youthContentData.slice(0,10).map(c=>`${c.title}${c.type?' ['+c.type+']':''}`).join(' / ')}\n`
    : '';

  return `대한민국 복지·혜택 전문가. 아래 사람의 맞춤 혜택을 분석하세요.
[정보] ${age}세/${gender}/${job}/${income}/${address}/추가:${extra}/${today}
${ELIGIBILITY_CONSTRAINT}
${BOKJIRO_SECTION}${GOV24_SECTION}${GG_SECTION}${SEOUL_SECTION}${YOUTH_SECTION_API}${YOUTH_CONTENT_SECTION}${YOUTH_SECTION}${SME_SECTION}
출처별 필수 포함: 정부복지(복지로·정부24·고용24·건강보험·국민연금), 지자체(${address} 특화사업${isSeoul?'·서울청년몽땅·서울복지포털·서울탄생육아':''}), 금융(주택도시기금·서민금융), 에너지바우처·통신감면, 세금환급(근로장려금·자녀장려금), 주거(LH·SH·버팀목전세), 숨겨진혜택 3개이상(isHidden:true)
순수 JSON만 (코드블록 없이):
{"summary":{"totalBenefits":숫자,"estimatedMonthlyBenefit":"금액범위","topPriority":"혜택명","hiddenCount":숫자},"benefits":[${SCHEMA}]}
10~14개. 실제 존재하는 혜택만. ${URL_GUIDE}`;
}

// ─── 공공 API 원시 데이터 → BCard 형식 변환 ──────────────────────
function mapPublicApiToCards({bokjiroData=[], gov24Data=[], youthData=[], address='', profile={}}) {
  const {age='', income='', extras=[]} = profile;
  const ageNum = parseInt(age, 10) || 30;
  const rank   = INCOME_RANK_MAP[income] ?? 5;
  const hasExtra = (kw) => extras.some(e => e.includes(kw));

  // ── 복지로 생애주기 코드 (사용자 나이 기반)
  const userLifeCodes = new Set();
  if      (ageNum < 8)  userLifeCodes.add('001');
  else if (ageNum < 14) userLifeCodes.add('002');
  else if (ageNum < 19) userLifeCodes.add('003');
  else if (ageNum < 35) userLifeCodes.add('004');
  else if (ageNum < 65) userLifeCodes.add('005');
  else                  userLifeCodes.add('006');
  if (hasExtra('임산부') || hasExtra('출산')) userLifeCodes.add('007');

  // 복지로 코드 기반 자격 필터
  const isBokjiroEligible = (b) => {
    // 생애주기 코드 확인
    const lifeArr = b.lifeArray || '';
    if (lifeArr) {
      const codes = lifeArr.split(',').map(s => s.trim()).filter(Boolean);
      if (codes.length > 0 && !codes.some(c => userLifeCodes.has(c))) return false;
    }
    // 대상자 특성 코드 확인 (020=다자녀, 030=보훈, 040=장애인, 050=저소득, 060=한부모)
    const trgCode = b.target || '';
    if (trgCode) {
      const codes = trgCode.split(',').map(s => s.trim()).filter(Boolean);
      const EXCLUSIVE = {
        '010': () => hasExtra('다문화') || hasExtra('탈북'),
        '020': () => hasExtra('다자녀'),
        '030': () => hasExtra('보훈') || hasExtra('유공자'),
        '040': () => hasExtra('장애인'),
        '050': () => rank <= 3 || hasExtra('기초') || hasExtra('차상위') || hasExtra('저소득'),
        '060': () => hasExtra('한부모'),
      };
      if (codes.length > 0) {
        // 코드 중 하나라도 해당되면 포함, 모두 해당 안 되면 제외
        const anyMatch = codes.some(c => EXCLUSIVE[c] ? EXCLUSIVE[c]() : true);
        if (!anyMatch) return false;
      }
    }
    return true;
  };

  // 텍스트 기반 자격 필터 (gov24 / 온통청년 공통)
  const isTextEligible = (targetText) => {
    const t = String(targetText || '').trim();
    if (!t || t === '정보 없음') return true;
    if (/전국민|누구나|모든\s*국민|전체\s*국민/.test(t)) return true;
    // 소득 기준
    if (/기초생활수급자|기초수급자/.test(t) && !/차상위/.test(t) && !/또는/.test(t)) {
      if (rank !== 1) return false;
    }
    if (/차상위/.test(t)) {
      if (rank > 3 && !hasExtra('기초') && !hasExtra('차상위')) return false;
    }
    if (/저소득/.test(t) && rank > 5) return false;
    // 나이 기준
    if (/청년/.test(t) && (ageNum < 19 || ageNum > 39)) return false;
    const ageRange = t.match(/만\s*(\d+)\s*[~～]\s*(\d+)\s*세/);
    if (ageRange) {
      const lo = parseInt(ageRange[1], 10), hi = parseInt(ageRange[2], 10);
      if (ageNum < lo || ageNum > hi) return false;
    }
    const ageAbove = t.match(/(\d+)\s*세\s*이상/);
    if (ageAbove && parseInt(ageAbove[1], 10) >= 40 && ageNum < parseInt(ageAbove[1], 10)) return false;
    const ageBelow = t.match(/(\d+)\s*세\s*이하/);
    if (ageBelow && ageNum > parseInt(ageBelow[1], 10)) return false;
    if (/노인|어르신|65세/.test(t) && ageNum < 65) return false;
    // 특수 상황
    if (/임산부/.test(t) && !hasExtra('임산부') && !hasExtra('출산')) return false;
    if (/장애인/.test(t) && !hasExtra('장애인')) return false;
    if (/한부모/.test(t) && !hasExtra('한부모')) return false;
    if (/다자녀/.test(t) && !hasExtra('다자녀')) return false;
    if (/국가유공자/.test(t) && !hasExtra('국가유공자') && !hasExtra('보훈')) return false;
    return true;
  };

  const cards = [];
  const seen  = new Set();
  const ts    = Date.now();

  // 복지로 API — 코드 기반 필터 적용
  bokjiroData.filter(isBokjiroEligible).slice(0, 25).forEach((b, i) => {
    const t = (b.title || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    cards.push({
      id: `bokjiro-${b.servId || i}-${ts}`,
      source: '정부복지', sourceIcon: '🏛️',
      category: '복지', categoryIcon: '🏛️',
      scope: '전국', isUrgent: false, isHidden: false, isComingSoon: false,
      title: t,
      institution: b.ministry || '보건복지부',
      description: b.summary || '',
      amount: b.method && b.cycle ? `${b.cycle} · ${b.method}` : (b.summary?.slice(0, 50) || '상세 페이지 확인'),
      deadline: '연중 상시',
      requiredDocuments: [],
      howToApply: b.onlineApp === 'Y' ? '복지로 홈페이지 온라인 신청 가능' : '복지로 홈페이지 또는 관할 주민센터 방문',
      applyUrl: b.detailUrl || 'https://www.bokjiro.go.kr',
      _origin: 'static',
    });
  });

  // 정부24 API — 지원대상 텍스트 필터 적용
  gov24Data.filter(b => isTextEligible(b.target)).slice(0, 25).forEach((b, i) => {
    const t = (b.title || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    cards.push({
      id: `gov24-${i}-${ts}`,
      source: '정부복지', sourceIcon: '🏛️',
      category: '공공서비스', categoryIcon: '🏢',
      scope: '전국', isUrgent: false, isHidden: false, isComingSoon: false,
      title: t,
      institution: b.ministry || '행정안전부',
      description: b.summary || b.support || '',
      amount: b.support || '상세 페이지 확인',
      deadline: b.applyDeadline || '연중 상시',
      requiredDocuments: [],
      howToApply: b.applyMethod || '정부24 홈페이지 온라인 신청',
      applyUrl: b.applyUrl || 'https://www.gov.kr/portal/serviceList',
      _origin: 'static',
    });
  });

  // 온통청년 정책 API — 지원대상 텍스트 필터 적용
  youthData.filter(b => isTextEligible(b.target)).slice(0, 20).forEach((b, i) => {
    const t = (b.title || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    cards.push({
      id: `youth-${b.plcyNo || i}-${ts}`,
      source: '청년정책', sourceIcon: '🌱',
      category: '청년', categoryIcon: '🌱',
      scope: b.region || '전국', isUrgent: false, isHidden: false, isComingSoon: false,
      title: t,
      institution: '청년정책조정위원회',
      description: b.support || '',
      amount: b.support?.slice(0, 60) || '상세 페이지 확인',
      deadline: b.period || '연중 상시',
      requiredDocuments: [],
      howToApply: b.method || '온통청년 포털 신청',
      applyUrl: b.url || 'https://www.youthcenter.go.kr',
      _origin: 'static',
    });
  });

  return cards;
}

function AnalyzeTab({user,onSaved,onResultsReady}){
  const[age,setAge]=useState('');const[gender,setGender]=useState('');const[job,setJob]=useState('');const[income,setIncome]=useState('');const[address,setAddress]=useState('');const[extras,setExtras]=useState([]);
  const[loading,setLoading]=useState(false);const[step,setStep]=useState(0);const[results,setResults]=useState(null);const[err,setErr]=useState('');const[savedIds,setSavedIds]=useState(new Set());const rRef=useRef();
  const[analyzedAt,setAnalyzedAt]=useState(null);
  const[dbCollectedAt,setDbCollectedAt]=useState(null);
  const[hiddenLoading,setHiddenLoading]=useState(false);const[hiddenResults,setHiddenResults]=useState(null);
  const[filterSources,setFilterSources]=useState(new Set());
  const[sortOrder,setSortOrder]=useState('useful'); // 'useful'=정부·공공 우선 | 'latest'=AI수집 우선
  // ── 여행가는 달 데이터
  const[travelBenefits,setTravelBenefits]=useState(null);
  const[travelLoading,setTravelLoading]=useState(false);
  // ── 전국문화축제 데이터
  const[festivalList,setFestivalList]=useState(null);
  const[festivalLoading,setFestivalLoading]=useState(false);
  const toggleFilter=s=>setFilterSources(prev=>{const n=new Set(prev);n.has(s)?n.delete(s):n.add(s);return n;});
  const loadSavedIds=useCallback(()=>{const ids=new Set(sList(`benefit_item:${user.phone}:`).map(k=>k.split(':').pop()));setSavedIds(ids);},[user.phone]);
  useEffect(()=>{loadSavedIds();},[loadSavedIds]);

  // ── 여행가는 달 혜택 fetch (탭 진입 시 1회)
  useEffect(()=>{
    if(travelBenefits!==null||travelLoading)return;
    const apiBase=import.meta.env.VITE_API_BASE||'';
    setTravelLoading(true);
    fetch(`${apiBase}/api/travelmonth`)
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(data?.benefits)setTravelBenefits(data.benefits);})
      .catch(()=>{})
      .finally(()=>setTravelLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── 전국문화축제 fetch (탭 진입 시 1회)
  useEffect(()=>{
    if(festivalList!==null||festivalLoading)return;
    const apiBase=import.meta.env.VITE_API_BASE||'';
    setFestivalLoading(true);
    fetch(`${apiBase}/api/festival`)
      .then(r=>r.ok?r.json():null)
      .then(data=>{if(data?.festivals)setFestivalList(data.festivals);else setFestivalList([]);})
      .catch(()=>setFestivalList([]))
      .finally(()=>setFestivalLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(!loading)return;let i=0;const t=setInterval(()=>{i=(i+1)%LOADING_STEPS.length;setStep(i);},1800);return()=>clearInterval(t);},[loading]);
  useEffect(()=>{if(results&&rRef.current)rRef.current.scrollIntoView({behavior:'smooth'});},[results]);
  const toggleExtra=v=>setExtras(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);

  const buildCtx=()=>({
    age,gender,job,income,address,
    extra:extras.join(', ')||'없음',
    today:new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}),
  });

  const analyze=async()=>{
    if(!age||!gender||!job||!income||!address){alert('모든 필수 항목(*)을 입력해 주세요.');return;}
    setLoading(true);setResults(null);setErr('');setStep(0);setHiddenResults(null);setAnalyzedAt(null);setDbCollectedAt(null);onResultsReady?.(null);
    try{
      const region=Object.keys(REGIONS).find(r=>address.startsWith(r))||'전국';
      const group=extras.find(e=>e.includes('청년'))?'청년':extras.find(e=>e.includes('임산부'))?'임산부':'전체';
      const apiBase=import.meta.env.VITE_API_BASE||'';
      const profileCtx = { age, income, extras };
      const addEmployment = (INCOME_RANK_MAP[income] ?? 5) <= 6;
      const isYouthAge = extras.some(e=>e.includes('청년')) && parseInt(age)>=19 && parseInt(age)<=34;

      // ── 1단계: DB + 공공 API 병렬 조회 (항상 동시에 실행)
      const [dbResp, bokjiroData, gov24Data, youthData] = await Promise.all([
        fetch(`${apiBase}/api/benefits?region=${encodeURIComponent(region)}&group=${encodeURIComponent(group)}`)
          .then(r=>r.ok?r.json():null).catch(()=>null),
        fetchBokjiroData({age,extras}),
        fetchGov24Data({age,extras,job,income}),
        fetchYouthPolicyData({age,extras,address}),
      ]);

      // 공공 API 원시 데이터 → 정부 고정 혜택 카드 (static, 프로필 기반 필터링)
      const apiCards = filterExcludedBenefits(mapPublicApiToCards({bokjiroData, gov24Data, youthData, address, profile:{age,income,extras,job}}));
      console.log(`[analyze] 공공API ${apiCards.length}건 (복지로${bokjiroData.length}+정부24${gov24Data.length}+온통청년${youthData.length})`);

      // 하드코딩 고정 혜택 + API 카드를 합쳐 static 섹션 구성
      const staticOnes = [
        ...apiCards,
        ...(isYouthAge ? [YOUTH_FUTURE_SAVINGS] : []),
        ...(addEmployment ? [KUKMIN_EMPLOYMENT] : []),
        ...(parseInt(age)>=19 ? [KPASS_BENEFIT] : []),
      ].map(b=>({...b, _origin:'static'}));

      if(staticOnes.length >= 3 || (dbResp?.benefits?.length ?? 0) >= 5){
        // DB 수집 혜택 (AI 크롤링, crawled)
        const dbBenefits = (dbResp?.benefits || []).map((b, i) => ({
          id: `db-scraped-${Date.now()}-${i}`,
          source: b.카테고리 === '지자체' ? '지자체/공공' : b.카테고리 === '기업/제휴' ? '기업/제휴' : '생활/꿀팁',
          sourceIcon: b.카테고리 === '지자체' ? '🏛️' : b.카테고리 === '기업/제휴' ? '🏢' : '💡',
          category: b.카테고리 || '생활',
          categoryIcon: '🔍',
          scope: region,
          isUrgent: false, isHidden: false, isComingSoon: false,
          title: b.혜택명 || b.title || '',
          institution: b.기관 || '',
          amount: b.지원내용 || b.amount || '',
          deadline: b.마감일 || '연중 상시',
          requiredDocuments: [],
          howToApply: b.신청방법 || '',
          applyUrl: b.출처 || '',
        }));

        const filteredDbBenefits = filterExcludedBenefits(
          dbBenefits.filter(b => isDbBenefitEligible(b, profileCtx))
        );
        console.log(`[analyze] DB ${filteredDbBenefits.length}건 (원본 ${dbBenefits.length}건)`);

        const crawledOnes = filteredDbBenefits.map(b=>({...b, _origin:'crawled'}));
        let benefits = filterExcludedBenefits([...staticOnes, ...crawledOnes]);

        const parsed = {
          benefits,
          summary: {
            totalBenefits: benefits.length,
            estimatedMonthlyBenefit: '분석 중...',
            topPriority: staticOnes[0]?.title || dbBenefits[0]?.title || '신규 혜택',
            hiddenCount: 3,
          }
        };
        parsed.summary.topPriority = benefits[0]?.title || parsed.summary?.topPriority;
        setResults(parsed);
        setAnalyzedAt(new Date());
        if (dbResp?.collectedAt) setDbCollectedAt(new Date(dbResp.collectedAt));
        onResultsReady?.(parsed);
        setLoading(false);
        if (Notification.permission === 'default') setTimeout(()=>setShowNotifPrompt(true), 3000);
        return;
      }

      // ── 2단계: 공공 API + DB 모두 부족한 경우 Claude 실시간 분석
      console.log('[analyze] 공공 API 부족 — Claude 실시간 분석 시작');
      const [ggData, seoulData, youthContentData] = await Promise.all([
        fetchGGData({address,extras}),
        fetchSeoulData({age,address,extras}),
        fetchYouthContentData({age,extras,address}),
      ]);
      const raw=await callClaude(buildBenefitPrompt({...buildCtx(),mode:'full',bokjiroData,gov24Data,ggData,seoulData,youthData,youthContentData}),4500);
      const parsed=repairJSON(raw);
      if(parsed?.benefits){
        const isYouthAge2=extras.some(e=>e.includes('청년'))&&parseInt(age)>=19&&parseInt(age)<=34;
        parsed.benefits=filterExcludedBenefits(parsed.benefits);
        parsed.benefits=parsed.benefits
          .filter(b=>!/(청년도약계좌)/i.test(b.title||''))
          .map(b=>{
            if(/(국민\s*취업\s*지원)/i.test(b.title||'')) return {...KUKMIN_EMPLOYMENT,_origin:'static'};
            return {...b,_origin:'crawled',title:(b.title||'').replace(/청년\s*월세\s*지원사업/g,'청년 월세 지원')};
          });
        const seen=new Set();
        parsed.benefits=parsed.benefits.filter(b=>{if(seen.has(b.id))return false;seen.add(b.id);return true;});
        if(isYouthAge2) parsed.benefits=[{...YOUTH_FUTURE_SAVINGS,_origin:'static'},...parsed.benefits];
        if(parseInt(age)>=19) parsed.benefits=[...parsed.benefits,{...KPASS_BENEFIT,_origin:'static'}];
        parsed.benefits=filterExcludedBenefits(parsed.benefits);
      }
      setResults(parsed);
      setAnalyzedAt(new Date());
      onResultsReady?.(parsed);
    }catch(e){setErr(e.message);}
    finally{setLoading(false);}
  };

  const loadHidden=async()=>{
    if(!results)return;
    setHiddenLoading(true);
    try{
      const raw=await callClaude(buildBenefitPrompt({...buildCtx(),mode:'hidden'}),3000);
      const parsed=repairJSON(raw);
      setHiddenResults(filterExcludedBenefits((parsed.benefits||[]).map(b=>({...b,_origin:'crawled'}))));
    }catch(e){showToast('추가 혜택 발굴 중 오류: '+e.message);}
    finally{setHiddenLoading(false);}
  };

  const toggleSave=(b)=>{const key=`benefit_item:${user.phone}:${b.id}`;if(savedIds.has(String(b.id))){sDel(key);setSavedIds(p=>{const n=new Set(p);n.delete(String(b.id));return n;});}else{sSet(key,{...b,savedAt:new Date().toISOString(),userPhone:user.phone});setSavedIds(p=>new Set([...p,String(b.id)]));}onSaved();};

  const allBenefits=[...(results?.benefits||[]),...(hiddenResults||[])];

  // ── 카드 캐시백 제외 — 할인 탭으로 이동 ──
  const STATIC_IDS = new Set(['youth-future-savings-static','kukmin-employment-static','kpass-static']);
  const isCardCashback = (b) => {
    const t = b.title || '';
    const s = b.source || '';
    if (STATIC_IDS.has(b.id || '')) return false; // 정부 고정 혜택은 항상 유지
    if (/카드\s*(캐시백|이벤트|행사|프로모션)/i.test(t)) return true;
    if (/캐시백/i.test(t)) return true;
    if (s === '기업/제휴' || s === '기업/협회') return true;
    if ((s === '금융/은행' || /카드사/.test(s)) && !STATIC_IDS.has(b.id || '')) return true;
    return false;
  };

  // 정부·공공 혜택 (static 태그) / AI 수집 혜택 (crawled 태그)
  const govGroup  = allBenefits.filter(b => b._origin === 'static'  && !isCardCashback(b));
  const aiGroup   = allBenefits.filter(b => b._origin !== 'static'  && !isCardCashback(b));

  // 정렬 순서에 따라 첫 번째·두 번째 섹션 결정
  const firstGroup  = sortOrder === 'useful' ? govGroup  : aiGroup;
  const secondGroup = sortOrder === 'useful' ? aiGroup   : govGroup;

  const sources=[...new Set(allBenefits.filter(b=>!isCardCashback(b)).map(b=>b.source).filter(Boolean))];
  const filterFn = (arr) => filterSources.size===0 ? arr : arr.filter(b=>filterSources.has(b.source));
  const first  = filterFn(firstGroup);
  const second = filterFn(secondGroup);
  const NIS={width:'100%',background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:12,padding:'14px 16px',fontSize:14,color:'#111827',outline:'none',boxSizing:'border-box',fontFamily:'inherit',transition:'border-color 0.15s,box-shadow 0.15s'};
  const NSS={...NIS,paddingLeft:16,paddingRight:40,appearance:'none',WebkitAppearance:'none',cursor:'pointer'};
  const CARD={background:'#fff',borderRadius:24,padding:'24px',marginBottom:16,boxShadow:'0 1px 2px rgba(0,0,0,0.05)',border:'1px solid #f3f4f6'};
  const LABEL={display:'block',fontSize:13,fontWeight:600,color:'#374151',marginBottom:6};
  const ACCENT={width:6,height:16,background:'#16a34a',borderRadius:3,flexShrink:0};
  return(<div>
    {/* ── 기본 정보 카드 ── */}
    <div style={CARD}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}>
        <div style={ACCENT}/>
        <h2 style={{fontWeight:700,color:'#111827',fontSize:17,margin:0}}>기본 정보</h2>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:20}}>

        {/* 나이 */}
        <div>
          <label style={LABEL}>나이 <span style={{color:'#ef4444'}}>*</span></label>
          <div style={{position:'relative'}}>
            <input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="예: 35" style={{...NIS,paddingRight:44}}/>
            <span style={{position:'absolute',right:16,top:'50%',transform:'translateY(-50%)',color:'#6b7280',fontSize:13,pointerEvents:'none'}}>세</span>
          </div>
        </div>

        {/* 성별 — 세그먼트 버튼 */}
        <div>
          <label style={LABEL}>성별 <span style={{color:'#ef4444'}}>*</span></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {['남성','여성'].map(g=>(
              <div key={g} onClick={()=>setGender(g)} style={{border:`1.5px solid ${gender===g?'#15803d':'#e5e7eb'}`,background:gender===g?'#15803d':'#f9fafb',color:gender===g?'#fff':'#4b5563',borderRadius:12,padding:'13px 0',textAlign:'center',fontSize:14,fontWeight:600,cursor:'pointer',transition:'all 0.15s',userSelect:'none'}}>{g}</div>
            ))}
          </div>
        </div>

        {/* 직업 */}
        <div>
          <label style={LABEL}>직업 / 고용 상태 <span style={{color:'#ef4444'}}>*</span></label>
          <div style={{position:'relative'}}>
            <select value={job} onChange={e=>setJob(e.target.value)} style={{...NSS,color:job?'#111827':'#9ca3af'}}>
              <option value="">선택해주세요</option>
              {['직장인(정규직)','직장인(계약직/비정규직)','자영업자/사업자','프리랜서','구직자/실업자','학생','전업주부','농업/어업/임업','장애인','은퇴/무직'].map(v=><option key={v}>{v}</option>)}
            </select>
            <svg style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1l5 5 5-5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
        </div>

        {/* 소득 */}
        <div>
          <label style={LABEL}>월 소득 수준 <span style={{color:'#ef4444'}}>*</span></label>
          <div style={{position:'relative'}}>
            <select value={income} onChange={e=>setIncome(e.target.value)} style={{...NSS,color:income?'#111827':'#9ca3af'}}>
              <option value="">선택해주세요</option>
              {['기초생활수급자','월 50만원 미만','월 50~100만원','월 100~200만원','월 200~300만원','월 300~500만원','월 500~700만원','월 700만원 이상'].map(v=><option key={v}>{v}</option>)}
            </select>
            <svg style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1l5 5 5-5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
        </div>

        {/* 거주지 */}
        <div>
          <label style={LABEL}>거주지 <span style={{color:'#ef4444'}}>*</span></label>
          <div style={{position:'relative'}}>
            <svg style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',zIndex:1,flexShrink:0}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <AddrInput value={address} onChange={setAddress} paddingLeft={40}/>
          </div>
          <p style={{fontSize:12,color:'#9ca3af',marginTop:6,marginLeft:2,display:'flex',alignItems:'center',gap:4}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#9ca3af"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            시/도와 시/군/구까지 입력하면 자동완성됩니다
          </p>
        </div>
      </div>
    </div>

    {/* ── 추가 상황 카드 ── */}
    <div style={CARD}>
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
          <div style={ACCENT}/>
          <h2 style={{fontWeight:700,color:'#111827',fontSize:17,margin:0}}>추가 상황</h2>
        </div>
        <p style={{fontSize:13,color:'#6b7280',margin:'4px 0 0 14px'}}>해당하는 항목을 모두 선택해주세요.</p>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:24}}>
        {EXTRA_GROUPS.map((group,gi)=>(
          <div key={group.label}>
            {gi>0&&<div style={{borderTop:'1px solid #f3f4f6',marginBottom:20,marginTop:-4}}/>}
            <h3 style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:1.4,marginBottom:10,padding:'0 2px'}}>{group.label}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {group.items.map(item=>{
                const on=extras.includes(item.value);
                return(
                  <div key={item.value} onClick={()=>toggleExtra(item.value)} style={{display:'flex',alignItems:'center',padding:'12px 14px',border:`1.5px solid ${on?'#22c55e':'#f3f4f6'}`,background:on?'#f0fdf4':'#f9fafb',borderRadius:16,cursor:'pointer',transition:'all 0.15s',userSelect:'none'}}>
                    <div style={{width:20,height:20,minWidth:20,border:`1.5px solid ${on?'#15803d':'#d1d5db'}`,borderRadius:5,background:on?'#15803d':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                      {on&&<svg width="11" height="8" viewBox="0 0 9 7"><polyline points="1,3.5 3.5,6 8,1" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{width:34,height:34,borderRadius:'50%',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 12px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',border:`1.5px solid ${on?item.bc+'cc':item.bc}`,flexShrink:0,fontSize:16}}>{item.emoji}</div>
                    <span style={{fontSize:14,fontWeight:on?600:500,color:on?'#166534':'#1f2937',flex:1,wordBreak:'keep-all'}}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* ── 분석 버튼 ── */}
    <div style={{marginTop:4,paddingBottom:8}}>
      <button onClick={analyze} disabled={loading} style={{width:'100%',background:loading?'#166534':'#15803d',color:'#fff',borderRadius:16,padding:'16px',fontWeight:700,fontSize:15,border:'none',cursor:loading?'default':'pointer',boxShadow:'0 6px 16px rgba(21,128,61,0.3)',transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:8,opacity:loading?0.75:1,fontFamily:'inherit'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        {loading?'분석 중...':'내게 맞는 혜택 분석하기'}
      </button>
    </div>
    {loading&&(
      <div style={{...CS,textAlign:'center',padding:'40px 24px'}}>
        <div style={{position:'relative',width:56,height:56,margin:'0 auto 20px'}}>
          <div style={{width:56,height:56,border:`3px solid ${C.border}`,borderTopColor:C.teal,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>✦</div>
        </div>
        <div style={{fontSize:15,fontWeight:700,color:C.text1,marginBottom:6}}>전국 혜택 데이터베이스 분석 중</div>
        <div style={{fontSize:13,color:C.teal,fontWeight:600,marginBottom:16}}>{LOADING_STEPS[step]}</div>
        <div style={{display:'flex',gap:4,justifyContent:'center'}}>
          {LOADING_STEPS.map((_,i)=><div key={i} style={{width:i===step?16:6,height:6,borderRadius:3,background:i===step?C.teal:C.border,transition:'all 0.3s'}}/>)}
        </div>
      </div>
    )}
    {err&&<div style={{background:'#FEE2E2',border:'1px solid #FECACA',borderRadius:12,padding:'14px 16px',color:C.err,fontSize:13,marginBottom:16}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>}
    {results&&(<div ref={rRef}>
      {/* ── 고유가 정책 지원금 핀 카드 (항상 최상단) ── */}
      <div style={{background:'linear-gradient(135deg,#fff7ed,#fef3c7)',border:'2px solid #f59e0b',borderRadius:20,padding:'18px 20px',marginBottom:14,position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-10,right:-10,fontSize:60,opacity:0.08,userSelect:'none'}}>⛽</div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <div style={{background:'#f59e0b',borderRadius:12,width:42,height:42,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>⛽</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',gap:6,marginBottom:4,flexWrap:'wrap'}}>
              <span style={{fontSize:10,fontWeight:800,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:6,border:'1px solid #fcd34d'}}>에너지 지원</span>
              <span style={{fontSize:10,fontWeight:800,color:'#fff',background:'#f59e0b',padding:'2px 8px',borderRadius:6}}>📌 전국민 대상</span>
            </div>
            <h3 style={{fontSize:15,fontWeight:800,color:'#78350f',lineHeight:1.3,margin:0}}>고유가 정책 지원금 (에너지 바우처·캐시백)</h3>
          </div>
        </div>
        <div style={{background:'rgba(255,255,255,0.7)',borderRadius:12,padding:'10px 14px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:12,color:'#92400e',fontWeight:600}}>에너지 바우처</span>
            <span style={{fontSize:13,fontWeight:800,color:'#78350f'}}>최대 연 73,400원 지원</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:12,color:'#92400e',fontWeight:600}}>에너지 캐시백</span>
            <span style={{fontSize:13,fontWeight:800,color:'#78350f'}}>절감량에 따라 현금 환급</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:12,color:'#92400e',fontWeight:600}}>유류세 인하</span>
            <span style={{fontSize:13,fontWeight:800,color:'#78350f'}}>휘발유 ℓ당 최대 83원 절감</span>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <a href="https://www.energyv.or.kr" target="_blank" rel="noreferrer"
            style={{flex:1,padding:'11px 0',borderRadius:12,background:'#fff',color:'#92400e',fontSize:13,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',border:'1.5px solid #fcd34d'}}>
            에너지 바우처 신청
          </a>
          <a href="https://cyber.kepco.co.kr/ckepco/front/jsp/CY/H/C/CYHC00101.jsp" target="_blank" rel="noreferrer"
            style={{flex:1,padding:'11px 0',borderRadius:12,background:'#f59e0b',color:'#fff',fontSize:13,fontWeight:700,textDecoration:'none',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(245,158,11,0.35)'}}>
            에너지 캐시백 신청 →
          </a>
        </div>
      </div>
      {/* ── DB 최신 업데이트 안내 배너 ── */}
      {dbCollectedAt&&(()=>{
        const d=dbCollectedAt;
        const label=`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
        const hour=d.getHours();
        const timeLabel=hour<6?'새벽':hour<12?'오전':hour<18?'오후':'저녁';
        return(
          <div style={{display:'flex',alignItems:'center',gap:8,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'10px 14px',marginBottom:12}}>
            <span style={{fontSize:15}}>✅</span>
            <span style={{fontSize:12,color:'#166534',fontWeight:600,lineHeight:1.4}}>
              이 정보는 <strong>{label} {timeLabel}</strong>에 업데이트된 최신 정보입니다
            </span>
          </div>
        );
      })()}
      {/* ── 총 예상 지원 규모 카드 ── */}
      {(()=>{const visibleAll=[...govGroup,...aiGroup];const total=calcTotalYearly(visibleAll);const monthly=Math.round(total/12);return(
        <div style={{background:'#fff',borderRadius:24,padding:'24px',marginBottom:12,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',border:'1px solid #f3f4f6',textAlign:'center'}}>
          <span style={{fontSize:13,fontWeight:600,color:'#6b7280',display:'block',marginBottom:8}}>내가 받을 수 있는 월 혜택 금액</span>
          {monthly>0?(
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'center',gap:4,marginBottom:10}}>
              <span style={{fontSize:32,fontWeight:900,color:'#15803d',letterSpacing:-1}}>월 {monthly.toLocaleString()}</span>
              <span style={{fontSize:18,fontWeight:700,color:'#15803d',marginBottom:4}}>만원</span>
            </div>
          ):(
            <div style={{fontSize:24,fontWeight:800,color:'#15803d',marginBottom:10}}>총 {visibleAll.length}개 혜택</div>
          )}
          {results.summary?.topPriority&&<div style={{fontSize:13,color:'#374151',background:'#f0fdf4',borderRadius:10,padding:'8px 14px',marginBottom:10,display:'inline-block'}}>
            ⚡ 먼저 신청: <strong style={{color:'#15803d'}}>{results.summary.topPriority}</strong>
          </div>}
          <p style={{fontSize:11,color:'#9ca3af',background:'#f9fafb',padding:'6px 14px',borderRadius:20,display:'inline-block',margin:0}}>
            최대 지원 금액 기준이며 실제와 다를 수 있습니다.
          </p>
        </div>
      );})()}

      {/* ── 출처 필터 (다중 선택) ── */}
      {sources.length>0&&(
        <div style={{display:'flex',gap:6,overflowX:'auto',marginBottom:12,paddingBottom:4,scrollbarWidth:'none'}}>
          <button onClick={()=>setFilterSources(new Set())} style={{
            flexShrink:0,padding:'6px 12px',borderRadius:20,border:`1.5px solid ${filterSources.size===0?'#15803d':C.border}`,
            background:filterSources.size===0?'#15803d':'#fff',color:filterSources.size===0?'#fff':C.text2,
            fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
          }}>전체 {filterSources.size===0&&`(${govGroup.length+aiGroup.length})`}</button>
          {sources.map(s=>{const on=filterSources.has(s);return(
            <button key={s} onClick={()=>toggleFilter(s)} style={{
              flexShrink:0,padding:'6px 12px',borderRadius:20,border:`1.5px solid ${on?'#15803d':C.border}`,
              background:on?'#15803d':'#fff',color:on?'#fff':C.text2,
              fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
            }}>{s}{on&&` ✓`}</button>
          );})}
          {filterSources.size>0&&(
            <span style={{flexShrink:0,padding:'6px 10px',fontSize:12,color:'#9ca3af',alignSelf:'center'}}>
              {first.length+second.length}개 표시 중
            </span>
          )}
        </div>
      )}

      {/* ── 추천 혜택 목록 헤더 + 정렬 선택 ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 2px 10px'}}>
        <h2 style={{fontSize:17,fontWeight:700,color:'#111827',display:'flex',alignItems:'center',gap:8,margin:0}}>
          <div style={{width:5,height:16,background:'#16a34a',borderRadius:3}}/>
          추천 혜택 목록
        </h2>
        <span style={{fontSize:12,color:'#9ca3af',fontWeight:500}}>총 {govGroup.length+aiGroup.length}개</span>
      </div>

      {/* ── 정렬 토글 ── */}
      <div style={{display:'flex',background:'#f3f4f6',borderRadius:10,padding:3,marginBottom:14,gap:3}}>
        {[['useful','⭐ 유용한 순'],['latest','🆕 최신 순']].map(([v,l])=>(
          <button key={v} onClick={()=>setSortOrder(v)} style={{
            flex:1,padding:'8px 0',border:'none',borderRadius:8,fontSize:13,fontWeight:700,
            cursor:'pointer',fontFamily:'inherit',
            background:sortOrder===v?'#15803d':'transparent',
            color:sortOrder===v?'#fff':'#6b7280',
            transition:'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {/* ── 첫 번째 섹션 ── */}
      {first.length>0&&(<>
        <div style={{fontSize:12,fontWeight:700,color:sortOrder==='useful'?'#166534':'#1e40af',marginBottom:8,display:'flex',alignItems:'center',gap:5}}>
          <span style={{background:sortOrder==='useful'?'#dcfce7':'#dbeafe',padding:'3px 10px',borderRadius:20,border:`1px solid ${sortOrder==='useful'?'#bbf7d0':'#bfdbfe'}`}}>
            {sortOrder==='useful'?`🏛️ 정부·공공 혜택 (${first.length})`:`🔍 AI 수집 혜택 (${first.length})`}
          </span>
        </div>
        {first.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
      </>)}

      {/* ── 두 번째 섹션 ── */}
      {second.length>0&&(<>
        <div style={{fontSize:12,fontWeight:700,color:sortOrder==='latest'?'#166534':'#1e40af',marginBottom:8,marginTop:first.length>0?12:0,display:'flex',alignItems:'center',gap:5}}>
          <span style={{background:sortOrder==='latest'?'#dcfce7':'#dbeafe',padding:'3px 10px',borderRadius:20,border:`1px solid ${sortOrder==='latest'?'#bbf7d0':'#bfdbfe'}`}}>
            {sortOrder==='latest'?`🏛️ 정부·공공 혜택 (${second.length})`:`🔍 AI 수집 혜택 (${second.length})`}
          </span>
        </div>
        {second.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
      </>)}

      {/* ── AI 혜택 추가 발굴 버튼 ── */}
      {!hiddenResults&&!hiddenLoading&&(
        <div style={{...CS,textAlign:'center',padding:'24px',marginTop:8,border:`2px dashed ${C.border}`}}>
          <div style={{fontSize:24,marginBottom:8}}>🔍</div>
          <div style={{fontWeight:700,fontSize:15,color:C.text1,marginBottom:6}}>추가 정부 혜택 발굴</div>
          <div style={{fontSize:13,color:C.text2,marginBottom:16,lineHeight:1.6}}>건강보험 환급금, 통신요금 감면, 협회 지원금 등<br/>숨겨진 정부·공공 혜택을 더 찾아드려요</div>
          <button onClick={loadHidden} style={BP({padding:'12px 24px',fontSize:14,borderRadius:10,background:`linear-gradient(135deg,#7c3aed,#5b21b6)`})}>
            🔍 추가 혜택 더 찾기
          </button>
        </div>
      )}
      {hiddenLoading&&(
        <div style={{...CS,textAlign:'center',padding:'28px',marginTop:8}}>
          <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
          <div style={{fontSize:13,color:'#7c3aed',fontWeight:600}}>추가 혜택을 발굴하고 있습니다...</div>
        </div>
      )}

      {/* ── 이달의 행사·할인 ── */}
      <div style={{marginTop:24}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
          <div style={{width:4,height:18,background:'linear-gradient(to bottom,#f59e0b,#db2777)',borderRadius:2}}/>
          <span style={{fontSize:15,fontWeight:800,color:'#111827'}}>🎉 이달의 행사 및 할인</span>
          <span style={{fontSize:11,fontWeight:700,color:'#db2777',background:'#fdf2f8',padding:'2px 8px',borderRadius:20,border:'1px solid #fbcfe8'}}>{MONTH_KR[new Date().getMonth()]}</span>
        </div>
        {getMonthlyEvents().map(ev=><EventCard key={ev.id} ev={ev}/>)}

        {/* ── 전국문화축제 (공공데이터포털) ── */}
        <div style={{marginTop:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:4,height:16,background:'linear-gradient(to bottom,#db2777,#f59e0b)',borderRadius:2}}/>
            <span style={{fontSize:14,fontWeight:800,color:'#111827'}}>🎊 전국 문화축제</span>
            <span style={{fontSize:10,fontWeight:600,color:'#6b7280',background:'#f3f4f6',padding:'2px 8px',borderRadius:20,marginLeft:'auto'}}>공공데이터포털 제공</span>
          </div>
          {festivalLoading&&(
            <div style={{textAlign:'center',padding:'20px 0',color:'#6b7280',fontSize:13}}>
              <div style={{width:28,height:28,border:'2px solid #e5e7eb',borderTopColor:'#db2777',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
              축제 정보 불러오는 중...
            </div>
          )}
          {!festivalLoading&&festivalList&&festivalList.length===0&&(
            <div style={{textAlign:'center',padding:'16px',background:'#f8fafc',borderRadius:12,fontSize:13,color:'#9ca3af'}}>
              이달의 문화축제 정보가 없거나 API 키가 미설정 상태입니다.
            </div>
          )}
          {!festivalLoading&&festivalList&&festivalList.map(ev=><EventCard key={ev.id} ev={ev}/>)}
        </div>

        {/* ── 여행가는 달 (한국관광공사) ── */}
        <div style={{marginTop:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:4,height:16,background:'linear-gradient(to bottom,#0ea5e9,#2563eb)',borderRadius:2}}/>
            <span style={{fontSize:14,fontWeight:800,color:'#111827'}}>🗺️ 여행가는 달</span>
            <a href="https://korean.visitkorea.or.kr/travelmonth/main.do" target="_blank" rel="noreferrer"
               style={{fontSize:10,fontWeight:700,color:'#2563eb',background:'#eff6ff',padding:'2px 8px',borderRadius:20,border:'1px solid #bfdbfe',textDecoration:'none',marginLeft:'auto'}}>
              원본 보기 →
            </a>
          </div>
          {travelLoading&&(
            <div style={{textAlign:'center',padding:'20px 0',color:'#6b7280',fontSize:13}}>
              <div style={{width:28,height:28,border:'2px solid #e5e7eb',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
              여행 혜택 수집 중...
            </div>
          )}
          {!travelLoading&&travelBenefits&&travelBenefits.length===0&&(
            <div style={{textAlign:'center',padding:'16px',background:'#f8fafc',borderRadius:12,fontSize:13,color:'#9ca3af'}}>
              현재 여행가는 달 혜택 데이터를 불러오지 못했습니다.{' '}
              <a href="https://korean.visitkorea.or.kr/travelmonth/main.do" target="_blank" rel="noreferrer" style={{color:'#2563eb'}}>직접 확인하기</a>
            </div>
          )}
          {!travelLoading&&travelBenefits&&travelBenefits.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
        </div>
      </div>

      {/* ── 유의사항 ── */}
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',marginTop:16,fontSize:12.5,color:C.text2,lineHeight:1.8}}>
        <strong style={{color:C.text1}}>⚠️ 유의사항</strong><br/>
        본 분석은 AI 기반 참고 정보입니다. 실제 지원 조건·금액·기한은 해당 기관에 직접 확인하세요.<br/>
        <strong>복지로 129</strong> / <strong>주민센터 방문</strong> / <strong>정부24 온라인 문의</strong>
      </div>
    </div>)}
  </div>);}

// ─── SavedTab ─────────────────────────────────────────────────────
function SavedTab({user}){const[items,setItems]=useState(null);const[view,setView]=useState('list');
const load=useCallback(()=>{const keys=sList(`benefit_item:${user.phone}:`);const data=keys.map(k=>sGet(k)).filter(Boolean).sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt));setItems(data);},[user.phone]);
useEffect(()=>{load();},[load]);
const del=(id)=>{sDel(`benefit_item:${user.phone}:${id}`);load();};
if(!items)return<div style={{textAlign:'center',padding:60,color:'#9ca3af',fontSize:15}}>불러오는 중...</div>;
if(!items.length)return(<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:53,marginBottom:14}}>📭</div><div style={{fontSize:17,fontWeight:700,marginBottom:8}}>저장된 혜택이 없습니다</div><div style={{fontSize:14,color:'#6b6560'}}>혜택 분석 후 🔖 버튼을 눌러 개별 저장하세요</div></div>);
const withDeadline=items.filter(b=>parseDeadline(b.deadline));
return(<div>
  <div style={{display:'flex',background:'#f0ebe0',borderRadius:10,padding:4,marginBottom:18,gap:4}}>{[['list','🔖 저장 혜택 목록'],['calendar','📅 캘린더 · 알림']].map(([v,l])=>(<button key={v} onClick={()=>setView(v)} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:view===v?'#0d1117':'transparent',color:view===v?'#fff':'#6b6560',transition:'all 0.15s'}}>{l}</button>))}</div>
  {view==='list'&&(<div><div style={{fontSize:14,color:'#6b6560',marginBottom:14}}>총 <strong style={{color:'#0d1117'}}>{items.length}개</strong> 혜택 저장됨</div>{items.map(b=>(<div key={b.id} style={{position:'relative'}}><BCard b={b} savedIds={new Set([String(b.id)])}/><button onClick={()=>del(b.id)} style={{position:'absolute',top:18,right:18,background:'#fee2e2',border:'none',borderRadius:7,padding:'5px 10px',fontSize:12,fontWeight:700,color:'#991b1b',cursor:'pointer'}}>삭제</button></div>))}</div>)}
  {view==='calendar'&&(<div>{withDeadline.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'#9ca3af',fontSize:14}}>마감일이 지정된 혜택이 없습니다</div>:<CalendarWidget events={withDeadline}/>}</div>)}
</div>);}

// ─── LifeTab ──────────────────────────────────────────────────────
const LIFE_GOALS=[{id:'house',icon:'🏠',label:'내 집 마련'},{id:'wedding',icon:'💍',label:'결혼 / 신혼 준비'},{id:'baby',icon:'👶',label:'출산 / 육아 준비'},{id:'business',icon:'🚀',label:'창업 / 사업 시작'},{id:'retire',icon:'🌅',label:'조기 은퇴 / 파이어'},{id:'edu',icon:'🎓',label:'학업 / 유학'},{id:'car',icon:'🚗',label:'자동차 구매'},{id:'etc',icon:'✨',label:'기타 목표'}];
function LifeTab({user}){
  const[goals,setGoals]=useState([]);const[age,setAge]=useState('');const[income,setIncome]=useState('');const[assets,setAssets]=useState('');const[monthly,setMonthly]=useState('');const[region,setRegion]=useState('');const[detail,setDetail]=useState('');
  const[loading,setLoading]=useState(false);const[step,setStep]=useState(0);const[result,setResult]=useState(null);const[err,setErr]=useState('');const[view,setView]=useState('form');const rRef=useRef();
  const[savedPlans,setSavedPlans]=useState([]);
  const STEPS=['목표 분석 중...','재정 상황 계산 중...','정부 혜택 연계 검토 중...','단계별 타임라인 수립 중...','현실적인 설계안 작성 중...'];
  const loadSaved=useCallback(()=>{const keys=sList(`lifeplan:${user.phone}:`);setSavedPlans(keys.map(k=>sGet(k)).filter(Boolean).sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt)));},[user.phone]);
  useEffect(()=>{loadSaved();},[loadSaved]);
  useEffect(()=>{if(!loading)return;let i=0;const t=setInterval(()=>{i=(i+1)%STEPS.length;setStep(i);},2200);return()=>clearInterval(t);},[loading]);
  useEffect(()=>{if(result&&rRef.current)rRef.current.scrollIntoView({behavior:'smooth'});},[result]);
  const toggleGoal=g=>setGoals(p=>p.includes(g)?p.filter(x=>x!==g):[...p,g]);
  const analyze=async()=>{
    if(!goals.length||!age||!income||!monthly){alert('목표, 나이, 월 소득, 월 저축 가능 금액은 필수입니다.');return;}
    setLoading(true);setResult(null);setErr('');setStep(0);setView('form');
    const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
    const goalLabels=goals.map(g=>LIFE_GOALS.find(x=>x.id===g)?.label).join(', ');
    const prompt=`당신은 대한민국 최고의 재무 설계사이자 인생 코치입니다.\n[사용자 정보]\n나이:${age}세/목표:${goalLabels}/월소득:${income}만원/자산:${assets||'0'}만원/월저축:${monthly}만원/지역:${region||'미정'}/추가:${detail||'없음'}/기준일:${today}\n순수 JSON만 반환:\n{"summary":{"headline":"한 줄 핵심 요약","totalYears":숫자,"keyInsight":"조언 2문장"},"financials":{"monthlyRequired":"권장 월 저축액","currentGap":"갭 및 조정방법","expectedReturn":"예상 수익","totalNeeded":"총 필요 자금","breakdown":[{"label":"항목","amount":"금액","note":"설명"}]},"timeline":[{"phase":"단계명","period":"기간","age":"나이","color":"teal 또는 gold 또는 rust 또는 purple","tasks":[{"month":"시기","action":"할 일","type":"저축 또는 서류 또는 신청 또는 대출 또는 투자 또는 준비","detail":"방법 및 기관명","amount":"금액 또는 null","urgent":false}]}],"govBenefits":[{"title":"혜택명","when":"신청시기","amount":"금액","url":"URL"}],"risks":["리스크1","리스크2","리스크3"],"tips":["팁1","팁2","팁3"]}\n단계 2~4개, 각 3~6개 tasks, 총 10개 이상.`;
    try{const raw=await callClaude(prompt);setResult(JSON.parse(raw));setView('result');}catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  const savePlan=()=>{if(!result)return;const id=Date.now().toString();sSet(`lifeplan:${user.phone}:${id}`,{id,savedAt:new Date().toISOString(),goals,age,income,assets,monthly,region,detail,result});loadSaved();showToast('인생 설계 플랜이 저장됐어요!');};
  const PHASE_COLORS={teal:'#1a6b6b',gold:'#c9a84c',rust:'#c94f1a',purple:'#7c3aed'};
  const TYPE_STYLE={저축:{bg:'#dcfce7',color:'#166534'},서류:{bg:'#dbeafe',color:'#1e40af'},신청:{bg:'#fce7f3',color:'#9d174d'},대출:{bg:'#fef9c3',color:'#854d0e'},투자:{bg:'#ede9fe',color:'#5b21b6'},준비:{bg:'#f3f4f6',color:'#374151'}};
  return(<div>
    <div style={{display:'flex',background:'#f0ebe0',borderRadius:10,padding:4,marginBottom:20,gap:4}}>{[['form','🎯 새 설계'],['result','📊 설계 결과'],['saved','💾 저장된 플랜']].map(([v,l])=>(<button key={v} onClick={()=>setView(v)} disabled={v==='result'&&!result} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:v==='result'&&!result?'not-allowed':'pointer',fontFamily:'inherit',background:view===v?'#0d1117':'transparent',color:view===v?'#fff':v==='result'&&!result?'#bbb':'#6b6560',transition:'all 0.15s'}}>{l}</button>))}</div>
    {view==='form'&&(<div>
      <div style={{...CS,marginBottom:16}}><h2 style={{fontFamily:'serif',fontSize:'1.21rem',fontWeight:700,marginBottom:5}}>내 인생 목표 선택</h2><p style={{fontSize:13,color:'#9ca3af',marginBottom:16}}>이루고 싶은 목표를 모두 선택하세요</p><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>{LIFE_GOALS.map(g=>(<button key={g.id} onClick={()=>toggleGoal(g.id)} style={{background:goals.includes(g.id)?'#0d1117':'#faf7f2',border:`1.5px solid ${goals.includes(g.id)?'#0d1117':'#d4cdc2'}`,borderRadius:10,padding:'12px 8px',cursor:'pointer',textAlign:'center',fontFamily:'inherit'}}><div style={{fontSize:22,marginBottom:4}}>{g.icon}</div><div style={{fontSize:12,fontWeight:700,color:goals.includes(g.id)?'#fff':'#374151',lineHeight:1.3}}>{g.label}</div></button>))}</div></div>
      <div style={{...CS,marginBottom:16}}><h2 style={{fontFamily:'serif',fontSize:'1.21rem',fontWeight:700,marginBottom:16}}>현재 재정 상황</h2><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><div><label style={LS}>나이 <R/></label><input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="예: 30" style={IS}/></div><div><label style={LS}>월 소득 (세후, 만원) <R/></label><input type="number" value={income} onChange={e=>setIncome(e.target.value)} placeholder="예: 300" style={IS}/></div><div><label style={LS}>현재 자산 (만원)</label><input type="number" value={assets} onChange={e=>setAssets(e.target.value)} placeholder="예: 2000" style={IS}/></div><div><label style={LS}>월 저축 가능 (만원) <R/></label><input type="number" value={monthly} onChange={e=>setMonthly(e.target.value)} placeholder="예: 100" style={IS}/></div><div><label style={LS}>희망 거주 지역</label><input value={region} onChange={e=>setRegion(e.target.value)} placeholder="예: 서울 강동구" style={IS}/></div><div><label style={LS}>추가 상황·희망사항</label><input value={detail} onChange={e=>setDetail(e.target.value)} placeholder="예: 30평대 아파트, 5년 내" style={IS}/></div></div><button onClick={analyze} disabled={loading} style={BP({width:'100%',marginTop:20,padding:'14px',fontSize:15,borderRadius:10,opacity:loading?0.7:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8})}><span style={{width:19,height:19,background:'#c9a84c',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11}}>✦</span>{loading?'인생 설계 중...':'나만의 인생 설계 시작하기'}</button></div>
      {loading&&<div style={{textAlign:'center',padding:'36px 0'}}><div style={{width:48,height:48,border:'3px solid #d4cdc2',borderTopColor:'#c9a84c',borderRadius:'50%',animation:'spin 0.9s linear infinite',margin:'0 auto 14px'}}/><div style={{fontSize:14,color:'#6b6560'}}>맞춤 인생 설계안을 작성하고 있습니다...</div><div style={{fontSize:13,color:'#c9a84c',marginTop:5,fontWeight:500}}>{STEPS[step]}</div></div>}
      {err&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#991b1b',fontSize:13}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>}
    </div>)}
    {view==='result'&&result&&(<div ref={rRef}>
      <div style={{background:'linear-gradient(135deg,#0d1117,#1e2733)',borderRadius:16,padding:'20px 22px',marginBottom:16,color:'#fff'}}><div style={{fontSize:10,fontWeight:700,color:'#c9a84c',letterSpacing:0.5,textTransform:'uppercase',marginBottom:10}}>✦ 나만의 인생 설계 플랜</div><div style={{fontFamily:'serif',fontSize:'1.1rem',fontWeight:700,marginBottom:8,lineHeight:1.4,wordBreak:'keep-all'}}>{result.summary?.headline}</div><p style={{fontSize:12,color:'rgba(255,255,255,0.7)',lineHeight:1.6,marginBottom:14,wordBreak:'keep-all'}}>{result.summary?.keyInsight}</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{[{v:result.summary?.totalYears+'년',l:'목표까지 예상 기간'},{v:result.financials?.totalNeeded,l:'총 필요 자금'},{v:result.financials?.monthlyRequired,l:'권장 월 저축액'}].map(({v,l})=>(<div key={l}><div style={{fontSize:'1.1rem',fontWeight:900,color:'#c9a84c',lineHeight:1,wordBreak:'keep-all'}}>{v}</div><div style={{fontSize:11,opacity:0.6,marginTop:3}}>{l}</div></div>))}</div><div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}><button onClick={savePlan} style={BP({padding:'9px 16px',fontSize:13,borderRadius:8,background:'#c9a84c',color:'#0d1117'})}>💾 플랜 저장</button><button onClick={()=>setView('form')} style={BP({padding:'9px 16px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.1)'})}>✏️ 다시 설계</button></div></div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:14}}>💰 재정 분석</div>{result.financials?.breakdown?.map((b,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:i<result.financials.breakdown.length-1?'1px solid #f0ebe0':'none'}}><div><div style={{fontSize:14,fontWeight:600}}>{b.label}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{b.note}</div></div><div style={{fontSize:15,fontWeight:700,color:'#1a6b6b',flexShrink:0,marginLeft:12}}>{b.amount}</div></div>))}<div style={{background:'#faf7f2',borderRadius:10,padding:'12px 14px',marginTop:8}}><div style={{fontSize:13,color:'#374151',lineHeight:1.7,marginBottom:4}}><strong>현재 저축 갭:</strong> {result.financials?.currentGap}</div><div style={{fontSize:13,color:'#374151',lineHeight:1.7}}><strong>자산 운용 시:</strong> {result.financials?.expectedReturn}</div></div></div>
      <div style={{marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:14}}>🗓 단계별 타임라인</div>{result.timeline?.map((phase,pi)=>{const pc=PHASE_COLORS[phase.color]||'#1a6b6b';return(<div key={pi} style={{marginBottom:14}}><div style={{background:pc,borderRadius:'12px 12px 0 0',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontSize:13,color:'rgba(255,255,255,0.7)',fontWeight:500}}>Phase {pi+1}</div><div style={{fontSize:14,fontWeight:700,color:'#fff',wordBreak:'keep-all'}}>{phase.phase}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:13,color:'rgba(255,255,255,0.8)'}}>{phase.period}</div><div style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>{phase.age}</div></div></div><div style={{background:'#fff',border:'1px solid #d4cdc2',borderTop:'none',borderRadius:'0 0 12px 12px',overflow:'hidden'}}>{phase.tasks?.map((task,ti)=>{const ts=TYPE_STYLE[task.type]||TYPE_STYLE['준비'];return(<div key={ti} style={{padding:'13px 16px',borderBottom:ti<phase.tasks.length-1?'1px solid #f5f0e8':'none',display:'flex',gap:12,alignItems:'flex-start',background:task.urgent?'#fffbf0':'#fff'}}><span style={{background:ts.bg,color:ts.color,fontSize:11,fontWeight:700,padding:'3px 7px',borderRadius:5,whiteSpace:'nowrap',flexShrink:0,marginTop:1}}>{task.type}</span><div style={{flex:1}}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><div style={{fontSize:13,fontWeight:700,marginBottom:2,wordBreak:'keep-all'}}>{task.urgent&&'⚡ '}{task.action}</div><div style={{fontSize:12,color:'#6b6560',lineHeight:1.5,wordBreak:'keep-all'}}>{task.detail}</div></div><div style={{flexShrink:0,textAlign:'right'}}><div style={{fontSize:12,color:'#9ca3af'}}>{task.month}</div>{task.amount&&<div style={{fontSize:13,fontWeight:700,color:pc,marginTop:2}}>{task.amount}</div>}</div></div></div></div>);})}</div></div>);})}</div>
      {result.govBenefits?.length>0&&(<div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:12}}>🏛 연계 가능한 정부 혜택</div>{result.govBenefits.map((b,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:i<result.govBenefits.length-1?'1px solid #f0ebe0':'none',gap:10,flexWrap:'wrap'}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{b.title}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>신청 시기: {b.when}</div></div><div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{b.amount&&<span style={{fontSize:13,fontWeight:700,color:'#1a6b6b'}}>{b.amount}</span>}<a href={b.url||'https://www.bokjiro.go.kr'} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:700,color:'#fff',background:'#0d1117',padding:'5px 10px',borderRadius:6,textDecoration:'none'}}>신청 →</a></div></div>))}</div>)}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}><div style={{background:'#fee2e2',borderRadius:12,padding:'16px'}}><div style={{fontWeight:700,fontSize:14,color:'#991b1b',marginBottom:10}}>⚠️ 주의할 리스크</div>{result.risks?.map((r,i)=><div key={i} style={{fontSize:13,color:'#7f1d1d',lineHeight:1.6,marginBottom:4}}>• {r}</div>)}</div><div style={{background:'#dcfce7',borderRadius:12,padding:'16px'}}><div style={{fontWeight:700,fontSize:14,color:'#166534',marginBottom:10}}>💡 실천 팁</div>{result.tips?.map((t,i)=><div key={i} style={{fontSize:13,color:'#14532d',lineHeight:1.6,marginBottom:4}}>• {t}</div>)}</div></div>
      <div style={{background:'#ede8dc',borderRadius:10,padding:'14px 16px',fontSize:13,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>⚠️ 유의사항</strong><br/>본 설계안은 참고용입니다. 실제 금융 결정 전 공인 재무설계사(CFP) 또는 금융기관에 상담하세요.</div>
    </div>)}
    {view==='saved'&&(<div>{savedPlans.length===0?<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:53,marginBottom:14}}>📋</div><div style={{fontSize:17,fontWeight:700,marginBottom:8}}>저장된 플랜이 없습니다</div></div>:savedPlans.map(plan=>(<div key={plan.id} style={{...CS,marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap',marginBottom:12}}><div><div style={{fontFamily:'serif',fontSize:'1.10rem',fontWeight:700,marginBottom:6}}>{plan.result?.summary?.headline}</div><div style={{display:'flex',flexWrap:'wrap',gap:5}}>{plan.goals.map(g=>{const gl=LIFE_GOALS.find(x=>x.id===g);return gl?<span key={g} style={{background:'#0d1117',color:'#fff',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20}}>{gl.icon} {gl.label}</span>:null;})}</div></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:12,color:'#9ca3af'}}>{new Date(plan.savedAt).toLocaleDateString('ko-KR')}</div><div style={{fontSize:13,color:'#c9a84c',fontWeight:700,marginTop:2}}>{plan.result?.financials?.totalNeeded}</div></div></div><div style={{display:'flex',gap:7,paddingTop:12,borderTop:'1px solid #f0ebe0'}}><button onClick={()=>{setResult(plan.result);setGoals(plan.goals);setAge(plan.age);setIncome(plan.income);setAssets(plan.assets);setMonthly(plan.monthly);setRegion(plan.region||'');setDetail(plan.detail||'');setView('result');}} style={BP({padding:'8px 14px',fontSize:13,borderRadius:8,background:'#1a6b6b'})}>결과 보기</button><button onClick={()=>{if(!window.confirm('삭제하시겠습니까?'))return;sDel(`lifeplan:${user.phone}:${plan.id}`);loadSaved();}} style={BP({padding:'8px 12px',fontSize:13,borderRadius:8,background:'#fee2e2',color:'#991b1b'})}>🗑 삭제</button></div></div>))}</div>)}
  </div>);}

// ─── WeddingTab ───────────────────────────────────────────────────
const WEDDING_STEPS_LOAD=['예산 최적화 분석 중...','스드메 업체 매칭 중...','웨딩홀 옵션 검색 중...','일정 타임라인 수립 중...','맞춤 플랜 완성 중...'];
function WeddingTab({user}){
  const[budget,setBudget]=useState('');const[region,setRegion]=useState('');const[wdate,setWdate]=useState('');const[style,setStyle]=useState('');const[guests,setGuests]=useState('');const[contrib,setContrib]=useState('');const[extra,setExtra]=useState('');
  const[loading,setLoading]=useState(false);const[stepIdx,setStepIdx]=useState(0);const[result,setResult]=useState(null);const[err,setErr]=useState('');const[view,setView]=useState('form');const[calEvents,setCalEvents]=useState([]);const rRef=useRef();
  const[savedPlans,setSavedPlans]=useState([]);
  const loadSaved=useCallback(()=>{const keys=sList(`wedding:${user.phone}:`);setSavedPlans(keys.map(k=>sGet(k)).filter(Boolean).sort((a,b)=>new Date(b.savedAt)-new Date(a.savedAt)));},[user.phone]);
  useEffect(()=>{loadSaved();},[loadSaved]);
  useEffect(()=>{if(!loading)return;let i=0;const t=setInterval(()=>{i=(i+1)%WEDDING_STEPS_LOAD.length;setStepIdx(i);},2000);return()=>clearInterval(t);},[loading]);
  useEffect(()=>{if(result&&rRef.current)rRef.current.scrollIntoView({behavior:'smooth'});},[result]);
  const extractCalEvents=useCallback((r)=>{if(!r?.timeline)return[];return r.timeline.filter(t=>t.deadline).map(t=>({id:`w-${t.id||Math.random()}`,title:t.action,deadline:t.deadline,institution:t.vendor||'웨딩 일정',requiredDocuments:t.documents||[],howToApply:t.method||'',applyUrl:t.url||'https://www.bokjiro.go.kr',categoryIcon:t.icon||'💍',isUrgent:t.urgent||false,amount:t.amount||'',description:t.detail||''}));},[]);
  const analyze=async()=>{
    if(!budget||!region||!guests){alert('예산, 지역, 예상 하객 수는 필수입니다.');return;}
    setLoading(true);setResult(null);setErr('');setStepIdx(0);
    const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
    const prompt=`당신은 대한민국 최고의 웨딩 플래너이자 재무 전문가입니다.\n[정보] 총 결혼 예산:${budget}만원/지역:${region}/희망시기:${wdate||'미정'}/스타일:${style||'일반 웨딩홀'}/하객수:${guests}명/양가지원:${contrib||'미정'}/추가:${extra||'없음'}/기준일:${today}\n순수 JSON만 반환:\n{"summary":{"headline":"한 줄 핵심 요약","totalBudget":"${budget}만원","perGuest":"1인당 비용","keyAdvice":"중요 조언 2문장"},"budget":{"items":[{"category":"카테고리명","icon":"이모지","min":"최소(만원)","max":"최대(만원)","recommended":"권장(만원)","tip":"절약팁"}],"hiddenCosts":["숨겨진비용1","숨겨진비용2","숨겨진비용3"]},"vendors":{"studio":[{"name":"업체명","priceRange":"가격대","style":"스타일","region":"위치","rating":"★★★★☆","tip":"선택팁","url":"URL"}],"dress":[{"name":"업체명","priceRange":"가격대","style":"스타일","region":"위치","rating":"★★★★☆","tip":"선택팁","url":"URL"}],"makeup":[{"name":"업체명","priceRange":"가격대","style":"스타일","region":"위치","rating":"★★★★☆","tip":"선택팁","url":"URL"}],"hall":[{"name":"웨딩홀명","priceRange":"대관료","capacity":"수용인원","region":"위치·교통","style":"홀 특징","rating":"★★★★☆","tip":"선택팁","url":"URL"}]},"timeline":[{"id":"t1","action":"할 일","icon":"이모지","category":"스드메 또는 웨딩홀 또는 서류 또는 신혼여행 또는 준비","timing":"D-몇개월","deadline":"YYYY년 MM월 DD일","detail":"방법·체크포인트","vendor":"업체/기관","amount":"비용 또는 null","documents":["서류1"],"method":"예약방법","url":"URL","urgent":false}],"govSupport":[{"title":"지원정책","amount":"금액","condition":"조건","when":"신청시기","url":"URL"}],"savePoints":["절약포인트1","절약포인트2","절약포인트3"],"checkList":["체크1","체크2","체크3","체크4","체크5"]}\ntimeline 최소 12개. vendors 각 6개. hall은 ${region} 기준. 한국 실제 업체명·가격 반영.`;
    try{const raw=await callClaude(prompt,5000);const parsed=JSON.parse(raw);setResult(parsed);setCalEvents(extractCalEvents(parsed));setExtraVendors({studio:[],dress:[],makeup:[],hall:[]});setView('result');}catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  const savePlan=()=>{if(!result)return;const id=Date.now().toString();sSet(`wedding:${user.phone}:${id}`,{id,savedAt:new Date().toISOString(),budget,region,wdate,style,guests,contrib,extra,result});loadSaved();showToast('결혼 설계 플랜이 저장됐어요! 💍');};
  const loadMoreVendors=async(tab)=>{
    const TAB_LABEL={studio:'스튜디오',dress:'드레스',makeup:'메이크업',hall:'웨딩홀'};
    const already=[...(result?.vendors?.[tab]||[]),...(extraVendors[tab]||[])].map(v=>v.name).join(', ');
    const prompt=`대한민국 웨딩 ${TAB_LABEL[tab]} 업체 10개를 추천해주세요.\n조건: 지역=${region}, 예산=${budget}만원, 하객수=${guests}명\n이미 추천된 업체(중복 제외): ${already}\n순수 JSON 배열만 반환 (마크다운 없이):\n[{"name":"업체명","priceRange":"가격대","style":"스타일","region":"위치","rating":"★★★★☆","tip":"선택팁","url":"URL"}]`;
    setExtraLoading(true);
    try{const raw=await callClaude(prompt,2000);const items=JSON.parse(raw);setExtraVendors(p=>({...p,[tab]:[...(p[tab]||[]),...items]}));}
    catch(e){showToast('추가 업체 로딩 실패: '+e.message);}
    finally{setExtraLoading(false);}
  };
  const downloadAllWeddingICS=()=>{
    const evts=calEvents.filter(e=>parseDeadline(e.deadline));
    if(!evts.length){showToast('캘린더에 추가할 일정이 없습니다.');return;}
    const fmt=d=>d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    let body='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//네모혜//KR\r\n';
    evts.forEach((ev,i)=>{const dl=parseDeadline(ev.deadline);const remind=new Date(dl);remind.setDate(remind.getDate()-7);body+=`BEGIN:VEVENT\r\nUID:nemohye-wedding-${i}-${Date.now()}\r\nDTSTART:${fmt(remind)}\r\nDTEND:${fmt(remind)}\r\nSUMMARY:[웨딩] ${ev.title} D-7 알림\r\nDESCRIPTION:마감: ${ev.deadline}\\n업체: ${ev.institution||'-'}\r\nBEGIN:VALARM\r\nTRIGGER:-P0D\r\nACTION:DISPLAY\r\nDESCRIPTION:${ev.title}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;});
    body+='END:VCALENDAR';
    const blob=new Blob([body],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nemohye_wedding_all.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast(`${evts.length}개 일정을 ICS 파일로 다운로드했어요! 캘린더 앱에서 불러오세요.`);
  };
  const sendAllTimelineKakao=()=>{const txt=buildKakaoText(calEvents);copyToClip(txt,`웨딩 준비 일정 ${calEvents.length}개가 복사됐어요! 카카오톡 > 나에게 보내기에 붙여넣기 하세요.`);};
  const CAT_STYLE={'스드메':{bg:'#fce7f3',color:'#9d174d'},'웨딩홀':{bg:'#ede9fe',color:'#5b21b6'},'서류':{bg:'#dbeafe',color:'#1e40af'},'신혼여행':{bg:'#fef9c3',color:'#854d0e'},'준비':{bg:'#dcfce7',color:'#166534'}};
  const[vendorTab,setVendorTab]=useState('studio');
  const[extraVendors,setExtraVendors]=useState({studio:[],dress:[],makeup:[],hall:[]});
  const[extraLoading,setExtraLoading]=useState(false);
  const VENDOR_TABS=[['studio','📷 스튜디오'],['dress','👗 드레스'],['makeup','💄 메이크업'],['hall','🏛 웨딩홀']];
  const VENDOR_ACCENT={studio:'#7c3aed',dress:'#be185d',makeup:'#c94f1a',hall:'#1a6b6b'};
  const BudgetBar=({min,max,rec,total})=>{const t=parseInt(total)||1;const recPct=Math.min((parseInt(rec)/t)*100,100);const maxPct=Math.min((parseInt(max)/t)*100,100);return(<div style={{marginTop:6}}><div style={{height:6,background:'#f0ebe0',borderRadius:3,overflow:'hidden',position:'relative'}}><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${maxPct}%`,background:'#fde8dc',borderRadius:3}}/><div style={{position:'absolute',left:0,top:0,height:'100%',width:`${recPct}%`,background:'#c9a84c',borderRadius:3}}/></div></div>);};
  const VendorCard=({v,accent})=>(<div style={{background:'#faf7f2',border:'1px solid #e8e2d8',borderRadius:10,padding:'13px 14px',marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:5}}><div style={{fontWeight:700,fontSize:14}}>{v.name}</div><div style={{fontSize:13,color:accent,fontWeight:700,flexShrink:0}}>{v.priceRange}</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}><span style={{fontSize:11,color:'#6b6560',background:'#f0ebe0',padding:'2px 7px',borderRadius:5}}>{v.region}</span><span style={{fontSize:11,color:'#6b6560',background:'#f0ebe0',padding:'2px 7px',borderRadius:5}}>{v.style}</span>{v.capacity&&<span style={{fontSize:11,color:'#6b6560',background:'#f0ebe0',padding:'2px 7px',borderRadius:5}}>👥 {v.capacity}</span>}</div><div style={{fontSize:12,color:'#6b6560',lineHeight:1.5,marginBottom:7}}>{v.tip}</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,color:'#c9a84c'}}>{v.rating}</span><a href={v.url||'#'} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:700,color:'#fff',background:'#0d1117',padding:'5px 10px',borderRadius:6,textDecoration:'none'}}>업체 보기 →</a></div></div>);
  return(<div>
    <div style={{display:'flex',background:'#f0ebe0',borderRadius:10,padding:4,marginBottom:18,gap:3,overflowX:'auto'}}>{[['form','💍 설계 입력'],['result','📊 플랜 결과'],['calendar','📅 일정 캘린더'],['saved','💾 저장 플랜']].map(([v,l])=>(<button key={v} onClick={()=>setView(v)} disabled={v==='result'&&!result} style={{flex:'0 0 auto',padding:'9px 14px',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:v==='result'&&!result?'not-allowed':'pointer',fontFamily:'inherit',background:view===v?'#0d1117':'transparent',color:view===v?'#fff':v==='result'&&!result?'#bbb':'#6b6560',whiteSpace:'nowrap',transition:'all 0.15s'}}>{l}</button>))}</div>
    {view==='form'&&(<div>
      <div style={{background:'linear-gradient(135deg,#4a0e4e,#1a0a2e)',borderRadius:14,padding:'20px 22px',marginBottom:16,color:'#fff'}}><div style={{fontSize:10,letterSpacing:0.5,color:'#f9a8d4',textTransform:'uppercase',marginBottom:8}}>✦ 웨딩 플래너</div><div style={{fontFamily:'serif',fontSize:'1.1rem',fontWeight:700,marginBottom:6,wordBreak:'keep-all',lineHeight:1.4}}>예산에 맞는 완벽한 결혼식을 설계해드립니다 💍</div><p style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.6,wordBreak:'keep-all'}}>스드메부터 웨딩홀, 신혼여행까지 — 준비 일정과 예산을 한 번에</p></div>
      <div style={{...CS,marginBottom:14}}><h2 style={{fontFamily:'serif',fontSize:'1.10rem',fontWeight:700,marginBottom:14}}>결혼 기본 정보</h2><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}><div><label style={LS}>총 결혼 예산 (만원) <R/></label><input type="number" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="예: 3000" style={IS}/></div><div><label style={LS}>결혼식 지역 <R/></label><input value={region} onChange={e=>setRegion(e.target.value)} placeholder="예: 서울 강남, 수원" style={IS}/></div><div><label style={LS}>희망 결혼 시기</label><input type="month" value={wdate} onChange={e=>setWdate(e.target.value)} style={IS}/></div><div><label style={LS}>예상 하객 수 (명) <R/></label><input type="number" value={guests} onChange={e=>setGuests(e.target.value)} placeholder="예: 200" style={IS}/></div><div><label style={LS}>웨딩 스타일</label><select value={style} onChange={e=>setStyle(e.target.value)} style={SS}><option value="">선택하세요</option>{['일반 웨딩홀','야외/가든 웨딩','스몰 웨딩 (50명 이하)','호텔 웨딩','레스토랑 웨딩','교회/성당 웨딩','한옥 웨딩'].map(v=><option key={v}>{v}</option>)}</select></div><div><label style={LS}>양가 지원 / 예상 부조금</label><input value={contrib} onChange={e=>setContrib(e.target.value)} placeholder="예: 양가 1000만원 + 부조금 예상" style={IS}/></div><div style={{gridColumn:'1/-1'}}><label style={LS}>추가 요청사항</label><input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="예: 드레스 2벌, 야외 촬영 희망" style={IS}/></div></div><button onClick={analyze} disabled={loading} style={BP({width:'100%',marginTop:18,padding:'14px',fontSize:15,borderRadius:10,opacity:loading?0.7:1,background:'#4a0e4e',display:'flex',alignItems:'center',justifyContent:'center',gap:8})}><span style={{fontSize:18}}>💍</span>{loading?'맞춤 웨딩 플랜 설계 중...':'나만의 웨딩 플랜 설계하기'}</button></div>
      {loading&&<div style={{textAlign:'center',padding:'36px 0'}}><div style={{fontSize:35,marginBottom:12,animation:'spin 3s linear infinite',display:'inline-block'}}>💍</div><div style={{fontSize:14,color:'#6b6560'}}>맞춤 웨딩 플랜을 설계하고 있습니다...</div><div style={{fontSize:13,color:'#be185d',marginTop:5,fontWeight:500}}>{WEDDING_STEPS_LOAD[stepIdx]}</div></div>}
      {err&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#991b1b',fontSize:13}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>}
    </div>)}
    {view==='result'&&result&&(<div ref={rRef}>
      <div style={{background:'linear-gradient(135deg,#4a0e4e,#1a0a2e)',borderRadius:14,padding:'20px 22px',marginBottom:14,color:'#fff'}}><div style={{fontSize:10,letterSpacing:0.5,color:'#f9a8d4',textTransform:'uppercase',marginBottom:8}}>✦ 맞춤 웨딩 플랜</div><div style={{fontFamily:'serif',fontSize:'1.1rem',fontWeight:700,lineHeight:1.4,marginBottom:8,wordBreak:'keep-all'}}>{result.summary?.headline}</div><p style={{fontSize:12,color:'rgba(255,255,255,0.7)',lineHeight:1.6,marginBottom:14,wordBreak:'keep-all'}}>{result.summary?.keyAdvice}</p><div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:'1.1rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{result.summary?.totalBudget}</div><div style={{fontSize:11,opacity:0.6,marginTop:3}}>총 예산</div></div><div><div style={{fontSize:'1.1rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{result.summary?.perGuest}</div><div style={{fontSize:11,opacity:0.6,marginTop:3}}>1인당 비용</div></div><div><div style={{fontSize:'1.1rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{guests}명</div><div style={{fontSize:11,opacity:0.6,marginTop:3}}>하객 수</div></div></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button onClick={savePlan} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'#be185d',color:'#fff'})}>💾 플랜 저장</button><button onClick={()=>setView('calendar')} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.12)'})}>📅 캘린더 동기화</button><button onClick={()=>setView('form')} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.08)'})}>✏️ 다시 설계</button></div></div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.05rem',marginBottom:14,wordBreak:'keep-all'}}>💰 예산 배분 계획</div>{result.budget?.items?.map((item,i)=>(<div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<result.budget.items.length-1?'1px solid #f5f0e8':'none'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:20}}>{item.icon}</span><span style={{fontSize:14,fontWeight:700}}>{item.category}</span></div><div style={{textAlign:'right'}}><span style={{fontSize:14,fontWeight:700,color:'#c9a84c'}}>{item.recommended}만원</span><span style={{fontSize:11,color:'#9ca3af',marginLeft:5}}>{item.min}~{item.max}만원</span></div></div><BudgetBar min={item.min} max={item.max} rec={item.recommended} total={budget}/><div style={{fontSize:12,color:'#6b6560',marginTop:4}}>💡 {item.tip}</div></div>))}{result.budget?.hiddenCosts?.length>0&&(<div style={{background:'#fef9c3',border:'1px solid #fde68a',borderRadius:8,padding:'10px 13px',marginTop:4}}><div style={{fontSize:12,fontWeight:700,color:'#854d0e',marginBottom:5}}>⚠️ 주의! 숨겨진 비용</div>{result.budget.hiddenCosts.map((c,i)=><div key={i} style={{fontSize:12,color:'#78350f',lineHeight:1.6}}>• {c}</div>)}</div>)}</div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.05rem',marginBottom:14,wordBreak:'keep-all'}}>💒 업체 추천</div><div style={{display:'flex',background:'#f5f0e8',borderRadius:9,padding:3,gap:3,marginBottom:14,overflowX:'auto'}}>{VENDOR_TABS.map(([v,l])=>(<button key={v} onClick={()=>setVendorTab(v)} style={{flex:'0 0 auto',padding:'8px 12px',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:vendorTab===v?VENDOR_ACCENT[v]:'transparent',color:vendorTab===v?'#fff':'#6b6560',whiteSpace:'nowrap'}}>{l}</button>))}</div>
      {[...(result.vendors?.[vendorTab]||[]),...(extraVendors[vendorTab]||[])].map((v,i)=>(<VendorCard key={i} v={v} accent={VENDOR_ACCENT[vendorTab]}/>))}
      {(extraVendors[vendorTab]||[]).length<10
        ?(<button onClick={()=>loadMoreVendors(vendorTab)} disabled={extraLoading} style={{width:'100%',marginTop:4,padding:'11px',border:`1.5px dashed ${VENDOR_ACCENT[vendorTab]}`,borderRadius:10,background:'transparent',color:VENDOR_ACCENT[vendorTab],fontSize:14,fontWeight:700,cursor:extraLoading?'not-allowed':'pointer',fontFamily:'inherit',opacity:extraLoading?0.6:1}}>{extraLoading?'업체 검색 중...':'+ 추가 업체 추천 받기'}</button>)
        :(<div style={{textAlign:'center',padding:'10px 0',fontSize:13,color:'#9ca3af'}}>✅ 추가 업체 추천이 완료됐습니다 ({(result.vendors?.[vendorTab]?.length||0)+(extraVendors[vendorTab]?.length||0)}개)</div>)
      }
      </div>
      <div style={{...CS,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem'}}>🗓 웨딩 준비 타임라인</div><div style={{display:'flex',gap:7}}><button onClick={downloadAllWeddingICS} style={BP({padding:'8px 13px',fontSize:12,borderRadius:8,background:'#edf6f6',color:'#1a6b6b',display:'flex',alignItems:'center',gap:5})}>📅 전체 캘린더 추가</button><button onClick={sendAllTimelineKakao} style={BP({padding:'8px 13px',fontSize:12,borderRadius:8,background:'#FEE500',color:'#3C1E1E',display:'flex',alignItems:'center',gap:5})}>💬 전체 카카오 공유</button></div></div><div style={{position:'relative'}}><div style={{position:'absolute',left:16,top:0,bottom:0,width:2,background:'#f0ebe0'}}/>{result.timeline?.map((task,i)=>{const cs=CAT_STYLE[task.category]||CAT_STYLE['준비'];const dl=parseDeadline(task.deadline);const days=daysLeft(dl);return(<div key={i} style={{display:'flex',gap:14,marginBottom:14,position:'relative'}}><div style={{width:32,height:32,borderRadius:'50%',background:cs.bg,border:`2px solid ${cs.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,zIndex:1}}>{task.icon||'💍'}</div><div style={{flex:1,background:task.urgent?'#fffbf0':'#faf7f2',border:`1px solid ${task.urgent?'#fde68a':'#e8e2d8'}`,borderRadius:10,padding:'11px 13px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap',marginBottom:4}}><div><span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:5,background:cs.bg,color:cs.color,marginRight:6}}>{task.category}</span><span style={{fontSize:13,fontWeight:700,wordBreak:'keep-all'}}>{task.urgent?'⚡ ':''}{task.action}</span></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:11,color:'#9ca3af'}}>{task.timing}</div>{days!==null&&days>=0&&<div style={{fontSize:12,fontWeight:700,color:days<=30?'#c94f1a':'#c9a84c'}}>D-{days}</div>}</div></div><div style={{fontSize:12,color:'#6b6560',lineHeight:1.5,marginBottom:task.documents?.length?6:0}}>{task.detail}</div>{task.documents?.length>0&&(<div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:5}}>{task.documents.map(d=><span key={d} style={{fontSize:11,background:'#f0ebe0',border:'1px solid #d4cdc2',borderRadius:4,padding:'2px 6px'}}>📄 {d}</span>)}</div>)}<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>{task.vendor&&<span style={{fontSize:11,color:'#6b6560'}}>🏢 {task.vendor}</span>}{task.amount&&<span style={{fontSize:12,fontWeight:700,color:'#be185d'}}>💰 {task.amount}</span>}{dl&&(<div style={{marginLeft:'auto',display:'flex',gap:5}}><button onClick={()=>openGoogleCalendar({...task,title:task.action,institution:task.vendor||'웨딩 일정',requiredDocuments:task.documents||[]})} style={BP({padding:'4px 9px',fontSize:11,borderRadius:5,background:'#0d1117'})}>📱</button><button onClick={()=>sendKakaoMe({...task,title:task.action,institution:task.vendor||'웨딩 일정',requiredDocuments:task.documents||[]})} style={BP({padding:'4px 9px',fontSize:11,borderRadius:5,background:'#FEE500',color:'#3C1E1E'})}>💬</button></div>)}</div></div></div>);})}</div></div>
      {result.govSupport?.length>0&&(<div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:12}}>🏛 신혼부부 정부 지원 혜택</div>{result.govSupport.map((g,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'11px 0',borderBottom:i<result.govSupport.length-1?'1px solid #f0ebe0':'none',gap:10,flexWrap:'wrap'}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{g.title}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{g.condition} · 신청: {g.when}</div></div><div style={{display:'flex',gap:7,alignItems:'center',flexShrink:0}}><span style={{fontSize:13,fontWeight:700,color:'#1a6b6b'}}>{g.amount}</span><a href={g.url||'https://www.bokjiro.go.kr'} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:700,color:'#fff',background:'#0d1117',padding:'5px 9px',borderRadius:6,textDecoration:'none'}}>신청 →</a></div></div>))}</div>)}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}><div style={{background:'#dcfce7',borderRadius:12,padding:'14px'}}><div style={{fontWeight:700,fontSize:13,color:'#166534',marginBottom:8}}>💡 예산 절약 포인트</div>{result.savePoints?.map((s,i)=><div key={i} style={{fontSize:12,color:'#14532d',lineHeight:1.6,marginBottom:3}}>✓ {s}</div>)}</div><div style={{background:'#ede9fe',borderRadius:12,padding:'14px'}}><div style={{fontWeight:700,fontSize:13,color:'#5b21b6',marginBottom:8}}>☑️ 준비 체크리스트</div>{result.checkList?.map((c,i)=><div key={i} style={{fontSize:12,color:'#4c1d95',lineHeight:1.6,marginBottom:3}}>□ {c}</div>)}</div></div>
      <div style={{background:'#ede8dc',borderRadius:10,padding:'12px 14px',fontSize:12,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>⚠️ 유의사항</strong><br/>업체 정보 및 가격은 참고용이며 실제와 다를 수 있습니다. 계약 전 반드시 현장 상담을 받으시기 바랍니다.</div>
    </div>)}
    {view==='calendar'&&(<div>{calEvents.length===0&&!result?<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:53,marginBottom:14}}>📅</div><div style={{fontSize:15,fontWeight:700,marginBottom:8}}>설계 결과가 없습니다</div></div>:<><button onClick={()=>{const txt=buildKakaoText(calEvents);copyToClip(txt,'웨딩 일정 전체가 복사됐어요! 카카오톡 > 나에게 보내기에 붙여넣기 하세요.');}} style={{width:'100%',marginBottom:14,background:'#FEE500',border:'none',borderRadius:12,padding:'13px 18px',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',color:'#3C1E1E',display:'flex',alignItems:'center',justifyContent:'center',gap:10}}><span style={{width:24,height:24,background:'rgba(0,0,0,0.08)',borderRadius:5,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:15}}>💬</span>카카오톡으로 웨딩 일정 전체 받기</button><CalendarWidget events={calEvents}/></> }</div>)}
    {view==='saved'&&(<div>{savedPlans.length===0?<div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:53,marginBottom:14}}>💒</div><div style={{fontSize:15,fontWeight:700,marginBottom:8}}>저장된 웨딩 플랜이 없습니다</div></div>:savedPlans.map(plan=>(<div key={plan.id} style={{...CS,marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap',marginBottom:10}}><div><div style={{fontFamily:'serif',fontSize:'1.04rem',fontWeight:700,marginBottom:4}}>{plan.result?.summary?.headline}</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><span style={{background:'#4a0e4e',color:'#f9a8d4',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20}}>💍 {plan.region}</span><span style={{background:'#f5f0e8',color:'#6b6560',fontSize:11,padding:'2px 9px',borderRadius:20}}>👥 {plan.guests}명</span><span style={{background:'#f5f0e8',color:'#6b6560',fontSize:11,padding:'2px 9px',borderRadius:20}}>💰 {plan.budget}만원</span></div></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:12,color:'#9ca3af'}}>{new Date(plan.savedAt).toLocaleDateString('ko-KR')}</div></div></div><div style={{display:'flex',gap:7,paddingTop:10,borderTop:'1px solid #f0ebe0'}}><button onClick={()=>{setResult(plan.result);setBudget(plan.budget);setRegion(plan.region);setWdate(plan.wdate||'');setStyle(plan.style||'');setGuests(plan.guests);setContrib(plan.contrib||'');setExtra(plan.extra||'');setCalEvents(extractCalEvents(plan.result));setView('result');}} style={BP({padding:'8px 14px',fontSize:13,borderRadius:8,background:'#4a0e4e'})}>결과 보기</button><button onClick={()=>{if(!window.confirm('삭제하시겠습니까?'))return;sDel(`wedding:${user.phone}:${plan.id}`);loadSaved();}} style={BP({padding:'8px 12px',fontSize:13,borderRadius:8,background:'#fee2e2',color:'#991b1b'})}>🗑 삭제</button></div></div>))}</div>)}
  </div>);}

// ─── RealEstateTab ────────────────────────────────────────────────
function RealEstateTab({user}){
  const HOUSE_TYPES=[{id:'아파트',icon:'🏢',label:'아파트'},{id:'오피스텔',icon:'🏙',label:'오피스텔'},{id:'빌라',icon:'🏘',label:'빌라 · 다세대'},{id:'단독주택',icon:'🏡',label:'단독주택'}];
  const SITUATIONS=['신혼부부','청년 자취','학생 자취','직장인 이사','가족 이사','투자/임대'];
  const RE_STEPS=['지역 부동산 시세 분석 중...','매물 정보 검색 중...','대출 상품 확인 중...','정부 지원 혜택 매칭 중...','맞춤 부동산 플랜 작성 중...'];

  const[houseType,setHouseType]=useState('');
  const[address,setAddress]=useState('');
  const[budget,setBudget]=useState('');
  const[age,setAge]=useState('');
  const[situation,setSituation]=useState('');
  const[loading,setLoading]=useState(false);
  const[stepIdx,setStepIdx]=useState(0);
  // ── 알림 권한 요청 및 맞춤 문구 생성 로직 ──
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  const getPersonalizedNotifMsg = (results, region, group) => {
    if (!results?.benefits?.length) return "새로운 혜택이 업데이트되었습니다.";

    // 가장 금액이 큰 혜택 찾기
    const topBenefit = results.benefits.reduce((prev, current) => {
      const getVal = (s) => {
        const m = String(s).match(/(\d+)만/);
        return m ? parseInt(m[1]) : 0;
      };
      return getVal(current.amount) > getVal(prev.amount) ? current : prev;
    }, results.benefits[0]);

    const amountStr = topBenefit.amount.includes('만') ? topBenefit.amount.match(/\d+만/)[0] : "맞춤형";
    const regionName = region !== '전국' ? region : '우리 동네';

    return `${regionName} ${group}이라면? 오늘 새로 올라온 ${amountStr} 지원금을 확인하세요!`;
  };

  const handleRequestNotif = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const msg = getPersonalizedNotifMsg(results, address.split(' ')[1] || '서울', extras.includes('청년') ? '청년' : '시민');
      new Notification("🔔 알림 설정 완료!", {
        body: `앞으로 이런 소식을 보내드릴게요: "${msg}"`,
        icon: '/favicon.svg'
      });
    }
    setShowNotifPrompt(false);
  };

  const[err,setErr]=useState('');
  const rRef=useRef();

  useEffect(()=>{if(!loading)return;let i=0;const t=setInterval(()=>{i=(i+1)%RE_STEPS.length;setStepIdx(i);},2000);return()=>clearInterval(t);},[loading]);
  useEffect(()=>{if(result&&rRef.current)rRef.current.scrollIntoView({behavior:'smooth'});},[result]);

  const analyze=async()=>{
    if(!houseType){alert('집 유형을 선택해 주세요.');return;}
    setLoading(true);setResult(null);setErr('');setStepIdx(0);
    const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
    const prompt=`당신은 대한민국 최고의 부동산 전문가입니다.\n[정보] 집유형:${houseType}/지역:${address||'미정'}/예산:${budget||'미정'}/나이:${age||'미정'}세/상황:${situation||'미정'}/기준일:${today}\n순수 JSON만 반환 (마크다운 없이):\n{"summary":{"headline":"한 줄 요약","avgPrice":"평균 매매가","priceRange":"가격 범위","marketTrend":"시장 동향 한 문장","insight":"핵심 인사이트 2문장"},"properties":[{"id":1,"name":"단지/건물명","location":"상세 위치(역·버스 기준)","price":"매매가","jeonse":"전세가","rent":"월세(보증금/월)","area":"전용면적㎡","floor":"층수","features":["특징1","특징2","특징3"],"pros":"장점 한 줄","cons":"단점 한 줄","nearbyFacilities":["지하철","마트","학교 등"],"recommend":"추천 이유"}],"loans":[{"name":"대출 상품명","institution":"은행/기관","maxAmount":"최대 한도","rate":"금리 범위","condition":"신청 조건","target":"대상자","benefit":"주요 혜택","url":"신청 URL"}],"govSupport":[{"name":"정책명","amount":"지원 금액","condition":"조건","url":"URL"}],"tips":["팁1","팁2","팁3","팁4"],"checklist":["계약 전 체크1","체크2","체크3","체크4","체크5"]}\nproperties 5개, loans 5개, govSupport 3개. ${address||'해당 지역'} 실제 시세 반영. 실제 대출 상품명·정책명 사용.`;
    try{const raw=await callClaude(prompt,4000);setResult(JSON.parse(raw));}catch(e){setErr(e.message);}finally{setLoading(false);}
  };

  return(<div>
    <div style={{background:'linear-gradient(135deg,#0f3460,#0a1628)',borderRadius:14,padding:'22px 24px',marginBottom:16,color:'#fff'}}>
      <div style={{fontSize:10,letterSpacing:0.5,color:'#7dd3fc',textTransform:'uppercase',marginBottom:8}}>✦ 부동산 분석</div>
      <div style={{fontFamily:'serif',fontSize:'1.1rem',fontWeight:700,marginBottom:6,wordBreak:'keep-all',lineHeight:1.4}}>나에게 맞는 집을 찾아드립니다 🏠</div>
      <p style={{fontSize:12,color:'rgba(255,255,255,0.65)',lineHeight:1.6,wordBreak:'keep-all'}}>집 유형과 조건을 입력하면 매물 정보, 대출 상품, 정부 지원까지 한번에</p>
    </div>

    <div style={{...CS,marginBottom:14}}>
      <h2 style={{fontFamily:'serif',fontSize:'1.10rem',fontWeight:700,marginBottom:5}}>집 유형 선택 <R/></h2>
      <p style={{fontSize:12,color:'#9ca3af',marginBottom:14}}>원하는 집 유형을 선택하세요 (필수)</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        {HOUSE_TYPES.map(h=>(<button key={h.id} onClick={()=>setHouseType(h.id)} style={{padding:'16px 8px',border:`2px solid ${houseType===h.id?'#0f3460':'#d4cdc2'}`,borderRadius:12,background:houseType===h.id?'#eef6ff':'#fff',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',display:'flex',flexDirection:'column',alignItems:'center',gap:7}}>
          <span style={{fontSize:28}}>{h.icon}</span>
          <span style={{fontSize:12,fontWeight:700,color:houseType===h.id?'#0f3460':'#374151'}}>{h.label}</span>
        </button>))}
      </div>
    </div>

    <div style={{...CS,marginBottom:14}}>
      <h2 style={{fontFamily:'serif',fontSize:'1.10rem',fontWeight:700,marginBottom:14}}>추가 조건 <span style={{fontWeight:400,fontSize:12,color:'#9ca3af'}}>(선택)</span></h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}>
        <div style={{gridColumn:'1/-1'}}><label style={LS}>원하는 지역</label><AddrInput value={address} onChange={setAddress}/></div>
        <div><label style={LS}>예산</label><input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="예: 3억, 보증금 5000 월세 70" style={IS}/></div>
        <div><label style={LS}>나이</label><input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="예: 28" style={IS}/></div>
        <div style={{gridColumn:'1/-1'}}><label style={LS}>현재 상황</label><div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:2}}>{SITUATIONS.map(s=>(<button key={s} onClick={()=>setSituation(situation===s?'':s)} style={{padding:'8px 14px',border:`1.5px solid ${situation===s?'#0f3460':'#d4cdc2'}`,borderRadius:20,background:situation===s?'#eef6ff':'#fff',fontSize:13,fontWeight:situation===s?700:400,cursor:'pointer',fontFamily:'inherit',color:situation===s?'#0f3460':'#374151',transition:'all 0.15s'}}>{s}</button>))}</div></div>
      </div>
      <button onClick={analyze} disabled={loading} style={BP({width:'100%',marginTop:18,padding:'14px',fontSize:15,borderRadius:10,opacity:loading?0.7:1,background:'#0f3460',display:'flex',alignItems:'center',justifyContent:'center',gap:8})}>
        <span style={{fontSize:18}}>🏠</span>{loading?'분석 중...':'부동산 설계하기'}
      </button>
    </div>

    {loading&&(<div style={{textAlign:'center',padding:'36px 0'}}><div style={{width:42,height:42,border:'3px solid #d4cdc2',borderTopColor:'#0f3460',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/><div style={{fontSize:14,color:'#6b6560'}}>부동산 정보를 분석하고 있습니다...</div><div style={{fontSize:13,color:'#0f3460',marginTop:5,fontWeight:500}}>{RE_STEPS[stepIdx]}</div></div>)}
    {err&&(<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#991b1b',fontSize:13,marginBottom:16}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>)}

    {result&&(<div ref={rRef}>
      <div style={{background:'linear-gradient(135deg,#0f3460,#0a1628)',borderRadius:14,padding:'22px 24px',marginBottom:14,color:'#fff'}}>
        <div style={{fontSize:10,letterSpacing:0.5,color:'#7dd3fc',textTransform:'uppercase',marginBottom:8}}>✦ 분석 완료</div>
        <div style={{fontFamily:'serif',fontSize:'1.1rem',fontWeight:700,lineHeight:1.4,marginBottom:8,wordBreak:'keep-all'}}>{result.summary?.headline}</div>
        <p style={{fontSize:12,color:'rgba(255,255,255,0.75)',lineHeight:1.6,marginBottom:12,wordBreak:'keep-all'}}>{result.summary?.insight}</p>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          {[{v:result.summary?.avgPrice,l:'평균 매매가'},{v:result.summary?.priceRange,l:'가격 범위'},{v:houseType,l:'집 유형'}].map(({v,l})=>(<div key={l}><div style={{fontSize:'1.0rem',fontWeight:900,color:'#7dd3fc',lineHeight:1,wordBreak:'keep-all'}}>{v}</div><div style={{fontSize:11,opacity:0.6,marginTop:3}}>{l}</div></div>))}
        </div>
        {result.summary?.marketTrend&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.15)',fontSize:13,color:'rgba(255,255,255,0.7)'}}>📈 {result.summary.marketTrend}</div>}
      </div>

      <div style={{...CS,marginBottom:14}}>
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.05rem',marginBottom:14,wordBreak:'keep-all'}}>🏠 추천 매물</div>
        {result.properties?.map((p,i)=>(<div key={i} style={{background:'#faf7f2',border:'1px solid #e8e2d8',borderRadius:12,padding:'16px',marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:8,flexWrap:'wrap'}}>
            <div><div style={{fontWeight:700,fontSize:15,marginBottom:3}}>{p.name}</div><div style={{fontSize:12,color:'#6b6560'}}>{p.location}</div></div>
            <span style={{background:'#eef6ff',color:'#0f3460',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,flexShrink:0}}>#{i+1}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginBottom:10}}>
            {[{l:'💰 매매가',v:p.price,c:'#0f3460'},{l:'🔑 전세',v:p.jeonse||'-',c:'#166534'},{l:'🏠 월세',v:p.rent||'-',c:'#c94f1a'}].map(({l,v,c})=>(<div key={l} style={{background:'#f5f0e8',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:10,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:0.5,marginBottom:3}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:c,lineHeight:1.4}}>{v}</div></div>))}
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
            {p.features?.map(f=><span key={f} style={{fontSize:11,background:'#dbeafe',color:'#1e40af',padding:'2px 8px',borderRadius:5}}>{f}</span>)}
            {p.area&&<span style={{fontSize:11,background:'#f0ebe0',color:'#6b6560',padding:'2px 8px',borderRadius:5}}>📐 {p.area}</span>}
            {p.floor&&<span style={{fontSize:11,background:'#f0ebe0',color:'#6b6560',padding:'2px 8px',borderRadius:5}}>🏗 {p.floor}</span>}
          </div>
          {p.nearbyFacilities?.length>0&&<div style={{fontSize:12,color:'#6b6560',marginBottom:8}}>🚇 {p.nearbyFacilities.join(' · ')}</div>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:p.recommend?8:0}}>
            <div style={{flex:1,minWidth:120,background:'#dcfce7',borderRadius:7,padding:'7px 10px',fontSize:12,color:'#166534'}}>✅ {p.pros}</div>
            <div style={{flex:1,minWidth:120,background:'#fee2e2',borderRadius:7,padding:'7px 10px',fontSize:12,color:'#991b1b'}}>⚠️ {p.cons}</div>
          </div>
          {p.recommend&&<div style={{fontSize:12,color:'#0f3460',fontWeight:600,background:'#eef6ff',borderRadius:7,padding:'7px 10px'}}>💡 {p.recommend}</div>}
        </div>))}
      </div>

      <div style={{...CS,marginBottom:14}}>
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.05rem',marginBottom:14,wordBreak:'keep-all'}}>💳 이용 가능한 대출 상품</div>
        {result.loans?.map((l,i)=>(<div key={i} style={{borderBottom:i<result.loans.length-1?'1px solid #f0ebe0':'none',paddingBottom:14,marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap',marginBottom:6}}>
            <div><div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{l.name}</div><div style={{fontSize:12,color:'#6b6560'}}>{l.institution}</div></div>
            <div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:14,fontWeight:700,color:'#0f3460'}}>{l.maxAmount}</div><div style={{fontSize:12,color:'#6b6560'}}>{l.rate}</div></div>
          </div>
          <div style={{fontSize:12,color:'#374151',lineHeight:1.6,marginBottom:6}}>{l.condition}</div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,background:'#dbeafe',color:'#1e40af',padding:'2px 8px',borderRadius:5}}>👤 {l.target}</span>
            {l.benefit&&<span style={{fontSize:11,background:'#dcfce7',color:'#166534',padding:'2px 8px',borderRadius:5}}>✨ {l.benefit}</span>}
            <a href={l.url||'https://www.bokjiro.go.kr'} target="_blank" rel="noreferrer" style={{marginLeft:'auto',fontSize:12,fontWeight:700,color:'#fff',background:'#0f3460',padding:'5px 10px',borderRadius:6,textDecoration:'none'}}>신청하기 →</a>
          </div>
        </div>))}
      </div>

      {result.govSupport?.length>0&&(<div style={{...CS,marginBottom:14}}>
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.05rem',marginBottom:14,wordBreak:'keep-all'}}>🏛 정부 지원 혜택</div>
        {result.govSupport.map((g,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'11px 0',borderBottom:i<result.govSupport.length-1?'1px solid #f0ebe0':'none',gap:10,flexWrap:'wrap'}}>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{g.name}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{g.condition}</div></div>
          <div style={{display:'flex',gap:7,alignItems:'center',flexShrink:0}}><span style={{fontSize:13,fontWeight:700,color:'#1a6b6b'}}>{g.amount}</span><a href={g.url||'https://www.bokjiro.go.kr'} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:700,color:'#fff',background:'#0d1117',padding:'5px 9px',borderRadius:6,textDecoration:'none'}}>신청 →</a></div>
        </div>))}
      </div>)}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
        <div style={{background:'#fef9c3',borderRadius:12,padding:'14px'}}><div style={{fontWeight:700,fontSize:13,color:'#854d0e',marginBottom:8}}>💡 부동산 팁</div>{result.tips?.map((t,i)=><div key={i} style={{fontSize:12,color:'#78350f',lineHeight:1.6,marginBottom:3}}>✓ {t}</div>)}</div>
        <div style={{background:'#dbeafe',borderRadius:12,padding:'14px'}}><div style={{fontWeight:700,fontSize:13,color:'#1e40af',marginBottom:8}}>☑️ 계약 전 체크리스트</div>{result.checklist?.map((c,i)=><div key={i} style={{fontSize:12,color:'#1e3a8a',lineHeight:1.6,marginBottom:3}}>□ {c}</div>)}</div>
      </div>
      <div style={{background:'#ede8dc',borderRadius:10,padding:'12px 14px',fontSize:12,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>⚠️ 유의사항</strong><br/>제공된 정보는 AI 분석 기반 참고 자료입니다. 실제 매물·대출 조건은 공인중개사 및 해당 금융기관에 직접 확인하세요.</div>
    </div>)}
  </div>);
}

// ─── AdminTab ─────────────────────────────────────────────────────
function AdminTab(){
  const[users,setUsers]=useState(null);
  const load=useCallback(()=>{ setUsers(getAllUsers()); },[]);
  useEffect(()=>{load();},[load]);
  const del=(phone)=>{if(!window.confirm(`${formatPhone(phone)} 회원을 삭제하시겠습니까?`))return;deleteUser(phone);load();};
  if(!users)return<div style={{textAlign:'center',padding:60,color:'#9ca3af',fontSize:15}}>불러오는 중...</div>;
  return(<div>
    <div style={{...CS,marginBottom:20,padding:'20px 24px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <h2 style={{fontFamily:'serif',fontSize:'1.21rem',fontWeight:700}}>👥 전체 회원 목록</h2>
        <span style={{background:'#1a6b6b',color:'#fff',fontSize:12,fontWeight:700,padding:'4px 12px',borderRadius:20}}>{users.length}명</span>
      </div>
      <p style={{fontSize:13,color:'#9ca3af'}}>회원가입한 모든 사용자를 관리합니다</p>
    </div>
    {users.length===0&&(<div style={{textAlign:'center',padding:'60px 20px',color:'#9ca3af',fontSize:14}}>가입된 회원이 없습니다</div>)}
    {users.map((u,i)=>(<div key={u.phone} style={{...CS,marginBottom:10,padding:'18px 20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:44,height:44,borderRadius:'50%',background:'linear-gradient(135deg,#1a6b6b,#0d4f4f)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.10rem',fontWeight:900,color:'#c9a84c',fontFamily:'serif',flexShrink:0}}>{u.name?.charAt(0)||'?'}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:15,color:'#0d1117',marginBottom:2}}>{u.name}</div>
          <div style={{fontSize:13,color:'#6b6560',marginBottom:1}}>{formatPhone(u.phone)}</div>
          <div style={{fontSize:12,color:'#9ca3af'}}>가입일: {new Date(u.createdAt).toLocaleString('ko-KR',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:20,background:'#ede8dc',color:'#6b6560'}}>#{i+1}</span>
          <button onClick={()=>del(u.phone)} style={{background:'#fee2e2',border:'none',borderRadius:7,padding:'7px 14px',fontSize:13,fontWeight:700,color:'#991b1b',cursor:'pointer'}}>삭제</button>
        </div>
      </div>
    </div>))}
  </div>);}

// ─── DiscountTab ──────────────────────────────────────────────────
const DISCOUNT_CAT_STYLE = {
  '마트·생필품': { bg:'#dcfce7', color:'#166534', icon:'🛒' },
  '음식·배달':   { bg:'#ffedd5', color:'#9a3412', icon:'🍕' },
  '패션·뷰티':   { bg:'#fce7f3', color:'#9d174d', icon:'👗' },
  '전자·가전':   { bg:'#dbeafe', color:'#1e40af', icon:'📱' },
  '여행·레저':   { bg:'#fef9c3', color:'#854d0e', icon:'✈️' },
  '온라인쇼핑':  { bg:'#ede9fe', color:'#5b21b6', icon:'🛍️' },
  '기타':        { bg:'#f3f4f6', color:'#374151', icon:'🎁' },
};
function DiscountTab() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selectedCat, setSelectedCat] = useState(null);
  const [expandedStores, setExpandedStores] = useState({});

  const fetchCategoryDiscounts = (cat) => {
    setSelectedCat(cat);
    setLoading(true);
    setErr('');
    const BASE = import.meta.env.VITE_API_BASE || '';
    const url = cat === '전체' ? `${BASE}/api/discount` : `${BASE}/api/discount?category=${encodeURIComponent(cat)}`;
    
    fetch(url)
      .then(r => r.json())
      .then(data => { 
        setDiscounts(data.discounts || []); 
        setLoading(false); 
        // 새 카테고리 로딩 시 확장 상태 초기화
        setExpandedStores({});
      })
      .catch(e => { setErr(e.message); setLoading(false); });
  };

  const toggleStoreExpand = (store) => {
    setExpandedStores(prev => ({ ...prev, [store]: !prev[store] }));
  };

  // 기업별(store) 그룹화
  const grouped = discounts.reduce((acc, d) => {
    const s = d.store || '기타';
    if (!acc[s]) acc[s] = [];
    acc[s].push(d);
    return acc;
  }, {});

  if (!selectedCat) {
    return (
      <div>
        <div style={{background:'linear-gradient(135deg,#d97706,#f59e0b)',borderRadius:16,padding:'22px 20px',marginBottom:20,color:'#fff',boxShadow:'0 10px 25px rgba(217,119,6,0.2)'}}>
          <div style={{fontSize:11,letterSpacing:1,color:'rgba(255,255,255,0.9)',textTransform:'uppercase',fontWeight:800,marginBottom:8}}>🏷️ REAL-TIME DISCOUNTS</div>
          <div style={{fontFamily:'serif',fontSize:'1.3rem',fontWeight:800,marginBottom:6,wordBreak:'keep-all',lineHeight:1.3}}>관심 있는 카테고리의<br/>실시간 할인 정보를 확인하세요</div>
          <p style={{fontSize:13,color:'rgba(255,255,255,0.8)',lineHeight:1.6,margin:0,fontWeight:500}}>대형마트, 배달앱, 여행사 등 기업별 최신 세일 정보를 실시간으로 수집합니다.</p>
        </div>
        
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {Object.entries(DISCOUNT_CAT_STYLE).map(([name, info]) => (
            <button 
              key={name}
              onClick={() => fetchCategoryDiscounts(name)}
              style={{
                background:'#fff',border:'1.5px solid #f3f4f6',borderRadius:16,padding:'24px 16px',
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                gap:12,cursor:'pointer',transition:'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow:'0 4px 6px -1px rgba(0,0,0,0.05)',fontFamily:'inherit'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = '#fbbf24';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#f3f4f6';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
              }}
            >
              <div style={{fontSize:32,width:56,height:56,background:info.bg,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{info.icon}</div>
              <div style={{fontSize:15,fontWeight:800,color:'#1f2937'}}>{name}</div>
              <div style={{fontSize:11,color:'#9ca3af',fontWeight:500}}>실시간 혜택 확인 →</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{textAlign:'center',padding:'80px 20px'}}>
      <div style={{width:48,height:48,border:'3.5px solid #f3f4f6',borderTopColor:'#f59e0b',borderRadius:'50%',animation:'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',margin:'0 auto 20px'}}/>
      <div style={{fontSize:16,fontWeight:800,color:'#1f2937',marginBottom:6}}>{selectedCat} 할인 정보를 찾는 중...</div>
      <div style={{fontSize:13,color:'#6b7280'}}>AI가 각 기업의 실시간 이벤트 페이지를 분석하고 있습니다.</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <button onClick={() => setSelectedCat(null)} style={{background:'#f3f4f6',border:'none',borderRadius:10,padding:'8px 12px',fontSize:13,fontWeight:700,color:'#4b5563',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
          ← 뒤로가기
        </button>
        <div style={{fontSize:15,fontWeight:800,color:'#d97706'}}>{DISCOUNT_CAT_STYLE[selectedCat]?.icon} {selectedCat} 실시간 혜택</div>
      </div>

      {err && <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 18px',color:'#991b1b',fontSize:14,marginBottom:20}}><strong>오류 발생:</strong> {err}</div>}
      
      {discounts.length === 0 && !err && (
        <div style={{textAlign:'center',padding:'60px 20px',background:'#fff',borderRadius:20,border:'1px dashed #e5e7eb'}}>
          <div style={{fontSize:48,marginBottom:16}}>🔍</div>
          <div style={{fontSize:18,fontWeight:800,color:'#1f2937',marginBottom:8}}>현재 수집된 혜택이 없습니다</div>
          <div style={{fontSize:14,color:'#6b7280',lineHeight:1.6}}>다른 카테고리를 확인하시거나<br/>잠시 후 다시 실시간 검색을 시도해주세요.</div>
          <button onClick={() => fetchCategoryDiscounts(selectedCat)} style={{marginTop:20,padding:'10px 20px',borderRadius:12,border:'none',background:'#d97706',color:'#fff',fontWeight:700,cursor:'pointer'}}>다시 검색하기</button>
        </div>
      )}

      {Object.entries(grouped).map(([store, items]) => {
        const isExpanded = expandedStores[store];
        const displayItems = isExpanded ? items.slice(0, 7) : items.slice(0, 2);
        const hasMore = items.length > 2;

        return (
          <div key={store} style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,paddingLeft:4}}>
              <div style={{width:4,height:16,background:'#d97706',borderRadius:2}}/>
              <div style={{fontSize:16,fontWeight:800,color:'#111827'}}>{store}</div>
              <div style={{fontSize:12,color:'#9ca3af',fontWeight:500}}>{items.length}개 혜택</div>
            </div>

            {displayItems.map((d, i) => (
              <div key={i} style={{background:'#fff',border:'1px solid #f3f4f6',borderRadius:16,padding:'16px',marginBottom:12,boxShadow:'0 2px 8px rgba(0,0,0,0.03)'}}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:6,lineHeight:1.4}}>{d.title}</div>
                {d.discount && (
                  <div style={{display:'inline-flex',background:'#fffbeb',border:'1px solid #fef3c7',borderRadius:8,padding:'6px 10px',fontSize:13,fontWeight:800,color:'#b45309',marginBottom:10}}>
                    💰 {d.discount}
                  </div>
                )}
                {d.description && <div style={{fontSize:13,color:'#4b5563',lineHeight:1.6,marginBottom:12}}>{d.description}</div>}
                
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontSize:12,color:'#9ca3af',display:'flex',alignItems:'center',gap:4}}>
                    📅 {d.period || '상시'}
                  </div>
                  <button 
                    onClick={() => window.open(d.url, '_blank')}
                    style={{background:'#d97706',color:'#fff',border:'none',borderRadius:10,padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 10px rgba(217,119,6,0.2)'}}
                  >
                    할인받기 →
                  </button>
                </div>
              </div>
            ))}

            {hasMore && (
              <button 
                onClick={() => toggleStoreExpand(store)}
                style={{
                  width:'100%',padding:'12px',borderRadius:12,border:'1px solid #e5e7eb',
                  background:'#fff',color:'#6b7280',fontSize:13,fontWeight:700,cursor:'pointer',
                  transition:'all 0.2s',display:'flex',alignItems:'center',justifyContent:'center',gap:6
                }}
              >
                {isExpanded ? '간략히 보기 ↑' : `${store} 혜택 더보기 (총 ${items.length}개) ↓`}
              </button>
            )}
          </div>
        );
      })}

      <div style={{textAlign:'center',padding:'20px 0',fontSize:12,color:'#9ca3af',lineHeight:1.7}}>
        실시간 수집 특성상 정보가 다를 수 있습니다.<br/>상세 내용은 해당 기업 공식 앱/웹에서 확인하세요.
      </div>
    </div>
  );
}

// ─── CouponTab ────────────────────────────────────────────────────
const COUPONS = [
  // ── 쿠팡
  { id:'cp1', brand:'쿠팡', brandIcon:'🛒', brandColor:'#e04e3f', brandBg:'#fff1f0', category:'온라인쇼핑',
    title:'와우회원 로켓배송 5,000원 할인', discount:'5,000원',
    desc:'로켓배송 상품 3만원 이상 구매 시 5,000원 즉시 할인. 와우 회원이라면 매달 신규 발급 가능.',
    url:'https://www.coupang.com/np/coupangbenefit' },
  { id:'cp2', brand:'쿠팡', brandIcon:'🛒', brandColor:'#e04e3f', brandBg:'#fff1f0', category:'온라인쇼핑',
    title:'신규 와우 회원 첫 달 무료', discount:'월 7,890원',
    desc:'쿠팡 와우 멤버십 첫 달 무료 체험. 로켓배송·로켓프레시·쿠팡플레이 모두 포함. 가입 즉시 적용.',
    url:'https://loyalty.coupang.com/loyalty/sign-up/home' },
  { id:'cp3', brand:'쿠팡', brandIcon:'🛒', brandColor:'#e04e3f', brandBg:'#fff1f0', category:'온라인쇼핑',
    title:'로켓직구 10% 할인쿠폰', discount:'최대 10%',
    desc:'해외 직구 상품 10% 할인. 쿠폰함에서 다운로드 후 결제 시 자동 적용. 일부 브랜드 제외.',
    url:'https://www.coupang.com/np/coupangbenefit' },
  // ── 네이버쇼핑
  { id:'nv1', brand:'네이버 쇼핑', brandIcon:'🟢', brandColor:'#03c75a', brandBg:'#f0fff5', category:'온라인쇼핑',
    title:'네이버페이 첫 결제 3,000원 적립', discount:'3,000원',
    desc:'네이버페이 첫 결제 고객 대상 3,000 포인트 즉시 적립. 스마트스토어 전 상품 적용 가능.',
    url:'https://pay.naver.com/benefit' },
  { id:'nv2', brand:'네이버 쇼핑', brandIcon:'🟢', brandColor:'#03c75a', brandBg:'#f0fff5', category:'온라인쇼핑',
    title:'스마트스토어 알림받기 전용 쿠폰', discount:'최대 5,000원',
    desc:'관심 스토어 알림받기 설정 후 발급되는 단독 할인쿠폰. 스토어별 금액 상이. 앱에서 확인.',
    url:'https://shopping.naver.com' },
  { id:'nv3', brand:'네이버 쇼핑', brandIcon:'🟢', brandColor:'#03c75a', brandBg:'#f0fff5', category:'온라인쇼핑',
    title:'쇼핑라이브 시청 즉시 쿠폰', discount:'최대 3%',
    desc:'라이브 방송 시청 중 채팅창 "받기" 버튼 클릭 시 즉시 발급. 방송 종료 전까지만 사용 가능.',
    url:'https://shoppinglive.naver.com' },
  // ── SSG닷컴
  { id:'ssg1', brand:'SSG닷컴', brandIcon:'🛍️', brandColor:'#e20038', brandBg:'#fff0f3', category:'온라인쇼핑',
    title:'신규 가입 5,000원 할인쿠폰', discount:'5,000원',
    desc:'SSG닷컴 신규 회원 가입 즉시 발급. 2만원 이상 구매 시 사용 가능. 이마트몰·신세계몰 통합 적용.',
    url:'https://www.ssg.com/event/couponInfo.ssg' },
  { id:'ssg2', brand:'SSG닷컴', brandIcon:'🛍️', brandColor:'#e20038', brandBg:'#fff0f3', category:'온라인쇼핑',
    title:'SSG 오늘의 선착순 쿠폰', discount:'최대 7%',
    desc:'매일 오전 10시 선착순 발급. 신선식품·생필품·의류 전 카테고리 적용. 수량 소진 시 종료.',
    url:'https://www.ssg.com/event/couponInfo.ssg' },
  { id:'ssg3', brand:'SSG닷컴', brandIcon:'🛍️', brandColor:'#e20038', brandBg:'#fff0f3', category:'온라인쇼핑',
    title:'신세계 등급별 할인쿠폰 (GOLD↑)', discount:'최대 15%',
    desc:'GOLD 등급 이상 회원 전용. 매달 1일 자동 발급. 명품·뷰티·가전 구매 시 청구 할인 적용.',
    url:'https://www.ssg.com/event/eventMain.ssg' },
  // ── 11번가
  { id:'st1', brand:'11번가', brandIcon:'🏷️', brandColor:'#f04e23', brandBg:'#fff3ef', category:'온라인쇼핑',
    title:'십일절 브랜드 쿠폰북', discount:'최대 11%',
    desc:'매달 11일 자정 개최. 100개 이상 브랜드 단독 할인쿠폰 동시 오픈. 중복 할인 최대 3만원.',
    url:'https://www.11st.co.kr/browsing/CouponPlace.tmall?method=getCouponZoneMain&addCtgrNo=950089' },
  { id:'st2', brand:'11번가', brandIcon:'🏷️', brandColor:'#f04e23', brandBg:'#fff3ef', category:'온라인쇼핑',
    title:'아마존 글로벌 직구 무료배송', discount:'배송비 무료',
    desc:'아마존 글로벌 스토어 상품 무료배송 쿠폰. 3만원 이상 주문 시 적용. 단, 일부 대형 품목 제외.',
    url:'https://www.11st.co.kr/amazon/main' },
  { id:'st3', brand:'11번가', brandIcon:'🏷️', brandColor:'#f04e23', brandBg:'#fff3ef', category:'온라인쇼핑',
    title:'SKT T멤버십 추가 3,000원 할인', discount:'3,000원',
    desc:'SKT 회원 T멤버십 연동 시 결제금액에서 3,000원 추가 할인. 월 1회, 5만원 이상 구매 시 적용.',
    url:'https://www.11st.co.kr/browsing/CouponPlace.tmall?method=getCouponZoneMain&addCtgrNo=950089' },
  // ── G마켓
  { id:'gm1', brand:'G마켓', brandIcon:'💛', brandColor:'#1b5fc0', brandBg:'#eff5ff', category:'온라인쇼핑',
    title:'스마일배송 신규 3,000원 쿠폰', discount:'3,000원',
    desc:'스마일배송 상품 첫 구매 고객 전용. 1만5천원 이상 구매 시 적용. G마켓 앱에서 다운로드.',
    url:'https://promotion.gmarket.co.kr/Event/CouponZone.asp' },
  { id:'gm2', brand:'G마켓', brandIcon:'💛', brandColor:'#1b5fc0', brandBg:'#eff5ff', category:'온라인쇼핑',
    title:'유니버스 클럽 회원 5% 추가 쿠폰', discount:'5%',
    desc:'신세계 유니버스 클럽 가입 회원 전용. G마켓·SSG·신세계 통합 할인. 매달 자동 발급.',
    url:'https://promotion.gmarket.co.kr/Event/CouponZone.asp' },
  // ── 이마트
  { id:'em1', brand:'이마트', brandIcon:'🏪', brandColor:'#f6c200', brandBg:'#fffdf0', category:'마트·식품',
    title:'이마트 앱 전용 신선식품 20% 할인', discount:'20%',
    desc:'이마트 앱 로그인 후 [쿠폰함]에서 다운로드. 신선식품(채소·과일·육류) 카테고리 전용. 주 1회 한정.',
    url:'https://emart.ssg.com/event/eventMain.ssg' },
  { id:'em2', brand:'이마트', brandIcon:'🏪', brandColor:'#f6c200', brandBg:'#fffdf0', category:'마트·식품',
    title:'이마트 전단 행사 당일 추가 5% 할인', discount:'5%',
    desc:'이마트 주간 전단 행사 품목 구매 시 앱 쿠폰 제시하면 추가 5% 할인. 전단 앱에서 당일 확인 필수.',
    url:'https://emart.ssg.com/event/eventMain.ssg' },
  { id:'em3', brand:'이마트', brandIcon:'🏪', brandColor:'#f6c200', brandBg:'#fffdf0', category:'마트·식품',
    title:'이마트24 편의점 음료 1+1 쿠폰', discount:'1+1',
    desc:'이마트24 앱 회원 전용. 탄산음료·커피·주스 1+1 증정. 앱 내 [쿠폰받기] 후 현장 스캔.',
    url:'https://emart24.co.kr/event/ing' },
  // ── 롯데마트
  { id:'lm1', brand:'롯데마트', brandIcon:'🧡', brandColor:'#ed6b03', brandBg:'#fff5ef', category:'마트·식품',
    title:'롯데마트 GO 앱 3,000원 쿠폰', discount:'3,000원',
    desc:'롯데마트 GO 앱 설치 후 [쿠폰함] 에서 다운로드. 2만원 이상 구매 시 적용. 신선식품 제외.',
    url:'https://www.lotteon.com/promotion/couponzone/couponReceive?mall_no=4' },
  { id:'lm2', brand:'롯데마트', brandIcon:'🧡', brandColor:'#ed6b03', brandBg:'#fff5ef', category:'마트·식품',
    title:'L.POINT 회원 10배 적립 쿠폰', discount:'10배 적립',
    desc:'L.POINT 카드 소지 회원 전용. 지정 상품 구매 시 포인트 10배 적립. 매주 수요일 한정 발급.',
    url:'https://www.lotteon.com/promotion/couponzone/couponReceive?mall_no=4' },
  { id:'lm3', brand:'롯데마트', brandIcon:'🧡', brandColor:'#ed6b03', brandBg:'#fff5ef', category:'마트·식품',
    title:'롯데마트 금주의 반값 행사', discount:'50%',
    desc:'매주 목요일~수요일 운영. 인기 식품·생필품 50% 할인. 앱에서 당일 선착순 쿠폰 다운로드 필수.',
    url:'https://www.lotteon.com/promotion/couponzone/couponReceive?mall_no=4' },
  // ── 홈플러스
  { id:'hp1', brand:'홈플러스', brandIcon:'🟦', brandColor:'#1565c0', brandBg:'#eff5ff', category:'마트·식품',
    title:'첫 구매 5,000원 할인쿠폰', discount:'5,000원',
    desc:'홈플러스 멤버십 앱 신규 가입 후 첫 구매 시 즉시 할인. 온·오프라인 통합 3만원 이상 구매 시 적용.',
    url:'https://mfront.homeplus.co.kr/eventcoupon' },
  { id:'hp2', brand:'홈플러스', brandIcon:'🟦', brandColor:'#1565c0', brandBg:'#eff5ff', category:'마트·식품',
    title:'매일 오전 10시 선착순 쿠폰', discount:'최대 3,000원',
    desc:'앱 알림 수신 동의 시 오전 10시 자동 발송. 당일 사용 한정. 선착순 1만 명, 소진 즉시 마감.',
    url:'https://mfront.homeplus.co.kr/eventcoupon' },
  // ── CU
  { id:'cu1', brand:'CU', brandIcon:'🏬', brandColor:'#7b2fff', brandBg:'#f5f0ff', category:'편의점',
    title:'포켓CU 신상품 50% 할인쿠폰', discount:'50%',
    desc:'포켓CU 앱 매일 오전 11시 발급. 당월 출시 신상품 1개에 한해 50% 즉시 할인. 1일 1쿠폰 한정.',
    url:'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N' },
  { id:'cu2', brand:'CU', brandIcon:'🏬', brandColor:'#7b2fff', brandBg:'#f5f0ff', category:'편의점',
    title:'이달의 1+1 행사 쿠폰', discount:'1+1',
    desc:'포켓CU 앱에서 이달의 1+1 행사 상품 목록 확인 후 쿠폰 다운로드. 음료·과자·간편식 포함.',
    url:'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N' },
  { id:'cu3', brand:'CU', brandIcon:'🏬', brandColor:'#7b2fff', brandBg:'#f5f0ff', category:'편의점',
    title:'SKT T멤버십 CU 할인 쿠폰', discount:'최대 20%',
    desc:'SKT T멤버십 앱 연동 후 CU 결제 시 20% 청구 할인. 월 2회 사용 가능. 주류·담배 제외.',
    url:'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N' },
  // ── GS25
  { id:'gs1', brand:'GS25', brandIcon:'🟩', brandColor:'#1e7e34', brandBg:'#f0fff4', category:'편의점',
    title:'우리동네GS 픽업 10% 할인쿠폰', discount:'10%',
    desc:'우리동네GS 앱 픽업 예약 시 10% 할인. 도시락·베이커리·음료 전 품목 적용. 앱 주문 후 현장 수령.',
    url:'https://gs25.gsretail.com/customer-engagement/event/current-events' },
  { id:'gs2', brand:'GS25', brandIcon:'🟩', brandColor:'#1e7e34', brandBg:'#f0fff4', category:'편의점',
    title:'GS25 이달의 2+1 행사 쿠폰', discount:'2+1',
    desc:'우리동네GS 앱 이달의 행사 탭에서 2+1 상품 확인. 과자·음료·라면 등 매달 새 상품 업데이트.',
    url:'https://gs25.gsretail.com/customer-engagement/event/current-events' },
  { id:'gs3', brand:'GS25', brandIcon:'🟩', brandColor:'#1e7e34', brandBg:'#f0fff4', category:'편의점',
    title:'KT/LGU+ 제휴 할인 쿠폰', discount:'최대 20%',
    desc:'KT/LG U+ 멤버십 회원 전용. GS25 결제 시 20% 즉시 할인. 월 2회 한정. 담배·주류 제외.',
    url:'https://gs25.gsretail.com/customer-engagement/event/current-events' },
  // ── 세븐일레븐
  { id:'sl1', brand:'세븐일레븐', brandIcon:'7️⃣', brandColor:'#e63946', brandBg:'#fff0f0', category:'편의점',
    title:'세븐일레븐 앱 전용 1+1 쿠폰', discount:'1+1',
    desc:'세븐일레븐 앱 회원 전용. 이달의 1+1 인기 상품 쿠폰을 앱에서 다운로드 후 현장 스캔.',
    url:'https://m.7-eleven.co.kr/product/eventList.asp' },
  { id:'sl2', brand:'세븐일레븐', brandIcon:'7️⃣', brandColor:'#e63946', brandBg:'#fff0f0', category:'편의점',
    title:'세븐일레븐 모바일쿠폰 3,000원', discount:'3,000원',
    desc:'세븐일레븐 앱 첫 가입 회원에게 3,000원 할인쿠폰 즉시 발급. 1만원 이상 구매 시 사용 가능.',
    url:'https://m.7-eleven.co.kr/product/eventList.asp' },
  // ── 올리브영
  { id:'oy1', brand:'올리브영', brandIcon:'💄', brandColor:'#2c9f4b', brandBg:'#f0fff4', category:'패션·뷰티',
    title:'올리브영 앱 첫 구매 5,000원 할인', discount:'5,000원',
    desc:'올리브영 앱 설치 후 첫 온라인 구매 시 5,000원 할인. 2만원 이상 구매 적용. 배송비 별도.',
    url:'https://m.oliveyoung.co.kr/m/mtn?menu=event' },
  { id:'oy2', brand:'올리브영', brandIcon:'💄', brandColor:'#2c9f4b', brandBg:'#f0fff4', category:'패션·뷰티',
    title:'올영세일 추가 5% 쿠폰', discount:'추가 5%',
    desc:'올리브영 정기 세일 기간 중 앱에서 추가 5% 할인쿠폰 발급. 등급 무관 전 회원 대상.',
    url:'https://m.oliveyoung.co.kr/m/mtn?menu=event' },
  { id:'oy3', brand:'올리브영', brandIcon:'💄', brandColor:'#2c9f4b', brandBg:'#f0fff4', category:'패션·뷰티',
    title:'올영데이 멤버십 등급 쿠폰 (매달 15일)', discount:'최대 15%',
    desc:'매달 15일 올영데이. GOLD 이상 회원 전용 15% 쿠폰 자동 발급. 뷰티·헬스·생활용품 전 품목 적용.',
    url:'https://m.oliveyoung.co.kr/m/mtn?menu=event' },
  // ── 무신사
  { id:'ms1', brand:'무신사', brandIcon:'🧢', brandColor:'#1a1a1a', brandBg:'#f5f5f5', category:'패션·뷰티',
    title:'신규 가입 20% 할인쿠폰팩', discount:'20%',
    desc:'무신사 첫 가입 시 즉시 발급. 3만원 이상 구매 시 사용 가능. 스탠다드·솔드아웃 통합 적용.',
    url:'https://www.musinsa.com/coupon-service/coupon/coupon_online' },
  { id:'ms2', brand:'무신사', brandIcon:'🧢', brandColor:'#1a1a1a', brandBg:'#f5f5f5', category:'패션·뷰티',
    title:'무신사 등급별 정기 쿠폰 (VVIP)', discount:'최대 10%',
    desc:'VVIP 등급 회원 대상 매달 자동 발급. 신발·의류·아웃도어 전 카테고리. 금액 상한 없이 적용.',
    url:'https://www.musinsa.com/coupon-service/coupon/coupon_online' },
  { id:'ms3', brand:'무신사', brandIcon:'🧢', brandColor:'#1a1a1a', brandBg:'#f5f5f5', category:'패션·뷰티',
    title:'무신사 쿠폰 페스타 브랜드 쿠폰', discount:'최대 30%',
    desc:'분기별 쿠폰 페스타 기간 중 단독 브랜드 30% 쿠폰 발급. 상품 상세 페이지에서 개별 다운로드.',
    url:'https://www.musinsa.com/coupon-service/coupon/coupon_online' },
  // ── 배달의민족
  { id:'bm1', brand:'배달의민족', brandIcon:'🍱', brandColor:'#2ac1bc', brandBg:'#effffe', category:'외식·배달',
    title:'배민클럽 배달비 무료 쿠폰', discount:'배달비 무료',
    desc:'배민클럽 가입 시 월정액 내 배달비 무제한 무료. 미가입자는 첫 달 무료 체험 쿠폰 발급 가능.',
    url:'https://www.baemin.com' },
  { id:'bm2', brand:'배달의민족', brandIcon:'🍱', brandColor:'#2ac1bc', brandBg:'#effffe', category:'외식·배달',
    title:'첫 주문 3,000원 할인쿠폰', discount:'3,000원',
    desc:'배달의민족 앱 첫 주문 고객에게 3,000원 자동 발급. 최소 주문 금액 1만원 이상. 앱에서만 사용.',
    url:'https://www.baemin.com' },
  { id:'bm3', brand:'배달의민족', brandIcon:'🍱', brandColor:'#2ac1bc', brandBg:'#effffe', category:'외식·배달',
    title:'브랜드관 치킨·피자 2,000원 할인', discount:'2,000원',
    desc:'배민 브랜드관 참여 치킨·피자 전문점 한정. 앱 [쿠폰함]에서 다운로드. 주 1회, 2만원 이상 적용.',
    url:'https://www.baemin.com' },
  // ── 쿠팡이츠
  { id:'ce1', brand:'쿠팡이츠', brandIcon:'🥡', brandColor:'#e04e3f', brandBg:'#fff1f0', category:'외식·배달',
    title:'쿠팡이츠 첫 주문 50% 할인', discount:'최대 50%',
    desc:'쿠팡이츠 신규 가입 첫 주문 50% 즉시 할인. 최대 할인 1만원. 와우회원은 추가 10% 중복 가능.',
    url:'https://www.coupangeats.com' },
  { id:'ce2', brand:'쿠팡이츠', brandIcon:'🥡', brandColor:'#e04e3f', brandBg:'#fff1f0', category:'외식·배달',
    title:'와우 회원 배달비 무료 쿠폰', discount:'배달비 무료',
    desc:'쿠팡 와우 회원 전용. 월 2회 배달비 무료 쿠폰 자동 지급. 쿠팡이츠 앱 [혜택] 탭에서 확인.',
    url:'https://www.coupangeats.com' },
  // ── T멤버십
  { id:'tm1', brand:'T멤버십', brandIcon:'📡', brandColor:'#e83c2e', brandBg:'#fff0f0', category:'통신·생활',
    title:'T-Day 파리바게뜨 40% 할인', discount:'40%',
    desc:'매달 T멤버십 데이 참여 파리바게뜨 전 매장 40% 청구 할인. T world 앱에서 쿠폰 확인 후 바코드 제시.',
    url:'https://sktmembership.tworld.co.kr' },
  { id:'tm2', brand:'T멤버십', brandIcon:'📡', brandColor:'#e83c2e', brandBg:'#fff0f0', category:'통신·생활',
    title:'CGV 영화 관람권 50% 할인', discount:'50%',
    desc:'T멤버십 앱에서 CGV 쿠폰 발급 후 현장 적용. 일반 2D 상영관 한정. 주말·공휴일 포함 사용 가능.',
    url:'https://sktmembership.tworld.co.kr' },
  { id:'tm3', brand:'T멤버십', brandIcon:'📡', brandColor:'#e83c2e', brandBg:'#fff0f0', category:'통신·생활',
    title:'스타벅스 음료 30% 할인 쿠폰', discount:'30%',
    desc:'T 우주 회원 전용 스타벅스 음료 30% 할인. 월 4회 사용 가능. T world 앱에서 바코드 발급 후 사용.',
    url:'https://sktmembership.tworld.co.kr' },
  // ── KT멤버십
  { id:'kt1', brand:'KT 멤버십', brandIcon:'📱', brandColor:'#e8003d', brandBg:'#fff0f4', category:'통신·생활',
    title:'KT 나의 초이스 스타벅스 쿠폰', discount:'무료 음료 1잔',
    desc:'매달 1일 초이스 메뉴에서 스타벅스 선택 시 아메리카노 1잔 무료. KT 멤버십 앱에서 신청.',
    url:'https://membership.kt.com' },
  { id:'kt2', brand:'KT 멤버십', brandIcon:'📱', brandColor:'#e8003d', brandBg:'#fff0f4', category:'통신·생활',
    title:'CGV/롯데시네마 관람권 할인', discount:'최대 6,000원',
    desc:'KT 멤버십 VIP 고객 CGV/롯데시네마 6,000원 할인. 멤버십 앱 [나의 초이스]에서 월 1회 선택.',
    url:'https://membership.kt.com' },
  { id:'kt3', brand:'KT 멤버십', brandIcon:'📱', brandColor:'#e8003d', brandBg:'#fff0f4', category:'통신·생활',
    title:'베스킨라빈스 패밀리 사이즈 1+1', discount:'1+1',
    desc:'KT 멤버십 앱 제휴 혜택에서 베스킨라빈스 패밀리 사이즈 아이스크림 1+1 쿠폰 발급. 월 1회.',
    url:'https://membership.kt.com' },
  // ── 카카오페이
  { id:'kp1', brand:'카카오페이', brandIcon:'💛', brandColor:'#e6c000', brandBg:'#fffde0', category:'통신·생활',
    title:'카카오페이 결제 포인트 5% 적립', discount:'5% 적립',
    desc:'카카오페이 앱 내 지정 가맹점 결제 시 포인트 5% 자동 적립. 적립 포인트는 다음 결제 시 현금처럼 사용.',
    url:'https://www.kakaopay.com/promotion' },
  { id:'kp2', brand:'카카오페이', brandIcon:'💛', brandColor:'#e6c000', brandBg:'#fffde0', category:'통신·생활',
    title:'카카오쇼핑 전용 3,000원 할인쿠폰', discount:'3,000원',
    desc:'카카오톡 쇼핑하기 탭에서 카카오페이 결제 시 3,000원 즉시 할인. 2만원 이상 구매 시 적용.',
    url:'https://shopping.kakao.com' },
];
const COUPON_CATS = ['전체','온라인쇼핑','마트·식품','편의점','외식·배달','패션·뷰티','통신·생활'];
function CouponTab() {
  const [filter, setFilter] = useState('전체');
  const [brandFilter, setBrandFilter] = useState('전체');
  const filtered = (filter==='전체' ? COUPONS : COUPONS.filter(c => c.category===filter))
    .filter(c => brandFilter==='전체' || c.brand===brandFilter);
  const brandsInCategory = filter==='전체'
    ? [...new Set(COUPONS.map(c => c.brand))]
    : [...new Set(COUPONS.filter(c => c.category===filter).map(c => c.brand))];
  return (<div>
    <div style={{background:'linear-gradient(135deg,#7c3aed,#a855f7)',borderRadius:16,padding:'18px 20px',marginBottom:16,color:'#fff'}}>
      <div style={{fontSize:10,letterSpacing:0.5,color:'rgba(255,255,255,0.8)',textTransform:'uppercase',marginBottom:6}}>🎟️ 기업 할인쿠폰</div>
      <div style={{fontFamily:'serif',fontSize:'1.15rem',fontWeight:700,marginBottom:4,wordBreak:'keep-all'}}>기업 최신 할인쿠폰 모음</div>
      <p style={{fontSize:12,color:'rgba(255,255,255,0.8)',lineHeight:1.6,margin:0}}>각 쿠폰의 [쿠폰 받기] 버튼을 눌러 바로 받아가세요</p>
    </div>
    {/* 카테고리 필터 */}
    <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:4,marginBottom:10}}>
      {COUPON_CATS.map(cat => {
        const active = filter===cat;
        return (<button key={cat} onClick={() => { setFilter(cat); setBrandFilter('전체'); }} style={{flexShrink:0,padding:'6px 12px',border:`1.5px solid ${active?'#7c3aed':'#e5e7eb'}`,borderRadius:20,fontSize:12,fontWeight:active?700:500,background:active?'#7c3aed':'#fff',color:active?'#fff':'#6b6560',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{cat}</button>);
      })}
    </div>
    {/* 브랜드 필터 */}
    <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:4,marginBottom:16}}>
      {['전체',...brandsInCategory].map(b => {
        const active = brandFilter===b;
        return (<button key={b} onClick={() => setBrandFilter(b)} style={{flexShrink:0,padding:'5px 10px',border:`1.5px solid ${active?'#a855f7':'#e5e7eb'}`,borderRadius:16,fontSize:11,fontWeight:active?700:500,background:active?'#f5f0ff':'#fff',color:active?'#7c3aed':'#9ca3af',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{b}</button>);
      })}
    </div>
    {/* 쿠폰 목록 */}
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {filtered.map(c => (
        <div key={c.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:'16px',boxShadow:'0 1px 4px rgba(0,0,0,0.05)',boxSizing:'border-box'}}>
          {/* 브랜드 헤더 */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{width:32,height:32,borderRadius:10,background:c.brandBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{c.brandIcon}</div>
            <div>
              <div style={{fontSize:11,color:c.brandColor,fontWeight:700}}>{c.brand}</div>
              <div style={{fontSize:10,color:'#9ca3af'}}>{c.category}</div>
            </div>
            <div style={{marginLeft:'auto',background:c.brandBg,border:`1.5px solid ${c.brandColor}`,borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:800,color:c.brandColor,whiteSpace:'nowrap',flexShrink:0}}>{c.discount}</div>
          </div>
          {/* 쿠폰 제목 */}
          <div style={{fontSize:15,fontWeight:700,color:'#111827',marginBottom:6,lineHeight:1.4}}>{c.title}</div>
          {/* 설명 */}
          <div style={{fontSize:12,color:'#6b7280',lineHeight:1.65,marginBottom:12}}>{c.desc}</div>
          {/* 쿠폰 받기 버튼 */}
          <button
            onClick={() => window.open(c.url, '_blank')}
            style={{width:'100%',padding:'11px 0',border:'none',borderRadius:10,fontSize:13,fontWeight:700,background:c.brandColor,color:'#fff',cursor:'pointer',fontFamily:'inherit',letterSpacing:0.3}}
          >🎟️ 쿠폰 받기</button>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{textAlign:'center',padding:'40px 0',fontSize:14,color:'#9ca3af'}}>해당 조건의 쿠폰이 없습니다.</div>
      )}
    </div>
    <div style={{textAlign:'center',padding:'20px 0',fontSize:12,color:'#9ca3af',lineHeight:1.7,marginTop:8}}>쿠폰 받기 버튼을 누르면 해당 기업의 쿠폰 페이지로 이동합니다.<br/>로그인 후 쿠폰을 다운로드하세요.</div>
  </div>);
}

// ─── ProfileTab ───────────────────────────────────────────────────
function ProfileTab({user,onLogout,savedCount}){return(<div style={{maxWidth:480,margin:'0 auto'}}><div style={{...CS,textAlign:'center',padding:'32px 24px',marginBottom:14}}><div style={{width:68,height:68,borderRadius:'50%',background:'linear-gradient(135deg,#1a6b6b,#0d4f4f)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.76rem',fontWeight:900,color:'#c9a84c',margin:'0 auto 14px',fontFamily:'serif'}}>{user.name?.charAt(0)||'?'}</div><div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700,marginBottom:3}}>{user.name}</div><div style={{fontSize:14,color:'#6b6560',marginBottom:20}}>{user.provider==='kakao'?'카카오 계정':user.provider==='naver'?'네이버 계정':formatPhone(user.phone)}</div><div style={{display:'flex',justifyContent:'center',gap:32,padding:'16px 0',borderTop:'1px solid #f0ebe0',borderBottom:'1px solid #f0ebe0',marginBottom:20}}><div style={{textAlign:'center'}}><div style={{fontSize:'1.98rem',fontWeight:900,color:'#1a6b6b',lineHeight:1}}>{savedCount}</div><div style={{fontSize:12,color:'#6b6560',marginTop:3}}>저장한 혜택</div></div><div style={{textAlign:'center'}}><div style={{fontSize:'1.10rem',fontWeight:700,color:'#c9a84c',lineHeight:1,paddingTop:4}}>{new Date(user.createdAt).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})}</div><div style={{fontSize:12,color:'#6b6560',marginTop:3}}>가입일</div></div></div><button onClick={onLogout} style={BP({width:'100%',padding:'12px',background:'#fee2e2',color:'#991b1b',borderRadius:10,fontSize:14})}>로그아웃</button></div><div style={{background:'#ede8dc',borderRadius:12,padding:'14px 16px',fontSize:13,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>💡 안내</strong><br/>저장된 혜택은 이 기기의 localStorage에 보관됩니다. 캘린더 알림은 브라우저 알림 권한을 허용하면 자동으로 작동합니다.</div></div>);}

// ─── Root App ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('analyze');
  const [savedCount, setSavedCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false); // 랜딩 → 인증 전환
  const [analyzeResults, setAnalyzeResults] = useState(null);

  // API 키 없으면 경고 배너 표시
  const noKey = !API_KEY;

  useEffect(() => {
    // OAuth 콜백 처리 (카카오/네이버 리다이렉트 후 ?code= 파라미터 감지)
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) {
      handleOAuthCallback()
        .then(info => {
          if (!info) return;
          const existing = getUser(info.id);
          if (existing) {
            login(existing);
          } else {
            const u = registerUser({ name: info.name, phone: info.id, uid: info.id, provider: info.provider });
            login(u);
          }
        })
        .catch(e => { console.error('[OAuth]', e.message); })
        .finally(() => setReady(true));
      return;
    }
    const s = getSession();
    if (s) setUser(s);
    setReady(true);
  }, []);

  // 안드로이드 뒤로가기 버튼: analyze 탭이면 앱 종료, 나머지는 analyze로 이동
  useEffect(() => {
    if (!IS_NATIVE || !CapApp) return;
    let cleanup = null;
    CapApp.addListener('backButton', () => {
      if (tab === 'analyze') {
        import('@capacitor/app').then(({ App }) => App.exitApp()).catch(()=>{});
      } else {
        setTab('analyze');
      }
    }).then(h => { cleanup = h; });
    return () => { cleanup?.remove(); };
  }, [tab]);

  const login = (u) => { saveSession(u); setUser(u); };
  const logout = () => { clearSession(); setUser(null); setTab('analyze'); };
  const refreshCount = useCallback(() => {
    if (!user) return;
    setSavedCount(sList(`benefit_item:${user.phone}:`).length);
  }, [user]);
  useEffect(() => { refreshCount(); }, [refreshCount]);

  if (!ready) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:C.grad}}>
      <BrandLogo size={80} style={{marginBottom:16,filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.25))'}}/>
      <span style={{fontFamily:'serif',fontWeight:900,fontSize:'1.9rem',color:'#fff',letterSpacing:-1}}>네모<span style={{background:'linear-gradient(135deg,#A7F3D0 0%,#6EE7B7 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>혜</span></span>
      <div style={{width:32,height:3,background:'rgba(255,255,255,0.6)',borderRadius:4,marginTop:20,animation:'wid 1s ease-in-out infinite alternate'}}/>
      <style>{`@keyframes wid{from{width:20px}to{width:44px}}`}</style>
    </div>
  );
  if (!user) {
    if (!showAuth) return <LandingScreen onStartAuth={()=>setShowAuth(true)}/>;
    return <AuthScreen onLogin={login}/>;
  }

  // 하단 탭 바 정의 (아이콘, 레이블, 탭ID)
  // 인생·결혼·부동산 탭은 숨김 보관 (코드 유지, 네비게이션에서 제외)
  const BOTTOM_TABS = [
    {v:'analyze',  icon:'✦',  label:'혜택'},
    {v:'discount', icon:'🏷️', label:'할인'},
    {v:'coupon',   icon:'🎟️', label:'쿠폰'},
    {v:'saved',    icon:'📁', label:`보관함${savedCount>0?` ${savedCount}`:''}` },
    {v:'profile',  icon:'👤', label:'MY'},
  ];

  // 페이지별 메타
  const PAGE_META = {
    analyze:     {title:'혜택 설계', sub:'나이·지역·상황을 입력하면 맞춤 혜택을 찾아드려요'},
    discount:    {title:'전국 할인 행사', sub:'마트·백화점·온라인쇼핑·편의점 할인 이벤트를 모아드려요'},
    coupon:      {title:'기업 할인쿠폰', sub:'주요 기업 쿠폰 페이지로 바로 이동하세요'},
    // 숨김 탭 (코드 보관용)
    life:        {title:'인생 설계', sub:'목표와 재정 상황으로 현실적인 단계별 플랜을 설계해드려요'},
    wedding:     {title:'결혼 설계', sub:'예산·지역·스타일 입력 → 스드메·웨딩홀 추천 + 일정 캘린더'},
    realestate:  {title:'부동산 설계', sub:'집 유형과 조건으로 매물·대출·정부 지원을 한 번에 분석해드려요'},
    saved:       {title:'내 혜택 보관함', sub:'저장한 혜택과 마감 캘린더를 확인하세요'},
    profile:     {title:'내 정보', sub:''},
    admin:       {title:'Admin 회원 관리', sub:''},
  };
  const meta = PAGE_META[tab] || PAGE_META.analyze;

  return (
    <div style={{fontFamily:"'Noto Sans KR', sans-serif",background:C.bg,minHeight:'100vh',color:C.text1}}>
      <style>{`*{-webkit-tap-highlight-color:transparent}input:focus,select:focus{border-color:${C.primary}!important;box-shadow:0 0 0 3px rgba(22,163,74,0.12)}`}</style>

      {/* API 키 없을 때 경고 배너 */}
      {noKey && (
        <div style={{background:'#DC2626',color:'#fff',padding:'10px 20px',textAlign:'center',fontSize:13.5,lineHeight:1.6,paddingTop:'calc(10px + env(safe-area-inset-top,0px))'}}>
          ⚠️ <strong>VITE_ANTHROPIC_KEY</strong> 환경변수가 설정되지 않았습니다.
        </div>
      )}

      {/* ── 혜택설계 탭: 헤더 + 히어로 통합 그린 블록 ───── */}
      {tab==='analyze'&&(
        <div style={{
          background:'linear-gradient(145deg,#14613d 0%,#177a4a 50%,#239a60 100%)',
          borderRadius:'0 0 36px 36px',
          overflow:'hidden',
          paddingTop:'env(safe-area-inset-top,0px)',
          position:'relative',
        }}>
          {/* 헤더 행 */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',height:56}}>
            <div onClick={()=>setTab('analyze')} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <BrandLogo size={32} style={{flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:'1.2rem',color:'#fff',letterSpacing:-0.3}}>네모혜</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {user?.isAdmin&&(
                <button onClick={()=>setTab('admin')} style={{background:'rgba(255,255,255,0.12)',border:'none',color:'#fff',width:36,height:36,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              )}
              <div onClick={()=>setTab('profile')} style={{width:36,height:36,borderRadius:'50%',cursor:'pointer',flexShrink:0,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#177a4a',fontSize:14,fontWeight:800,boxShadow:'0 2px 6px rgba(0,0,0,0.15)'}}>
                {user.name?.charAt(0)||'?'}
              </div>
            </div>
          </div>
          {/* 히어로 본문 */}
          <div style={{padding:'16px 20px 52px',textAlign:'center'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:20,padding:'6px 14px',marginBottom:14}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="#fde047"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              <span style={{color:'#fff',fontSize:11,fontWeight:600,letterSpacing:0.5}}>{analyzeResults?'분석 완료':'사용자 맞춤 혜택 분석'}</span>
            </div>
            {analyzeResults?(
              <>
                <h1 style={{color:'#fff',fontSize:22,fontWeight:700,lineHeight:1.3,margin:'0 0 8px',letterSpacing:-0.3}}>
                  {user.name}님을 위한<br/>
                  <span style={{color:'#fde047'}}>{(analyzeResults.benefits||[]).length}개</span>의 맞춤 혜택을 찾았어요
                </h1>
                <p style={{color:'rgba(255,255,255,0.8)',fontSize:14,fontWeight:500,margin:0,lineHeight:1.4}}>
                  입력하신 정보를 바탕으로 가장 적합한 혜택입니다.
                </p>
              </>
            ):(
              <>
                <h1 style={{color:'#fff',fontSize:22,fontWeight:700,lineHeight:1.3,margin:'0 0 8px',letterSpacing:-0.3}}>
                  안녕하세요, {user.name}님 👋
                </h1>
                <p style={{color:'rgba(255,255,255,0.8)',fontSize:15,fontWeight:500,margin:0,lineHeight:1.4}}>
                  숨은 혜택을 모두 찾아드려요
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 다른 탭: sticky 헤더 ─────────────────────────── */}
      {tab!=='analyze'&&(
        <header style={{background:C.dark,position:'sticky',top:0,zIndex:200,paddingTop:'env(safe-area-inset-top,0px)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',height:56}}>
            <div onClick={()=>setTab('analyze')} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <BrandLogo size={32} style={{flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:'1.2rem',color:'#fff',letterSpacing:-0.3}}>네모혜</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              {user?.isAdmin&&(
                <button onClick={()=>setTab('admin')} style={{background:'rgba(255,255,255,0.12)',border:'none',color:'#fff',width:36,height:36,borderRadius:'50%',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              )}
              <div onClick={()=>setTab('profile')} style={{width:36,height:36,borderRadius:'50%',cursor:'pointer',flexShrink:0,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#177a4a',fontSize:14,fontWeight:800,boxShadow:'0 2px 6px rgba(0,0,0,0.15)'}}>
                {user.name?.charAt(0)||'?'}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* ── 비-혜택설계 탭 페이지 서브헤더 ─────────────────── */}
      {tab!=='analyze'&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'20px 20px 18px'}}>
          <div style={{maxWidth:760,margin:'0 auto'}}>
            <h1 style={{fontFamily:'serif',fontSize:'1.45rem',fontWeight:800,color:C.text1,marginBottom:4}}>{meta.title}</h1>
            {meta.sub&&<p style={{fontSize:13.5,color:C.text2,lineHeight:1.6}}>{meta.sub}</p>}
          </div>
        </div>
      )}

      {/* ── 탭 콘텐츠 ─────────────────────────────────────── */}
      <div style={{maxWidth:760,margin:'0 auto',padding:'16px 16px 100px',position:'relative',zIndex:10,marginTop:tab==='analyze'?-28:0}}>
        {tab==='analyze'    && <AnalyzeTab user={user} onSaved={refreshCount} onResultsReady={setAnalyzeResults}/>}
        {tab==='discount'   && <DiscountTab/>}
        {tab==='coupon'     && <CouponTab/>}
        {/* 숨김 탭 (코드 보관) */}
        {tab==='life'       && <LifeTab user={user}/>}
        {tab==='wedding'    && <WeddingTab user={user}/>}
        {tab==='realestate' && <RealEstateTab user={user}/>}
        {tab==='saved'      && <SavedTab user={user}/>}
        {tab==='profile'    && <ProfileTab user={user} onLogout={logout} savedCount={savedCount}/>}
        {tab==='admin' && user?.isAdmin && <AdminTab/>}
      </div>

      {/* ── 하단 탭 바 ───────────────────────────────────── */}
      <nav style={{
        position:'fixed',bottom:0,left:0,right:0,
        background:C.surface,
        borderTop:`1px solid ${C.border}`,
        paddingBottom:'env(safe-area-inset-bottom,0px)',
        display:'flex',
        zIndex:200,
        boxShadow:'0 -4px 24px rgba(15,23,42,0.09)',
      }}>
        {BOTTOM_TABS.map(({v,icon,label})=>{
          const active=tab===v;
          return(
            <button key={v} onClick={()=>setTab(v)} style={{
              flex:1,display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',gap:3,height:60,border:'none',
              background:'transparent',cursor:'pointer',fontFamily:'inherit',
              padding:'6px 2px',position:'relative',
              transition:'color 0.15s',
            }}>
              {/* 상단 액티브 바 */}
              {active&&<div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:28,height:3,background:C.primary,borderRadius:'0 0 3px 3px'}}/>}
              <span style={{fontSize:18,lineHeight:1,filter:active?'none':'grayscale(40%) opacity(0.6)'}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:active?700:500,color:active?C.primary:C.text3,letterSpacing:0.2,whiteSpace:'nowrap'}}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
