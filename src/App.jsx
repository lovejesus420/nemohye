import { useState, useRef, useEffect, useCallback } from "react";
import {
  ADMIN_ID, ADMIN_PW,
  sendOTP, verifyOTP,
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
const GG_BASE      = IS_DEV ? '/api/gg'      : `${import.meta.env.VITE_API_BASE || ''}/api/gg`;
const SEOUL_BASE   = IS_DEV ? '/api/seoul'   : `${import.meta.env.VITE_API_BASE || ''}/api/seoul`;

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
function AddrInput({value,onChange}){const[sugg,setSugg]=useState([]);const[ai,setAi]=useState(-1);const[open,setOpen]=useState(false);const ref=useRef();useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);const onInput=v=>{onChange(v);const s=buildSugg(v.trim());setSugg(s);setOpen(s.length>0);setAi(-1);};const pick=s=>{onChange(s.full);setOpen(false);setSugg([]);};const hi=(t,q)=>{const i=t.indexOf(q);if(i<0)return t;return<>{t.slice(0,i)}<strong style={{color:'#1a6b6b'}}>{t.slice(i,i+q.length)}</strong>{t.slice(i+q.length)}</>;};return(<div ref={ref} style={{position:'relative'}}><input value={value} onChange={e=>onInput(e.target.value)} placeholder="예: 서울특별시 마포구" autoComplete="off" style={IS} onFocus={()=>{if(sugg.length)setOpen(true);}} onKeyDown={e=>{if(!open)return;if(e.key==='ArrowDown'){e.preventDefault();setAi(i=>Math.min(i+1,sugg.length-1));}else if(e.key==='ArrowUp'){e.preventDefault();setAi(i=>Math.max(i-1,0));}else if(e.key==='Enter'&&ai>=0){e.preventDefault();pick(sugg[ai]);}else if(e.key==='Escape')setOpen(false);}}/>{open&&sugg.length>0&&(<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1.5px solid #1a6b6b',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:500,overflow:'hidden',maxHeight:220,overflowY:'auto'}}>{sugg.map((s,i)=>(<div key={s.full} onMouseDown={()=>pick(s)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0ebe0',background:i===ai?'#edf6f6':'#fff',fontSize:14}}><div style={{fontWeight:600}}>{hi(s.full,value.trim())}</div><div style={{fontSize:12,color:'#6b6560'}}>{s.sido}</div></div>))}</div>)}<p style={{fontSize:12,color:'#9ca3af',marginTop:3}}>시/도와 시/군/구까지 입력하면 자동완성됩니다</p></div>);}

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
function Logo({size=38}){return(<svg width={size} height={size} viewBox="0 0 42 42" fill="none"><rect x="2" y="2" width="38" height="38" rx="9" stroke={C.gold} strokeWidth="2.2"/><line x1="21" y1="11.5" x2="21" y2="14.5" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="21" y1="27.5" x2="21" y2="30.5" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="11.5" y1="21" x2="14.5" y2="21" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="27.5" y1="21" x2="30.5" y2="21" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="14.3" y1="14.3" x2="16.4" y2="16.4" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="25.6" y1="25.6" x2="27.7" y2="27.7" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="27.7" y1="14.3" x2="25.6" y2="16.4" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><line x1="14.3" y1="27.7" x2="16.4" y2="25.6" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round"/><circle cx="21" cy="21" r="4.5" fill={C.gold}/></svg>);}
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
  {kw:['실업급여','구직급여'],url:'https://www.work.go.kr/benefitService/doReceivingBenefit.do'},
  {kw:['국민취업지원제도','취업지원제도'],url:'https://www.work.go.kr/empSpt/doEmpSptInfo.do'},
  {kw:['청년일자리도약장려금','일자리도약'],url:'https://www.work.go.kr/youngWork/doYoungWork.do'},
  {kw:['청년내일채움공제','내일채움공제'],url:'https://www.work.go.kr/youngtomorrow/main/main.do'},
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
  // ── 주거 (LH / HF / 주택도시기금) ──
  {kw:['청년월세','청년 월세'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['행복주택'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['전세임대','매입임대'],url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do'},
  {kw:['버팀목 전세자금','버팀목전세'],url:'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp'},
  {kw:['디딤돌 대출','디딤돌대출'],url:'https://nhuf.molit.go.kr/FP/FP05/FP0502/FP05020201.jsp'},
  {kw:['주거급여'],url:'https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcList.do'},
  // ── 청년 특화 ──
  {kw:['청년도약계좌'],url:'https://kinfa.or.kr/youth/youth01.do'},
  {kw:['청년희망적금'],url:'https://kinfa.or.kr/youth/youth02.do'},
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
  {kw:['희망두배 청년통장','희망두배청년통장'],url:'https://youth.seoul.go.kr/content.do?key=2310100069'},
  {kw:['서울 청년 마음건강','청년 마음건강 지원','청년마음건강'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=20250519005400210855'},
  {kw:['은둔청년','고립청년','청년 고립'],url:'https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=R2023050912524'},
  // ── 서울청년몽땅정보통 — 주거 ──
  {kw:['서울 청년 월세','서울청년 월세 지원'],url:'https://youth.seoul.go.kr/content.do?key=2310100046'},
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
  'sbcrc.or.kr':'https://www.sbcrc.or.kr/site/main/apply/applyView',
  'kosaf.go.kr':'https://www.kosaf.go.kr/ko/loan.do?pg=loan01_01',
  'hometax.go.kr':'https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=WME3000',
  'kinfa.or.kr':'https://kinfa.or.kr/youth/youth01.do',
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
};
function getBestApplyUrl(url, title='', institution=''){
  const haystack=(title+' '+institution).toLowerCase();
  // 1) 키워드 매핑 우선
  for(const{kw,url:dest}of KNOWN_BENEFIT_URLS){
    if(kw.some(k=>haystack.includes(k.toLowerCase())))return dest;
  }
  if(!url)return'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do';
  try{
    const parsed=new URL(url);
    const host=parsed.hostname.replace(/^www\./,'');
    // 2) 이미 서브페이지면 그대로
    if(parsed.pathname&&parsed.pathname!=='/'&&parsed.pathname.length>1)return url;
    // 3) 도메인 매핑
    for(const[domain,dest]of Object.entries(APPLY_DOMAIN_MAP)){
      if(host===domain||host.endsWith('.'+domain))return dest;
    }
  }catch{}
  return url||'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do';
}

// ─── 청년도약계좌 은행 목록 ────────────────────────────────────────
const DOYAK_BANKS = [
  {name:'KB국민은행', icon:'🟡', url:'https://obank.kbstar.com/quics?page=C021590'},
  {name:'신한은행',   icon:'🔵', url:'https://bank.shinhan.com/index.jsp#010203040000'},
  {name:'하나은행',   icon:'🟢', url:'https://www.kebhana.com/cont/mall/mall08/mall0808/mall080801/1474584_115099.jsp'},
  {name:'우리은행',   icon:'🔵', url:'https://spot.wooribank.com/pot/Dream?withyou=PODEP0104'},
  {name:'NH농협은행', icon:'🟢', url:'https://banking.nonghyup.com/nhbank.html'},
  {name:'IBK기업은행',icon:'🔵', url:'https://www.ibk.co.kr/contents.do?menuNo=100491'},
  {name:'BNK부산은행',icon:'🟠', url:'https://bbs.bnkfg.com/'},
  {name:'BNK경남은행',icon:'🟠', url:'https://www.knbank.co.kr/'},
  {name:'DGB대구은행',icon:'🟣', url:'https://www.dgb.co.kr/'},
  {name:'광주은행',   icon:'🔴', url:'https://www.kjbank.com/'},
  {name:'전북은행',   icon:'🔴', url:'https://www.jbbank.co.kr/'},
];
function isDoyak(title=''){ return title.includes('청년도약계좌'); }

// ─── BCard ────────────────────────────────────────────────────────
const SOURCE_COLOR={'정부복지':'#1e3a5f','지자체':'#166534','금융/은행':'#1e40af','공공기관':'#5b21b6','기업/협회':'#b45309','민간/NGO':'#be185d'};
function BCard({b,savedIds,onToggleSave}){const bg=CAT_COLOR[b.category]||'#f3f4f6';const isSaved=savedIds?.has(String(b.id));const dl=parseDeadline(b.deadline);const days=daysLeft(dl);const[calOpen,setCalOpen]=useState(false);const[bankOpen,setBankOpen]=useState(false);
const srcColor=SOURCE_COLOR[b.source]||'#374151';
return(<div style={{background:C.surface,border:`1.5px solid ${isSaved?C.teal:b.isHidden?'#7c3aed':C.border}`,borderRadius:16,padding:'18px 20px',marginBottom:10,boxShadow:isSaved?`0 0 0 3px rgba(14,116,144,0.10)`:b.isHidden?'0 0 0 2px rgba(124,58,237,0.08)':'0 2px 12px rgba(15,23,42,0.05)',position:'relative',overflow:'hidden'}}>
  {b.isHidden&&<div style={{position:'absolute',top:0,right:0,background:'linear-gradient(135deg,#7c3aed,#5b21b6)',color:'#fff',fontSize:9,fontWeight:700,padding:'3px 10px',borderRadius:'0 16px 0 10px',letterSpacing:1}}>숨겨진 혜택</div>}
  <div style={{display:'flex',gap:12,marginBottom:10}}>
    <div style={{width:42,height:42,borderRadius:12,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:21,flexShrink:0}}>{b.categoryIcon||'📋'}</div>
    <div style={{flex:1}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:5}}>
        {b.source&&<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:srcColor,color:'#fff'}}>{b.sourceIcon||''} {b.source}</span>}
        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:C.bg,color:C.text2}}>{b.category}</span>
        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:b.scope==='전국'?'#DBEAFE':'#FCE7F3',color:b.scope==='전국'?'#1e40af':'#9d174d'}}>{b.scope}</span>
        {b.isUrgent&&<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#FEE2E2',color:C.err}}>⚡ 긴급</span>}
        {days!==null&&days<=30&&days>=0&&<span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#FEF9C3',color:'#854d0e'}}>D-{days}</span>}
      </div>
      <div style={{fontFamily:'serif',fontSize:14,fontWeight:700,marginBottom:2,color:C.text1,lineHeight:1.3}}>{b.title}</div>
      <div style={{fontSize:12,color:C.text2}}>{b.institution}</div>
    </div>
    {onToggleSave&&(<button onClick={()=>onToggleSave(b)} style={{width:36,height:36,flexShrink:0,border:`1.5px solid ${isSaved?C.teal:C.border}`,borderRadius:10,background:isSaved?'#E0F2F7':'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔖</button>)}
  </div>
  <div style={{borderTop:'1px solid #f0ebe0',paddingTop:12}}>
    <p style={{fontSize:13,color:'#3a3a3a',lineHeight:1.7,marginBottom:10}}>{b.description}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginBottom:10}}>
      {[{l:'💰 지원 내용',v:b.amount,c:'#1a6b6b'},{l:'📅 신청 기한',v:b.deadline||'수시',c:days!==null&&days<=14?'#c94f1a':'#374151'},{l:'📌 신청 방법',v:b.howToApply}].map(({l,v,c})=>(<div key={l} style={{background:'#faf7f2',borderRadius:8,padding:8}}><div style={{fontSize:9,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:0,marginBottom:3}}>{l}</div><div style={{fontSize:11,fontWeight:600,color:c||'#0d1117',lineHeight:1.3,wordBreak:'break-all'}}>{v||'-'}</div></div>))}
    </div>
    {b.requiredDocuments?.length>0&&(<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,marginBottom:5}}>📂 필요 서류</div><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{b.requiredDocuments.map(d=><span key={d} style={{background:'#f0ebe0',border:'1px solid #d4cdc2',borderRadius:5,padding:'3px 8px',fontSize:12}}>📄 {d}</span>)}</div></div>)}
    <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
      {isDoyak(b.title)
        ? (<div style={{position:'relative'}}>
            <button onClick={()=>setBankOpen(p=>!p)} style={{display:'inline-flex',alignItems:'center',gap:5,background:'#0d1117',color:'#fff',fontSize:13,fontWeight:700,padding:'8px 14px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'inherit'}}>🏦 은행 선택하기 ▾</button>
            {bankOpen&&(<div style={{position:'absolute',bottom:'calc(100% + 6px)',left:0,background:'#fff',border:'1.5px solid #d4cdc2',borderRadius:14,boxShadow:'0 10px 32px rgba(0,0,0,0.14)',zIndex:400,minWidth:210,overflow:'hidden'}}>
              <div style={{padding:'10px 14px',background:'#0d1117',fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.8)',textTransform:'uppercase',letterSpacing:1}}>청년도약계좌 신청 은행</div>
              {DOYAK_BANKS.map(bk=>(<a key={bk.name} href={bk.url} target="_blank" rel="noreferrer" onClick={()=>setBankOpen(false)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',borderBottom:'1px solid #f0ebe0',textDecoration:'none',color:'#0d1117',fontSize:14,fontWeight:600,background:'#fff'}}><span style={{fontSize:18}}>{bk.icon}</span>{bk.name}<span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>신청 →</span></a>))}
            </div>)}
          </div>)
        : (<a href={getBestApplyUrl(b.applyUrl,b.title,b.institution)} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,background:'#0d1117',color:'#fff',fontSize:13,fontWeight:700,padding:'8px 14px',borderRadius:7,textDecoration:'none'}}>신청하러 가기 →</a>)
      }
      {dl&&(<div style={{position:'relative'}}>
        <button onClick={()=>setCalOpen(p=>!p)} style={BP({padding:'7px 12px',fontSize:13,borderRadius:7,background:'#edf6f6',color:'#1a6b6b',display:'flex',alignItems:'center',gap:5})}>📅 캘린더 알림</button>
        {calOpen&&(<div style={{position:'absolute',bottom:'calc(100% + 6px)',left:0,background:'#fff',border:'1.5px solid #d4cdc2',borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:300,minWidth:220,overflow:'hidden'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid #f0ebe0',fontSize:12,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:1}}>알림 추가</div>
          <button onClick={()=>{openGoogleCalendar(b);setCalOpen(false);}} style={{width:'100%',background:'none',border:'none',padding:'12px 14px',textAlign:'left',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #f0ebe0'}}><span style={{fontSize:18}}>📱</span><div><div style={{fontWeight:600,color:'#0d1117'}}>구글/삼성 캘린더</div><div style={{fontSize:12,color:'#6b6560'}}>캘린더 앱 바로 열기</div></div></button>
          <button onClick={()=>{downloadICS(b);setCalOpen(false);}} style={{width:'100%',background:'none',border:'none',padding:'12px 14px',textAlign:'left',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #f0ebe0'}}><span style={{fontSize:18}}>📥</span><div><div style={{fontWeight:600,color:'#0d1117'}}>ICS 파일 다운로드</div><div style={{fontSize:12,color:'#6b6560'}}>모든 캘린더 앱 지원</div></div></button>
          <button onClick={()=>{sendKakaoMe(b);setCalOpen(false);}} style={{width:'100%',background:'none',border:'none',padding:'12px 14px',textAlign:'left',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}><span style={{width:22,height:22,background:'#FEE500',borderRadius:5,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:14}}>💬</span><div><div style={{fontWeight:600,color:'#0d1117'}}>카카오톡으로 받기</div><div style={{fontSize:12,color:'#6b6560'}}>나에게 보내기 복사</div></div></button>
        </div>)}
      </div>)}
      {onToggleSave&&(<button onClick={()=>onToggleSave(b)} style={BP({padding:'7px 12px',fontSize:13,borderRadius:7,background:isSaved?'#edf6f6':'#f5f0e8',color:isSaved?'#1a6b6b':'#6b6560',display:'flex',alignItems:'center',gap:5})}>{isSaved?'✓ 저장됨':'+ 보관함 저장'}</button>)}
    </div>
  </div>
</div>);}

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
            <div style={{width:44,height:44,background:'linear-gradient(135deg,#22C55E 0%,#16A34A 50%,#14532D 100%)',borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(22,163,74,0.45)',flexShrink:0}}>
              <svg width="26" height="26" viewBox="125 75 250 225" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
                <rect x="175" y="180" width="150" height="110" strokeWidth="14"/>
                <rect x="160" y="150" width="180" height="30" rx="4" strokeWidth="14"/>
                <line x1="250" y1="150" x2="250" y2="290" strokeWidth="14"/>
                <path d="M 250 150 C 200 90, 140 130, 190 150 Z" strokeWidth="12"/>
                <path d="M 250 150 C 300 90, 360 130, 310 150 Z" strokeWidth="12"/>
                <path d="M 250 150 L 210 200" strokeWidth="12"/>
                <path d="M 250 150 L 290 200" strokeWidth="12"/>
              </svg>
            </div>
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
  const[step,setStep]=useState('phone'); // 'phone'|'otp'|'name'|'admin'
  const[phone,setPhone]=useState('');
  const[code,setCode]=useState('');
  const[name,setName]=useState('');
  const[adminId,setAdminId]=useState('');
  const[adminPw,setAdminPw]=useState('');
  const[msg,setMsg]=useState({type:'',text:''});
  const[busy,setBusy]=useState(false);
  const[verifiedInfo,setVerifiedInfo]=useState(null);

  const showErr=t=>setMsg({type:'err',text:t});
  const showOk=t=>setMsg({type:'ok',text:t});
  const clearMsg=()=>setMsg({type:'',text:''});

  const doSendOTP=async()=>{
    const p=phone.replace(/\D/g,'');
    if(p.length<10){showErr('올바른 휴대폰 번호를 입력해 주세요.');return;}
    setBusy(true);clearMsg();
    try{
      await sendOTP(phone,'recaptcha-container');
      showOk('인증코드가 발송됐습니다. 문자를 확인해 주세요.');
      setStep('otp');
    }catch(e){showErr('발송 실패: '+e.message);}
    finally{setBusy(false);}
  };

  const doVerifyOTP=async()=>{
    if(code.length!==6){showErr('6자리 코드를 입력해 주세요.');return;}
    setBusy(true);clearMsg();
    try{
      const info=await verifyOTP(code);
      const existing=getUser(info.phone);
      if(existing){onLogin(existing);return;}
      setVerifiedInfo(info);
      setStep('name');
    }catch(e){showErr('인증 실패: 코드를 다시 확인해 주세요.');}
    finally{setBusy(false);}
  };

  const doRegister=()=>{
    if(!name.trim()){showErr('이름을 입력해 주세요.');return;}
    const u=registerUser({name:name.trim(),phone:verifiedInfo.phone,uid:verifiedInfo.uid});
    onLogin(u);
  };

  const doAdminLogin=()=>{
    if(adminId===ADMIN_ID&&adminPw===ADMIN_PW){
      onLogin({name:'관리자',phone:ADMIN_ID,isAdmin:true,createdAt:new Date().toISOString()});
    }else{showErr('관리자 ID 또는 비밀번호가 틀렸습니다.');}
  };

  const STEP_IDX={phone:0,otp:1,name:2};
  const STEP_LABELS=['번호 입력','코드 확인','이름 등록'];

return(
<div style={{minHeight:'100vh',background:`linear-gradient(160deg,${C.dark} 0%,#0f2744 55%,#0d1117 100%)`,display:'flex',flexDirection:'column',padding:'env(safe-area-inset-top,0px) 0 0'}}>
  {/* 상단 브랜드 영역 */}
  <div style={{flex:'0 0 auto',padding:'48px 32px 36px',textAlign:'center'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14,marginBottom:12}}>
      <div style={{width:52,height:52,background:'linear-gradient(135deg,#22C55E 0%,#16A34A 50%,#14532D 100%)',borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 6px 20px rgba(22,163,74,0.5)',flexShrink:0}}>
        <svg width="34" height="34" viewBox="125 75 250 225" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
          <rect x="175" y="180" width="150" height="110" strokeWidth="14"/>
          <rect x="160" y="150" width="180" height="30" rx="4" strokeWidth="14"/>
          <line x1="250" y1="150" x2="250" y2="290" strokeWidth="14"/>
          <path d="M 250 150 C 200 90, 140 130, 190 150 Z" strokeWidth="12"/>
          <path d="M 250 150 C 300 90, 360 130, 310 150 Z" strokeWidth="12"/>
          <path d="M 250 150 L 210 200" strokeWidth="12"/>
          <path d="M 250 150 L 290 200" strokeWidth="12"/>
        </svg>
      </div>
      <span style={{fontFamily:'serif',fontSize:'2.64rem',fontWeight:900,color:'#fff',letterSpacing:-1.5}}>네모<span style={{background:'linear-gradient(135deg,#22C55E 0%,#4ADE80 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>혜</span></span>
    </div>
    <p style={{color:'rgba(255,255,255,0.45)',fontSize:14,letterSpacing:0.5}}>내게 맞는 모든 혜택을 한 번에</p>
  </div>

  {/* 카드 */}
  <div style={{flex:1,background:C.bg,borderRadius:'28px 28px 0 0',padding:'32px 24px 40px',overflow:'auto'}}>
    {step!=='admin'&&(<>
      {/* 스텝 인디케이터 */}
      <div style={{display:'flex',alignItems:'center',marginBottom:28,gap:4}}>
        {STEP_LABELS.map((l,i)=>{
          const done=STEP_IDX[step]>i;
          const active=STEP_IDX[step]===i;
          return(<div key={i} style={{display:'flex',alignItems:'center',gap:4,flex:i<STEP_LABELS.length-1?'none':1}}>
            <div style={{width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,background:done?C.teal:active?C.dark:'#E2E8F0',color:done||active?'#fff':C.text3,flexShrink:0}}>
              {done?'✓':i+1}
            </div>
            <span style={{fontSize:12,color:active?C.text1:C.text3,fontWeight:active?700:400,whiteSpace:'nowrap'}}>{l}</span>
            {i<STEP_LABELS.length-1&&<div style={{flex:1,height:1,background:done?C.teal:C.border,minWidth:16,margin:'0 4px'}}/>}
          </div>);
        })}
      </div>

      {step==='phone'&&(<>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text1,marginBottom:6}}>휴대폰 번호로 시작하기</h2>
        <p style={{fontSize:14,color:C.text2,marginBottom:22}}>번호로 간편하게 가입·로그인 할 수 있어요</p>
        <div style={{marginBottom:16}}>
          <label style={LS}>휴대폰 번호</label>
          <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="010-1234-5678" style={IS} type="tel" inputMode="numeric" onKeyDown={e=>e.key==='Enter'&&doSendOTP()}/>
        </div>
        {msg.text&&<div style={{background:msg.type==='err'?'#FEE2E2':'#DCFCE7',borderRadius:10,padding:'11px 14px',fontSize:13.5,color:msg.type==='err'?C.err:C.ok,marginBottom:16}}>{msg.text}</div>}
        <button onClick={doSendOTP} disabled={busy} style={BP({width:'100%',padding:'15px',fontSize:16,borderRadius:12,opacity:busy?0.7:1})}>{busy?'발송 중...':'인증코드 받기'}</button>
        <p style={{textAlign:'center',fontSize:12.5,color:C.text3,marginTop:14}}>문자로 6자리 인증코드가 발송됩니다</p>
      </>)}

      {step==='otp'&&(<>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text1,marginBottom:6}}>코드를 입력해 주세요</h2>
        <p style={{fontSize:14,color:C.text2,marginBottom:22}}>📱 <strong>{phone}</strong>으로 발송됐습니다</p>
        <div style={{marginBottom:16}}>
          <label style={LS}>인증 코드 (6자리)</label>
          <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" style={{...IS,fontSize:26,letterSpacing:10,textAlign:'center',fontWeight:700}} inputMode="numeric" onKeyDown={e=>e.key==='Enter'&&doVerifyOTP()}/>
        </div>
        {msg.text&&<div style={{background:msg.type==='err'?'#FEE2E2':'#DCFCE7',borderRadius:10,padding:'11px 14px',fontSize:13.5,color:msg.type==='err'?C.err:C.ok,marginBottom:16}}>{msg.text}</div>}
        <button onClick={doVerifyOTP} disabled={busy} style={BP({width:'100%',padding:'15px',fontSize:16,borderRadius:12,opacity:busy?0.7:1})}>{busy?'확인 중...':'확인'}</button>
        <button onClick={()=>{setStep('phone');setCode('');clearMsg();}} style={{width:'100%',marginTop:12,background:'none',border:'none',color:C.text3,fontSize:13.5,cursor:'pointer',fontFamily:'inherit',padding:'8px 0'}}>← 번호 다시 입력</button>
      </>)}

      {step==='name'&&(<>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text1,marginBottom:6}}>반갑습니다! 👋</h2>
        <p style={{fontSize:14,color:C.text2,marginBottom:22}}>서비스 이용을 위해 이름을 입력해 주세요</p>
        <div style={{marginBottom:20}}>
          <label style={LS}>이름</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="홍길동" style={IS} onKeyDown={e=>e.key==='Enter'&&doRegister()}/>
        </div>
        {msg.text&&<div style={{background:'#FEE2E2',borderRadius:10,padding:'11px 14px',fontSize:13.5,color:C.err,marginBottom:16}}>{msg.text}</div>}
        <button onClick={doRegister} style={BP({width:'100%',padding:'15px',fontSize:16,borderRadius:12,background:`linear-gradient(135deg,${C.teal},#0a5f70)`})}>시작하기 →</button>
      </>)}

      <div style={{marginTop:24,paddingTop:20,borderTop:`1px solid ${C.border}`,textAlign:'center'}}>
        <button onClick={()=>{setStep('admin');clearMsg();}} style={{background:'none',border:'none',color:C.text3,fontSize:12.5,cursor:'pointer',fontFamily:'inherit',padding:'4px 8px'}}>관리자 로그인</button>
      </div>
    </>)}

    {step==='admin'&&(<>
      <h2 style={{fontSize:20,fontWeight:800,color:C.text1,marginBottom:6}}>⚙️ 관리자 로그인</h2>
      <p style={{fontSize:14,color:C.text2,marginBottom:22}}>관리자 전용 페이지입니다</p>
      <div style={{marginBottom:14}}><label style={LS}>관리자 ID</label><input value={adminId} onChange={e=>setAdminId(e.target.value)} style={IS}/></div>
      <div style={{marginBottom:20}}><label style={LS}>비밀번호</label><input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} style={IS} onKeyDown={e=>e.key==='Enter'&&doAdminLogin()}/></div>
      {msg.text&&<div style={{background:'#FEE2E2',borderRadius:10,padding:'11px 14px',fontSize:13.5,color:C.err,marginBottom:16}}>{msg.text}</div>}
      <button onClick={doAdminLogin} style={BP({width:'100%',padding:'15px',fontSize:16,borderRadius:12})}>로그인</button>
      <button onClick={()=>{setStep('phone');clearMsg();setAdminId('');setAdminPw('');}} style={{width:'100%',marginTop:12,background:'none',border:'none',color:C.text3,fontSize:13.5,cursor:'pointer',fontFamily:'inherit',padding:'8px 0'}}>← 일반 로그인으로</button>
    </>)}
  </div>
</div>);}

// ─── AnalyzeTab ───────────────────────────────────────────────────
// ─── 혜택 분석 프롬프트 빌더 ─────────────────────────────────────
function buildBenefitPrompt({age,gender,job,income,address,extra,today,mode='full',bokjiroData=null,gov24Data=null,ggData=null,seoulData=null}){
  const isYouth = extra.includes('청년');
  const isSME   = extra.includes('자영업자/소상공인') || extra.includes('소상공인') || job.includes('자영업');
  const isSeoul = address.includes('서울');

  const URL_GUIDE=`applyUrl규칙(필수): 홈페이지 메인 URL 금지. 신청 직접 페이지만. 복지로=https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do, 정부24=https://www.gov.kr/portal/serviceList, 고용24=https://www.work.go.kr/jobcenter/main.do, 주택도시기금=https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp, 청년정책=https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do, 건강보험=https://www.nhis.or.kr/nhis/policy/wbhada02800m01.do, 국민연금=https://www.nps.or.kr/jsppage/service/apply/apply.jsp, 서울복지포털=https://wis.seoul.go.kr/main.do, 서울탄생육아=https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtList.do, 임산부교통비=https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=34B5EA8BEB354E2DB26136CFE52AEFF2, 서울형산후조리=https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=58D83411277E40D1BFF6255A10CBCDD5, 서울엄마아빠택시=https://umppa.seoul.go.kr/hmpg/sprt/bzin/bzmgComtDetail.do?biz_mng_no=3EF7489ACF614F939FEF8514308797D2, 서울청년수당=https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=V202600005, 희망두배청년통장=https://youth.seoul.go.kr/content.do?key=2310100069, 서울청년마음건강=https://youth.seoul.go.kr/infoData/plcyInfo/view.do?key=2309150002&plcyBizId=20250519005400210855, 청년월세서울=https://youth.seoul.go.kr/content.do?key=2310100046, 청년임차보증금이자=https://youth.seoul.go.kr/content.do?key=2310100047, 청년취업사관학교새싹=https://sesac.seoul.kr/, 미래청년일자리=https://youth.seoul.go.kr/youthConts.do?key=2310100011, 청년창업지원서울=https://youth.seoul.go.kr/content.do?key=2310100026, 서울청년문화패스=https://www.youthcultureseoul.kr/, 소상공인정책자금=https://ols.semas.or.kr/ols/man/SMAN010M/page.do, 소상공인교육=https://edu.sbiz.or.kr/edu/main/main.do, 소상공인바우처=https://voucher.sbiz24.kr/, 소상공인창업지원=https://www.sbiz24.kr/#/pbanc?rcrtTypeCd=FN, 소상공인대출=https://ols.semas.or.kr/ols/man/SMAN010M/page.do`;
  const SCHEMA=`{"id":숫자,"source":"정부복지|지자체|금융/은행|공공기관|기업/협회|민간/NGO 중 택1","sourceIcon":"이모지","category":"주거|의료|금융|교육|고용|보육|노인|장애|청년|소상공인|세금|통신|문화|식품|기타 중 택1","categoryIcon":"이모지","scope":"전국 또는 지역명","isUrgent":false,"isHidden":false,"title":"혜택명","institution":"기관명","description":"설명2~3문장. 왜 이게 유리한지 포함","amount":"금액 또는 혜택 규모","deadline":"YYYY년 MM월 DD일 또는 수시 신청","requiredDocuments":["서류1"],"howToApply":"방법","applyUrl":"https://..."}`;

  // ── 청년 특화 섹션 ──
  const YOUTH_SECTION = isYouth ? `
★★ 청년(만 19~34세) 특화 혜택 — 반드시 포함:
[전국] 청년도약계좌(월 최대 70만원·5년), 청년희망적금, 국민취업지원제도, 청년내일저축계좌, 청년내일채움공제, 국가장학금, 학자금대출 이자지원, 청년 버팀목전세자금, 청년 월세 지원(LH), 청년 마음건강 바우처(복지부), K-디지털 훈련, 취업성공패키지, 청년일자리도약장려금
${isSeoul ? `[서울] 서울청년수당(월50만원·최대6개월→youth.seoul.go.kr), 희망두배청년통장(youth.seoul.go.kr/content.do?key=2310100069), 서울청년마음건강지원(plcyBizId=20250519005400210855), 미래청년일자리점프업(key=2310100011), 청년취업사관학교새싹(sesac.seoul.kr), 서울형청년인턴직무캠프(key=2310100012), 청년월세지원서울(key=2310100046), 청년임차보증금이자지원(key=2310100047), 청년부동산중개보수·이사비(R2024040321345), 청년창업지원(key=2310100026), 서울청년문화패스(youthcultureseoul.kr), 미취업청년자격증응시료(R2024041821928), 은둔청년지원(R2023050912524)` : ''}` : '';

  // ── 소상공인 특화 섹션 ──
  const SME_SECTION = isSME ? `
★★ 자영업자/소상공인 특화 혜택 — 반드시 포함:
[정책자금/대출] 소상공인 정책자금 직접대출(ols.semas.or.kr), 대리대출 2분기 정책자금, 소상공인 대환대출, 소공인특화자금, 상생성장지원자금, 혁신성장촉진자금 — 신청URL: https://ols.semas.or.kr/ols/man/SMAN010M/page.do
[교육] 소상공인 온라인 무료 교육(AI비즈니스·마케팅·노무·법정의무교육 등) — https://edu.sbiz.or.kr/edu/main/main.do
[바우처] 소상공인 경영안정 바우처(컨설팅·법률·노무·세무 등 전문 서비스 바우처) — https://voucher.sbiz24.kr/
[창업지원] 소상공인 창업 지원 사업(자금·컨설팅·공간 등) — https://www.sbiz24.kr/#/pbanc?rcrtTypeCd=FN
[기타] 노란우산공제(소기업소상공인공제부금), 소상공인 고용보험료 지원, 카드수수료 환급, 노란우산 희망장려금` : '';

  if(mode==='hidden'){
    return `당신은 대한민국 복지·혜택 전문가입니다. 아래 사람이 놓치기 쉬운 숨겨진 혜택을 발굴해주세요.
[정보] 나이:${age}세/성별:${gender}/직업:${job}/소득:${income}/거주:${address}/추가:${extra}/기준일:${today}
${YOUTH_SECTION}${SME_SECTION}

★ 반드시 다음 분야에서 발굴하세요 (정부 복지 제외, 사람들이 잘 모르는 것 위주):
- 시중 은행·인터넷은행 특별 금리·캐시백·적금 혜택 (카카오뱅크, 토스뱅크, 케이뱅크, 우리·국민·신한·하나은행 등)
- 통신사 복지 혜택 (SKT·KT·LG U+ 요금 감면, 장애인/노인/저소득 할인)
- 카드사 포인트·마일리지 활용 혜택
- 근로복지공단 선택적 복지 포인트, 직장인 대출
- 건강보험 환급금 (미청구 환급, 본인부담상한제 환급)
- 국세청 연말정산 놓친 공제 항목
- 각종 협회·노동조합 조합원 혜택
- 지역 신협·새마을금고 특별 상품
- 공공임대 주택 청약 (LH, SH, 지자체 매입임대)
- 에너지바우처·알뜰폰 혜택·인터넷 요금 지원
- 현재 진행 중인 국가 지원 사업 (취업 지원, 창업 자금, 교육비 지원)
- 민간 장학재단·재단법인 지원
- 상조 서비스·보험 환급

순수 JSON만 반환: {"benefits":[${SCHEMA}]}
8~12개. isHidden은 모두 true. 각 description은 1문장으로 간결하게. ${URL_GUIDE}`;
  }

  const BOKJIRO_SECTION = bokjiroData && bokjiroData.length > 0
    ? `\n★ 복지로 공식 API 조회 결과 (해당자에게 맞는 것을 반드시 포함):\n${
        bokjiroData.slice(0,25).map((b,i)=>`${i+1}. [${b.ministry}] ${b.title}${b.summary?' — '+b.summary.slice(0,55):''}${b.detailUrl?' (URL: '+b.detailUrl+')':''}`).join('\n')
      }\n`
    : '';

  const GOV24_SECTION = gov24Data && gov24Data.length > 0
    ? `\n★ 정부24 공공서비스 API 조회 결과 (해당자에게 맞는 것을 반드시 포함):\n${
        gov24Data.slice(0,25).map((b,i)=>`${i+1}. [${b.ministry}] ${b.title} (분야:${b.field})${b.summary?' — '+b.summary.slice(0,60):''}${b.support?' / 지원:'+b.support.slice(0,50):''}${b.applyUrl?' (URL: '+b.applyUrl+')':''}`).join('\n')
      }\n`
    : '';

  const GG_SECTION = ggData && ggData.length > 0
    ? `\n★ 경기도 공공서비스 API 조회 결과 — 경기도 거주자 지역 특화 혜택 (반드시 포함):\n${
        ggData.slice(0,20).map((b,i)=>`${i+1}. [${b.ministry}] ${b.title}${b.summary?' — '+b.summary.slice(0,60):''}${b.support?' / 지원형태:'+b.support:''}${b.applyUrl?' (URL: '+b.applyUrl+')':''}`).join('\n')
      }\n`
    : '';

  const SEOUL_SECTION = seoulData && seoulData.length > 0
    ? `\n★ 서울시 공공서비스 API 조회 결과 — 현재 접수 중인 서울 지역 프로그램 (반드시 포함):\n${
        seoulData.slice(0,20).map((b,i)=>`${i+1}. [${b.area}/${b.category}] ${b.title} (상태:${b.status}|대상:${b.target})${b.summary?' — '+b.summary.slice(0,55):''}${b.applyUrl?' (신청: '+b.applyUrl+')':''}`).join('\n')
      }\n`
    : '';

  return `당신은 대한민국 최고 수준의 복지·혜택 전문가입니다. 아래 사람이 받을 수 있는 모든 혜택을 빠짐없이 분석해주세요.
[정보] 나이:${age}세/성별:${gender}/직업:${job}/소득:${income}/거주:${address}/추가:${extra}/기준일:${today}
${BOKJIRO_SECTION}${GOV24_SECTION}${GG_SECTION}${SEOUL_SECTION}${YOUTH_SECTION}${SME_SECTION}

★ 반드시 다음 모든 출처에서 혜택을 찾아주세요:
1. 정부 복지: 복지로, 정부24, 고용24, 국민건강보험, 국민연금, 건강보험 환급
2. 지자체: ${address} 시·군·구청 특화 지원사업, 읍·면·동 주민센터 사업${isSeoul ? '. 서울청년몽땅정보통(youth.seoul.go.kr) + 서울복지포털(wis.seoul.go.kr) + 서울탄생육아(umppa.seoul.go.kr) 혜택 포함' : ''}
3. 금융기관: 주택도시기금, 서민금융진흥원, 햇살론, 사잇돌대출, 청년도약계좌, 청년희망적금
4. 공공기관: 근로복지공단(선택복지·EAP), 한국장학재단, 한국고용정보원
5. 에너지·통신: 에너지바우처, 통신요금 감면(장애인·저소득·노인), 인터넷 요금 지원
6. 세금·환급: 근로장려금(EITC), 자녀장려금, 연말정산 추가공제, 건강보험 환급금
7. 주거: LH·SH 공공임대, 전세자금 대출, 버팀목 전세자금, 청년 월세 지원
8. 현재 모집 중인 시즌 프로그램: 국가기술자격 응시료 지원, 취업성공패키지, K-디지털 훈련
9. 숨겨진 혜택: 사람들이 잘 모르는 것 최소 5개 포함 (isHidden:true 표시)

순수 JSON만 반환 (마크다운 코드블록 없이):
{"summary":{"totalBenefits":숫자,"estimatedMonthlyBenefit":"금액범위","topPriority":"혜택명","hiddenCount":숫자},"benefits":[${SCHEMA}]}
최소 12개 최대 18개. 실제 존재하는 혜택만. 마감일은 YYYY년 MM월 DD일 형식. 각 description은 1~2문장으로 간결하게. ${URL_GUIDE}`;
}

function AnalyzeTab({user,onSaved}){
  const[age,setAge]=useState('');const[gender,setGender]=useState('');const[job,setJob]=useState('');const[income,setIncome]=useState('');const[address,setAddress]=useState('');const[extras,setExtras]=useState([]);
  const[loading,setLoading]=useState(false);const[step,setStep]=useState(0);const[results,setResults]=useState(null);const[err,setErr]=useState('');const[savedIds,setSavedIds]=useState(new Set());const rRef=useRef();
  const[analyzedAt,setAnalyzedAt]=useState(null);
  const[hiddenLoading,setHiddenLoading]=useState(false);const[hiddenResults,setHiddenResults]=useState(null);
  const[filterSource,setFilterSource]=useState('전체');
  const loadSavedIds=useCallback(()=>{const ids=new Set(sList(`benefit_item:${user.phone}:`).map(k=>k.split(':').pop()));setSavedIds(ids);},[user.phone]);
  useEffect(()=>{loadSavedIds();},[loadSavedIds]);
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
    setLoading(true);setResults(null);setErr('');setStep(0);setHiddenResults(null);setAnalyzedAt(null);
    try{
      // 복지로 + 정부24 + 경기도 + 서울시 병렬 조회
      const [bokjiroData,gov24Data,ggData,seoulData]=await Promise.all([
        fetchBokjiroData({age,extras}),
        fetchGov24Data({age,extras,job,income}),
        fetchGGData({address,extras}),
        fetchSeoulData({age,address,extras}),
      ]);
      const raw=await callClaude(buildBenefitPrompt({...buildCtx(),mode:'full',bokjiroData,gov24Data,ggData,seoulData}),8000);
      setResults(repairJSON(raw));
      setAnalyzedAt(new Date());
    }catch(e){setErr(e.message);}
    finally{setLoading(false);}
  };

  const loadHidden=async()=>{
    if(!results)return;
    setHiddenLoading(true);
    try{
      const raw=await callClaude(buildBenefitPrompt({...buildCtx(),mode:'hidden'}),5000);
      const parsed=repairJSON(raw);
      setHiddenResults(parsed.benefits||[]);
    }catch(e){showToast('추가 혜택 발굴 중 오류: '+e.message);}
    finally{setHiddenLoading(false);}
  };

  const toggleSave=(b)=>{const key=`benefit_item:${user.phone}:${b.id}`;if(savedIds.has(String(b.id))){sDel(key);setSavedIds(p=>{const n=new Set(p);n.delete(String(b.id));return n;});}else{sSet(key,{...b,savedAt:new Date().toISOString(),userPhone:user.phone});setSavedIds(p=>new Set([...p,String(b.id)]));}onSaved();};

  const allBenefits=[...(results?.benefits||[]),...(hiddenResults||[])];
  const sources=['전체',...new Set(allBenefits.map(b=>b.source).filter(Boolean))];
  const filtered=filterSource==='전체'?allBenefits:allBenefits.filter(b=>b.source===filterSource);
  const urgent=filtered.filter(b=>b.isUrgent);
  const hidden=filtered.filter(b=>b.isHidden&&!b.isUrgent);
  const normal=filtered.filter(b=>!b.isUrgent&&!b.isHidden);
  return(<div>
    <div style={{...CS,marginBottom:20}}>
      <h2 style={{fontFamily:'serif',fontSize:'1.21rem',fontWeight:700,marginBottom:5}}>기본 정보 입력</h2>
      <p style={{fontSize:13,color:'#9ca3af',marginBottom:22}}>입력하신 정보는 혜택 분석에만 사용됩니다.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div><label style={LS}>나이 <R/></label><input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="예: 35" style={IS}/></div>
        <div><label style={LS}>성별 <R/></label><select value={gender} onChange={e=>setGender(e.target.value)} style={SS}><option value="">선택</option><option>남성</option><option>여성</option></select></div>
        <div><label style={LS}>직업 / 고용 상태 <R/></label><select value={job} onChange={e=>setJob(e.target.value)} style={SS}><option value="">선택하세요</option>{['직장인(정규직)','직장인(계약직/비정규직)','자영업자/사업자','프리랜서','구직자/실업자','학생','전업주부','농업/어업/임업','장애인','은퇴/무직'].map(v=><option key={v}>{v}</option>)}</select></div>
        <div><label style={LS}>월 소득 수준 <R/></label><select value={income} onChange={e=>setIncome(e.target.value)} style={SS}><option value="">선택하세요</option>{['기초생활수급자','월 50만원 미만','월 50~100만원','월 100~200만원','월 200~300만원','월 300~500만원','월 500~700만원','월 700만원 이상'].map(v=><option key={v}>{v}</option>)}</select></div>
        <div style={{gridColumn:'1/-1'}}><label style={LS}>거주지 <R/></label><AddrInput value={address} onChange={setAddress}/></div>
        <div style={{gridColumn:'1/-1'}}>
          <label style={{...LS,marginBottom:9}}>추가 상황 <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,color:'#9ca3af',fontSize:12}}>(해당 항목 모두 선택)</span></label>
          <div style={{border:'1.5px solid #d4cdc2',borderRadius:12,overflow:'hidden'}}>{EXTRA_OPTIONS.map((o,i)=>(<div key={o.value} onClick={()=>toggleExtra(o.value)} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 15px',cursor:'pointer',background:extras.includes(o.value)?'#edf6f6':'#fff',borderBottom:i<EXTRA_OPTIONS.length-1?'1px solid #ede8dc':'none'}}><div style={{width:17,height:17,minWidth:17,border:`1.8px solid ${extras.includes(o.value)?'#1a6b6b':'#d4cdc2'}`,borderRadius:4,background:extras.includes(o.value)?'#1a6b6b':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{extras.includes(o.value)&&<svg width="9" height="7" viewBox="0 0 9 7"><polyline points="1,3.5 3.5,6 8,1" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div><span style={{fontSize:14,color:extras.includes(o.value)?'#1a6b6b':'#0d1117',fontWeight:extras.includes(o.value)?600:400}}>{o.label}</span></div>))}</div>
        </div>
      </div>
      <button onClick={analyze} disabled={loading} style={BP({width:'100%',marginTop:22,padding:'14px',fontSize:15,borderRadius:10,opacity:loading?0.7:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8})}><span style={{width:19,height:19,background:'#c9a84c',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11}}>✦</span>{loading?'분석 중...':'내게 맞는 혜택 분석하기'}</button>
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
      {/* ── 요약 카드 ── */}
      <div style={{background:`linear-gradient(135deg,${C.dark} 0%,#0f2744 100%)`,borderRadius:20,padding:'22px 24px',color:'#fff',marginBottom:16,position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-20,right:-20,width:100,height:100,borderRadius:'50%',background:'rgba(212,168,67,0.08)'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
          <div>
            <div style={{fontSize:10,letterSpacing:0.3,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>분석완료 · {age}세 {gender} · {address}</div>
            <div style={{fontFamily:'serif',fontSize:'1.2rem',fontWeight:900,lineHeight:1.2}}>
              총 <span style={{color:C.gold}}>{allBenefits.length}개</span> 혜택 발견
            </div>
          </div>
          {analyzedAt&&<div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginBottom:2}}>업데이트</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.6)'}}>{analyzedAt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>}
        </div>
        <div style={{display:'flex',gap:0,borderRadius:12,overflow:'hidden',marginBottom:14}}>
          {[
            {v:allBenefits.length,l:'전체 혜택',icon:'✦'},
            {v:results.summary?.estimatedMonthlyBenefit||'-',l:'월 예상액',icon:'💰'},
            {v:allBenefits.filter(b=>b.isHidden).length+(hiddenResults?.length||0),l:'숨겨진 혜택',icon:'🔍'},
            {v:urgent.length,l:'긴급 신청',icon:'⚡'},
          ].map(({v,l,icon},i)=>(
            <div key={l} style={{flex:1,background:'rgba(255,255,255,0.07)',padding:'10px 6px',textAlign:'center',borderRight:i<3?'1px solid rgba(255,255,255,0.08)':undefined}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.45)',marginBottom:3}}>{icon} {l}</div>
              <div style={{fontSize:13,fontWeight:800,color:C.gold,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>
        {results.summary?.topPriority&&<div style={{background:'rgba(255,255,255,0.07)',borderRadius:10,padding:'10px 14px',fontSize:13}}>
          ⚡ 가장 먼저 신청: <strong style={{color:C.gold}}>{results.summary.topPriority}</strong>
        </div>}
      </div>

      {/* ── 출처 필터 ── */}
      {sources.length>1&&(
        <div style={{display:'flex',gap:6,overflowX:'auto',marginBottom:14,paddingBottom:4,scrollbarWidth:'none'}}>
          {sources.map(s=>(
            <button key={s} onClick={()=>setFilterSource(s)} style={{
              flexShrink:0,padding:'6px 12px',borderRadius:20,border:`1.5px solid ${filterSource===s?C.teal:C.border}`,
              background:filterSource===s?C.teal:'#fff',color:filterSource===s?'#fff':C.text2,
              fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',
            }}>{s}{filterSource===s&&` (${filtered.length})`}</button>
          ))}
        </div>
      )}

      {/* ── 긴급 혜택 ── */}
      {urgent.length>0&&(<>
        <Divider label="⚡ 긴급 신청 필요"/>
        {urgent.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
      </>)}

      {/* ── 일반 혜택 ── */}
      {normal.length>0&&(<>
        <Divider label={`📋 맞춤 혜택 (${normal.length}개)`}/>
        {normal.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
      </>)}

      {/* ── 숨겨진 혜택 ── */}
      {hidden.length>0&&(<>
        <Divider label={`🔍 숨겨진 혜택 — 잘 알려지지 않은 것들 (${hidden.length}개)`}/>
        {hidden.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}
      </>)}

      {/* ── 숨겨진 혜택 추가 발굴 버튼 ── */}
      {!hiddenResults&&!hiddenLoading&&(
        <div style={{...CS,textAlign:'center',padding:'24px',marginTop:8,border:`2px dashed ${C.border}`}}>
          <div style={{fontSize:24,marginBottom:8}}>🔍</div>
          <div style={{fontWeight:700,fontSize:15,color:C.text1,marginBottom:6}}>숨겨진 혜택 추가 발굴</div>
          <div style={{fontSize:13,color:C.text2,marginBottom:16,lineHeight:1.6}}>은행 특별 상품, 건강보험 환급금, 협회 지원금,<br/>통신요금 감면 등 사람들이 잘 모르는 혜택을 더 찾아드려요</div>
          <button onClick={loadHidden} style={BP({padding:'12px 24px',fontSize:14,borderRadius:10,background:`linear-gradient(135deg,#7c3aed,#5b21b6)`})}>
            🔍 숨겨진 혜택 더 찾기
          </button>
        </div>
      )}
      {hiddenLoading&&(
        <div style={{...CS,textAlign:'center',padding:'28px',marginTop:8}}>
          <div style={{width:36,height:36,border:`3px solid ${C.border}`,borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
          <div style={{fontSize:13,color:'#7c3aed',fontWeight:600}}>숨겨진 혜택을 발굴하고 있습니다...</div>
        </div>
      )}

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
  const[result,setResult]=useState(null);
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

// ─── ProfileTab ───────────────────────────────────────────────────
function ProfileTab({user,onLogout,savedCount}){return(<div style={{maxWidth:480,margin:'0 auto'}}><div style={{...CS,textAlign:'center',padding:'32px 24px',marginBottom:14}}><div style={{width:68,height:68,borderRadius:'50%',background:'linear-gradient(135deg,#1a6b6b,#0d4f4f)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.76rem',fontWeight:900,color:'#c9a84c',margin:'0 auto 14px',fontFamily:'serif'}}>{user.name?.charAt(0)||'?'}</div><div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700,marginBottom:3}}>{user.name}</div><div style={{fontSize:14,color:'#6b6560',marginBottom:20}}>{formatPhone(user.phone)}</div><div style={{display:'flex',justifyContent:'center',gap:32,padding:'16px 0',borderTop:'1px solid #f0ebe0',borderBottom:'1px solid #f0ebe0',marginBottom:20}}><div style={{textAlign:'center'}}><div style={{fontSize:'1.98rem',fontWeight:900,color:'#1a6b6b',lineHeight:1}}>{savedCount}</div><div style={{fontSize:12,color:'#6b6560',marginTop:3}}>저장한 혜택</div></div><div style={{textAlign:'center'}}><div style={{fontSize:'1.10rem',fontWeight:700,color:'#c9a84c',lineHeight:1,paddingTop:4}}>{new Date(user.createdAt).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})}</div><div style={{fontSize:12,color:'#6b6560',marginTop:3}}>가입일</div></div></div><button onClick={onLogout} style={BP({width:'100%',padding:'12px',background:'#fee2e2',color:'#991b1b',borderRadius:10,fontSize:14})}>로그아웃</button></div><div style={{background:'#ede8dc',borderRadius:12,padding:'14px 16px',fontSize:13,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>💡 안내</strong><br/>저장된 혜택은 이 기기의 localStorage에 보관됩니다. 캘린더 알림은 브라우저 알림 권한을 허용하면 자동으로 작동합니다.</div></div>);}

// ─── Root App ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('analyze');
  const [savedCount, setSavedCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false); // 랜딩 → 인증 전환

  // API 키 없으면 경고 배너 표시
  const noKey = !API_KEY;

  useEffect(() => {
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
      <div style={{width:72,height:72,background:'linear-gradient(135deg,#22C55E 0%,#16A34A 50%,#14532D 100%)',borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(0,0,0,0.2)',marginBottom:16}}>
        <svg width="46" height="46" viewBox="125 75 250 225" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
          <rect x="175" y="180" width="150" height="110" strokeWidth="14"/>
          <rect x="160" y="150" width="180" height="30" rx="4" strokeWidth="14"/>
          <line x1="250" y1="150" x2="250" y2="290" strokeWidth="14"/>
          <path d="M 250 150 C 200 90, 140 130, 190 150 Z" strokeWidth="12"/>
          <path d="M 250 150 C 300 90, 360 130, 310 150 Z" strokeWidth="12"/>
          <path d="M 250 150 L 210 200" strokeWidth="12"/>
          <path d="M 250 150 L 290 200" strokeWidth="12"/>
        </svg>
      </div>
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
  const BOTTOM_TABS = [
    {v:'analyze', icon:'✦', label:'혜택'},
    {v:'life',    icon:'🗺', label:'인생'},
    {v:'wedding', icon:'💍', label:'결혼'},
    {v:'realestate',icon:'🏠',label:'부동산'},
    {v:'saved',   icon:'📁', label:`보관함${savedCount>0?` ${savedCount}`:''}` },
    {v:'profile', icon:'👤', label:'MY'},
  ];

  // 페이지별 메타
  const PAGE_META = {
    analyze:     {title:'혜택 설계', sub:'나이·지역·상황을 입력하면 맞춤 혜택을 찾아드려요'},
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

      {/* ── 상단 헤더 ─────────────────────────────────────── */}
      <header style={{
        background:C.dark,
        position:'sticky',top:0,zIndex:200,
        paddingTop:'env(safe-area-inset-top,0px)',
        boxShadow:'0 1px 0 rgba(255,255,255,0.08)',
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px',height:56}}>
          <div onClick={()=>setTab('analyze')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
            <div style={{width:34,height:34,background:'linear-gradient(135deg,#22C55E 0%,#16A34A 50%,#14532D 100%)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(22,163,74,0.4)',flexShrink:0}}>
              <svg width="21" height="21" viewBox="125 75 250 225" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
                <rect x="175" y="180" width="150" height="110" strokeWidth="14"/>
                <rect x="160" y="150" width="180" height="30" rx="4" strokeWidth="14"/>
                <line x1="250" y1="150" x2="250" y2="290" strokeWidth="14"/>
                <path d="M 250 150 C 200 90, 140 130, 190 150 Z" strokeWidth="12"/>
                <path d="M 250 150 C 300 90, 360 130, 310 150 Z" strokeWidth="12"/>
                <path d="M 250 150 L 210 200" strokeWidth="12"/>
                <path d="M 250 150 L 290 200" strokeWidth="12"/>
              </svg>
            </div>
            <span style={{fontFamily:'serif',fontWeight:900,fontSize:'1.22rem',color:'#fff',letterSpacing:-0.5}}>
              네모<span style={{background:'linear-gradient(135deg,#22C55E 0%,#4ADE80 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>혜</span>
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {user?.isAdmin&&(
              <button onClick={()=>setTab('admin')} style={{background:'rgba(255,255,255,0.08)',border:'none',color:'#fff',width:34,height:34,borderRadius:10,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>⚙️</button>
            )}
            {/* 아바타 */}
            <div onClick={()=>setTab('profile')} style={{
              width:34,height:34,borderRadius:'50%',cursor:'pointer',flexShrink:0,
              background:`linear-gradient(135deg,${C.teal},#0a5268)`,
              display:'flex',alignItems:'center',justifyContent:'center',
              color:'#fff',fontSize:13,fontWeight:800,
              boxShadow:`0 0 0 2px ${tab==='profile'?C.gold:'transparent'}`,
              transition:'box-shadow 0.15s',
            }}>
              {user.name?.charAt(0)||'👤'}
            </div>
          </div>
        </div>
      </header>

      {/* ── 페이지 히어로 (혜택설계 탭) ───────────────────── */}
      {tab==='analyze'&&(
        <div style={{background:C.grad,padding:'28px 20px 52px',textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-30,right:-30,width:140,height:140,borderRadius:'50%',background:'rgba(255,255,255,0.06)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:-20,left:-20,width:100,height:100,borderRadius:'50%',background:'rgba(255,255,255,0.04)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:-1,left:0,right:0,height:32,background:C.bg,clipPath:'ellipse(55% 100% at 50% 100%)'}}/>

          <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:20,padding:'5px 14px',marginBottom:16}}>
            <span style={{color:'#fff',fontSize:10,letterSpacing:2,fontWeight:700,textTransform:'uppercase'}}>✦ 사용자 맞춤 혜택 분석</span>
          </div>
          <p style={{color:'rgba(255,255,255,0.85)',fontSize:13,lineHeight:1.5,margin:'0 auto',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>
            안녕하세요, <strong style={{color:'#A7F3D0'}}>{user.name}</strong>님 👋 혜택을 모두 찾아드려요
          </p>
        </div>
      )}

      {/* ── 비-혜택설계 탭 페이지 헤더 ─────────────────────── */}
      {tab!=='analyze'&&(
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:'20px 20px 18px'}}>
          <div style={{maxWidth:760,margin:'0 auto'}}>
            <h1 style={{fontFamily:'serif',fontSize:'1.45rem',fontWeight:800,color:C.text1,marginBottom:4}}>{meta.title}</h1>
            {meta.sub&&<p style={{fontSize:13.5,color:C.text2,lineHeight:1.6}}>{meta.sub}</p>}
          </div>
        </div>
      )}

      {/* ── 탭 콘텐츠 ─────────────────────────────────────── */}
      <div style={{maxWidth:760,margin:'0 auto',padding:tab==='analyze'?'0 16px 100px':'16px 16px 100px',position:'relative',zIndex:10,marginTop:tab==='analyze'?-16:0}}>
        {tab==='analyze'    && <AnalyzeTab user={user} onSaved={refreshCount}/>}
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
