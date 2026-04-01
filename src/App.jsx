import { useState, useRef, useEffect, useCallback } from "react";
import {
  ADMIN_ID, ADMIN_PW,
  sendOTP, verifyOTP,
  getSession, saveSession, clearSession,
  registerUser, getUser,
  getAllUsers, deleteUser,
  formatPhone,
} from './auth.js';

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
  {value:'임산부',label:'🤰 임산부'},{value:'출산 후 1년 이내',label:'👶 출산 후 1년 이내'},
  {value:'신혼부부(혼인 7년 이내)',label:'💍 신혼부부 (혼인 7년 이내)'},{value:'결혼 준비 중(예비 신혼부부)',label:'💒 결혼 준비 중 (예비 신혼부부)'},
  {value:'다자녀 가구(2명 이상)',label:'👨‍👩‍👧‍👦 다자녀 가구 (2명 이상)'},{value:'한부모 가정',label:'👤 한부모 가정'},
  {value:'청년 1인 가구',label:'🏠 청년 1인 가구'},{value:'청년 창업 준비 중',label:'🚀 청년 창업 준비 중'},
  {value:'장애인 가구',label:'♿ 장애인 가구'},{value:'국가유공자/보훈 대상',label:'🎖️ 국가유공자 / 보훈'},
  {value:'기초생활수급자 또는 차상위계층',label:'📋 기초/차상위계층'},{value:'노인 단독 가구(65세 이상)',label:'👴 노인 단독 가구'},
];
const LOADING_STEPS=["정부24, 복지로, 각 지자체 데이터 검토 중","나이 및 소득 조건 매칭 중","지역별 특화 혜택 검색 중","필요 서류 및 신청 기한 정리 중","최종 맞춤 혜택 목록 생성 중"];
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
function showToast(msg){let el=document.getElementById('nemo-toast');if(!el){el=document.createElement('div');el.id='nemo-toast';el.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#0d1117;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-family:inherit;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.25);max-width:320px;text-align:center;line-height:1.5;transition:opacity 0.3s;pointer-events:none;';document.body.appendChild(el);}el.textContent=msg;el.style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.style.opacity='0';},3500);}

// ─── 주소 자동완성 ────────────────────────────────────────────────
function buildSugg(q){if(!q)return[];const out=[];for(const[sido,guguns]of Object.entries(REGIONS)){guguns.forEach(gu=>{const full=`${sido} ${gu}`;if(sido.startsWith(q)||full.startsWith(q)||full.includes(q)||gu.startsWith(q))out.push({full,sido});});}out.sort((a,b)=>(a.full.startsWith(q)?0:1)-(b.full.startsWith(q)?0:1)||a.full.localeCompare(b.full,'ko'));return out.slice(0,8);}
function AddrInput({value,onChange}){const[sugg,setSugg]=useState([]);const[ai,setAi]=useState(-1);const[open,setOpen]=useState(false);const ref=useRef();useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);const onInput=v=>{onChange(v);const s=buildSugg(v.trim());setSugg(s);setOpen(s.length>0);setAi(-1);};const pick=s=>{onChange(s.full);setOpen(false);setSugg([]);};const hi=(t,q)=>{const i=t.indexOf(q);if(i<0)return t;return<>{t.slice(0,i)}<strong style={{color:'#1a6b6b'}}>{t.slice(i,i+q.length)}</strong>{t.slice(i+q.length)}</>;};return(<div ref={ref} style={{position:'relative'}}><input value={value} onChange={e=>onInput(e.target.value)} placeholder="예: 서울특별시 마포구" autoComplete="off" style={IS} onFocus={()=>{if(sugg.length)setOpen(true);}} onKeyDown={e=>{if(!open)return;if(e.key==='ArrowDown'){e.preventDefault();setAi(i=>Math.min(i+1,sugg.length-1));}else if(e.key==='ArrowUp'){e.preventDefault();setAi(i=>Math.max(i-1,0));}else if(e.key==='Enter'&&ai>=0){e.preventDefault();pick(sugg[ai]);}else if(e.key==='Escape')setOpen(false);}}/>{open&&sugg.length>0&&(<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',border:'1.5px solid #1a6b6b',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:500,overflow:'hidden',maxHeight:220,overflowY:'auto'}}>{sugg.map((s,i)=>(<div key={s.full} onMouseDown={()=>pick(s)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid #f0ebe0',background:i===ai?'#edf6f6':'#fff',fontSize:14}}><div style={{fontWeight:600}}>{hi(s.full,value.trim())}</div><div style={{fontSize:12,color:'#6b6560'}}>{s.sido}</div></div>))}</div>)}<p style={{fontSize:12,color:'#9ca3af',marginTop:3}}>시/도와 시/군/구까지 입력하면 자동완성됩니다</p></div>);}

// ─── 공통 스타일 상수 ─────────────────────────────────────────────
const IS={width:'100%',background:'#faf7f2',border:'1.5px solid #d4cdc2',borderRadius:10,padding:'11px 14px',fontSize:15,fontFamily:'inherit',color:'#0d1117',outline:'none',boxSizing:'border-box'};
const SS={...IS,appearance:'none',WebkitAppearance:'none',cursor:'pointer',backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b6560' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 14px center',paddingRight:40};
const LS={fontSize:12,fontWeight:700,color:'#0d1117',letterSpacing:'0.5px',textTransform:'uppercase',display:'block',marginBottom:7};
const BP=(x={})=>({background:'#0d1117',color:'#fff',border:'none',borderRadius:10,padding:'12px 20px',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:'inherit',...x});
const CS={background:'#fff',border:'1px solid #d4cdc2',borderRadius:16,padding:'24px',boxShadow:'0 2px 16px rgba(13,17,23,0.07)'};
function Logo({size=38}){return(<svg width={size} height={size} viewBox="0 0 42 42" fill="none"><rect x="2" y="2" width="38" height="38" rx="9" stroke="#c9a84c" strokeWidth="2.2"/><line x1="21" y1="11.5" x2="21" y2="14.5" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="21" y1="27.5" x2="21" y2="30.5" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="11.5" y1="21" x2="14.5" y2="21" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="27.5" y1="21" x2="30.5" y2="21" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="14.3" y1="14.3" x2="16.4" y2="16.4" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="25.6" y1="25.6" x2="27.7" y2="27.7" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="27.7" y1="14.3" x2="25.6" y2="16.4" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><line x1="14.3" y1="27.7" x2="16.4" y2="25.6" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round"/><circle cx="21" cy="21" r="4.5" fill="#c9a84c"/></svg>);}
const R=()=><span style={{color:'#c94f1a',marginLeft:2}}>*</span>;
function Divider({label}){return(<div style={{display:'flex',alignItems:'center',gap:10,margin:'20px 0 12px'}}><div style={{flex:1,height:1,background:'#d4cdc2'}}/><span style={{fontSize:11,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:2,whiteSpace:'nowrap'}}>{label}</span><div style={{flex:1,height:1,background:'#d4cdc2'}}/></div>);}

// ─── getBestApplyUrl: 홈페이지 메인 URL → 신청 페이지 URL 매핑 ───
const APPLY_URL_MAP = {
  'bokjiro.go.kr': 'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do',
  'gov.kr': 'https://www.gov.kr/portal/serviceList',
  'work.go.kr': 'https://www.work.go.kr/jobcenter/main.do',
  'nhuf.molit.go.kr': 'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp',
  'youthcenter.go.kr': 'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do',
  'youth.go.kr': 'https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do',
  'nhis.or.kr': 'https://www.nhis.or.kr/nhis/policy/wbhada02800m01.do',
  'nps.or.kr': 'https://www.nps.or.kr/jsppage/service/apply/apply.jsp',
  'kcomwel.or.kr': 'https://www.kcomwel.or.kr/kcomwel/paym/acci/acci.jsp',
  'hf.go.kr': 'https://www.hf.go.kr/hf/sub04/sub04_01_01.do',
  'lh.or.kr': 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWtWrtanc.do',
  'sbcrc.or.kr': 'https://www.sbcrc.or.kr/site/main/apply/applyView',
};
function getBestApplyUrl(url){
  if(!url)return'https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do';
  try{
    const host=new URL(url).hostname.replace(/^www\./,'');
    // 이미 서브페이지(path가 있음)면 그대로 사용
    const path=new URL(url).pathname;
    if(path&&path!=='/'&&path.length>1)return url;
    // 메인 홈페이지면 매핑된 신청 URL로 교체
    for(const[domain,applyUrl]of Object.entries(APPLY_URL_MAP)){
      if(host===domain||host.endsWith('.'+domain))return applyUrl;
    }
  }catch{}
  return url;
}

// ─── BCard ────────────────────────────────────────────────────────
function BCard({b,savedIds,onToggleSave}){const bg=CAT_COLOR[b.category]||'#f3f4f6';const isSaved=savedIds?.has(String(b.id));const dl=parseDeadline(b.deadline);const days=daysLeft(dl);const[calOpen,setCalOpen]=useState(false);
return(<div style={{background:'#fff',border:`1.5px solid ${isSaved?'#1a6b6b':'#d4cdc2'}`,borderRadius:14,padding:'18px 20px',marginBottom:10,boxShadow:isSaved?'0 0 0 3px rgba(26,107,107,0.08)':'0 2px 10px rgba(0,0,0,0.05)'}}>
  <div style={{display:'flex',gap:12,marginBottom:10}}>
    <div style={{width:40,height:40,borderRadius:10,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{b.categoryIcon||'📋'}</div>
    <div style={{flex:1}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#ede8dc',color:'#6b6560'}}>{b.category}</span>
        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:b.scope==='전국'?'#dbeafe':'#fce7f3',color:b.scope==='전국'?'#1a5080':'#801a60'}}>{b.scope}</span>
        {b.isUrgent&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fee2e2',color:'#c94f1a'}}>⚡ 긴급</span>}
        {days!==null&&days<=30&&days>=0&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fef9c3',color:'#854f0b'}}>D-{days}</span>}
      </div>
      <div style={{fontFamily:'serif',fontSize:15,fontWeight:700,marginBottom:2}}>{b.title}</div>
      <div style={{fontSize:12,color:'#6b6560'}}>{b.institution}</div>
    </div>
    {onToggleSave&&(<button onClick={()=>onToggleSave(b)} style={{width:36,height:36,flexShrink:0,border:`1.5px solid ${isSaved?'#1a6b6b':'#d4cdc2'}`,borderRadius:9,background:isSaved?'#edf6f6':'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔖</button>)}
  </div>
  <div style={{borderTop:'1px solid #f0ebe0',paddingTop:12}}>
    <p style={{fontSize:13,color:'#3a3a3a',lineHeight:1.7,marginBottom:10}}>{b.description}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginBottom:10}}>
      {[{l:'💰 지원 내용',v:b.amount,c:'#1a6b6b'},{l:'📅 신청 기한',v:b.deadline||'수시',c:days!==null&&days<=14?'#c94f1a':'#374151'},{l:'📌 신청 방법',v:b.howToApply}].map(({l,v,c})=>(<div key={l} style={{background:'#faf7f2',borderRadius:8,padding:9}}><div style={{fontSize:10,fontWeight:700,color:'#6b6560',textTransform:'uppercase',letterSpacing:0.5,marginBottom:3}}>{l}</div><div style={{fontSize:12,fontWeight:600,color:c||'#0d1117',lineHeight:1.4}}>{v||'-'}</div></div>))}
    </div>
    {b.requiredDocuments?.length>0&&(<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,marginBottom:5}}>📂 필요 서류</div><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{b.requiredDocuments.map(d=><span key={d} style={{background:'#f0ebe0',border:'1px solid #d4cdc2',borderRadius:5,padding:'3px 8px',fontSize:12}}>📄 {d}</span>)}</div></div>)}
    <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
      <a href={getBestApplyUrl(b.applyUrl)} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,background:'#0d1117',color:'#fff',fontSize:13,fontWeight:700,padding:'8px 14px',borderRadius:7,textDecoration:'none'}}>신청하러 가기 →</a>
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

  const MsgBox=()=>msg.text?(<div style={{background:msg.type==='err'?'#fee2e2':'#dcfce7',border:`1px solid ${msg.type==='err'?'#fca5a5':'#86efac'}`,borderRadius:8,padding:'10px 14px',fontSize:13,color:msg.type==='err'?'#991b1b':'#166534',marginBottom:16}}>{msg.text}</div>):null;
  const STEPS=[['phone','① 번호 입력'],['otp','② 코드 확인'],['name','③ 이름 등록']];

return(<div style={{minHeight:'100vh',background:'#0d1117',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
  <div id="recaptcha-container"/>
  <div style={{marginBottom:28,textAlign:'center'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginBottom:8}}><Logo size={50}/><span style={{fontFamily:'serif',fontSize:'2.42rem',fontWeight:900,color:'#fff',letterSpacing:-1}}>네모<span style={{color:'#c9a84c'}}>혜</span></span></div>
    <p style={{color:'#6b7280',fontSize:14}}>네 모든 혜택을 찾아드리는 서비스</p>
  </div>
  <div style={{...CS,width:'100%',maxWidth:420,padding:'32px 28px'}}>
    {step!=='admin'&&(<>
      <div style={{display:'flex',gap:6,marginBottom:24}}>
        {STEPS.map(([s,l])=>(<div key={s} style={{flex:1,textAlign:'center',padding:'7px 0',borderRadius:8,fontSize:12,fontWeight:700,background:step===s?'#0d1117':'#f5f0e8',color:step===s?'#fff':'#9ca3af'}}>{l}</div>))}
      </div>
      {step==='phone'&&(<>
        <div style={{marginBottom:16}}><label style={LS}>휴대폰 번호</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="010-1234-5678" style={IS} onKeyDown={e=>e.key==='Enter'&&doSendOTP()}/></div>
        <MsgBox/>
        <button onClick={doSendOTP} disabled={busy} style={BP({width:'100%',padding:'14px',fontSize:17,borderRadius:10,opacity:busy?0.7:1})}>{busy?'발송 중...':'인증코드 받기'}</button>
        <p style={{textAlign:'center',fontSize:12,color:'#9ca3af',marginTop:12}}>문자로 6자리 인증코드가 발송됩니다</p>
      </>)}
      {step==='otp'&&(<>
        <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#166534',marginBottom:16}}>📱 {phone} 으로 코드를 발송했습니다</div>
        <div style={{marginBottom:16}}><label style={LS}>인증 코드 (6자리)</label><input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" style={{...IS,fontSize:22,letterSpacing:6,textAlign:'center'}} onKeyDown={e=>e.key==='Enter'&&doVerifyOTP()}/></div>
        <MsgBox/>
        <button onClick={doVerifyOTP} disabled={busy} style={BP({width:'100%',padding:'14px',fontSize:17,borderRadius:10,opacity:busy?0.7:1})}>{busy?'확인 중...':'확인'}</button>
        <button onClick={()=>{setStep('phone');setCode('');clearMsg();}} style={{width:'100%',marginTop:10,background:'none',border:'none',color:'#9ca3af',fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:'8px 0'}}>← 번호 다시 입력</button>
      </>)}
      {step==='name'&&(<>
        <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#166534',marginBottom:16}}>✅ 인증 완료! 처음 오셨군요. 이름을 입력해 주세요.</div>
        <div style={{marginBottom:20}}><label style={LS}>이름</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="홍길동" style={IS} onKeyDown={e=>e.key==='Enter'&&doRegister()}/></div>
        <MsgBox/>
        <button onClick={doRegister} style={BP({width:'100%',padding:'14px',fontSize:17,borderRadius:10})}>가입 완료 →</button>
      </>)}
      <p style={{textAlign:'center',fontSize:12,color:'#9ca3af',marginTop:20,borderTop:'1px solid #f0ebe0',paddingTop:16}}>
        <button onClick={()=>{setStep('admin');clearMsg();}} style={{background:'none',border:'none',color:'#6b6560',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>관리자 로그인</button>
      </p>
    </>)}
    {step==='admin'&&(<>
      <div style={{textAlign:'center',marginBottom:20}}><span style={{fontSize:22}}>⚙️</span><div style={{fontWeight:700,fontSize:15,marginTop:6,color:'#0d1117'}}>관리자 로그인</div></div>
      <div style={{marginBottom:14}}><label style={LS}>관리자 ID</label><input value={adminId} onChange={e=>setAdminId(e.target.value)} style={IS}/></div>
      <div style={{marginBottom:20}}><label style={LS}>비밀번호</label><input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} style={IS} onKeyDown={e=>e.key==='Enter'&&doAdminLogin()}/></div>
      <MsgBox/>
      <button onClick={doAdminLogin} style={BP({width:'100%',padding:'14px',fontSize:17,borderRadius:10})}>로그인</button>
      <button onClick={()=>{setStep('phone');clearMsg();setAdminId('');setAdminPw('');}} style={{width:'100%',marginTop:10,background:'none',border:'none',color:'#9ca3af',fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:'8px 0'}}>← 일반 로그인으로</button>
    </>)}
  </div>
</div>);}

// ─── AnalyzeTab ───────────────────────────────────────────────────
function AnalyzeTab({user,onSaved}){
  const[age,setAge]=useState('');const[gender,setGender]=useState('');const[job,setJob]=useState('');const[income,setIncome]=useState('');const[address,setAddress]=useState('');const[extras,setExtras]=useState([]);
  const[loading,setLoading]=useState(false);const[step,setStep]=useState(0);const[results,setResults]=useState(null);const[err,setErr]=useState('');const[savedIds,setSavedIds]=useState(new Set());const rRef=useRef();
  const loadSavedIds=useCallback(()=>{const ids=new Set(sList(`benefit_item:${user.phone}:`).map(k=>k.split(':').pop()));setSavedIds(ids);},[user.phone]);
  useEffect(()=>{loadSavedIds();},[loadSavedIds]);
  useEffect(()=>{if(!loading)return;let i=0;const t=setInterval(()=>{i=(i+1)%LOADING_STEPS.length;setStep(i);},2000);return()=>clearInterval(t);},[loading]);
  useEffect(()=>{if(results&&rRef.current)rRef.current.scrollIntoView({behavior:'smooth'});},[results]);
  const toggleExtra=v=>setExtras(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);
  const analyze=async()=>{
    if(!age||!gender||!job||!income||!address){alert('모든 필수 항목(*)을 입력해 주세요.');return;}
    setLoading(true);setResults(null);setErr('');setStep(0);
    const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
    const extra=extras.join(', ')||'없음';
    const prompt=`당신은 대한민국 복지 전문가입니다. 아래 정보로 받을 수 있는 정부·지자체 복지 혜택을 분석해주세요.\n[정보] 나이:${age}세/성별:${gender}/직업:${job}/소득:${income}/거주:${address}/추가:${extra}/기준일:${today}\n순수 JSON만 반환 (마크다운 코드블록 없이):\n{"summary":{"totalBenefits":숫자,"estimatedMonthlyBenefit":"금액범위","topPriority":"혜택명"},"benefits":[{"id":1,"category":"주거/의료/금융/교육/고용/보육/노인/장애/청년/기타 중 택1","categoryIcon":"이모지","scope":"전국 또는 지역명","isUrgent":false,"title":"혜택명","institution":"기관명","description":"설명2~3문장","amount":"금액","deadline":"YYYY년 MM월 DD일 형식 또는 수시 신청","requiredDocuments":["서류1","서류2"],"howToApply":"방법","applyUrl":"https://..."}]}\n최소8개 최대15개. 실제 혜택만. 지역혜택은 ${address} 기준. 마감일은 YYYY년 MM월 DD일 형식으로.\napplyUrl 규칙(매우 중요): 홈페이지 메인 URL 절대 금지. 반드시 신청서 또는 서비스 목록 페이지 직접 URL을 사용할 것. 주요 포털 신청 URL: 복지로 신청=https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do, 정부24 신청=https://www.gov.kr/portal/serviceList, 고용24=https://www.work.go.kr/jobcenter/main.do, 주택도시기금=https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp, 청년정책포털=https://www.youthcenter.go.kr/youngPlcyUnif/youngPlcyUnifList.do, 국민건강보험=https://www.nhis.or.kr/nhis/policy/wbhada02800m01.do, 국민연금=https://www.nps.or.kr/jsppage/service/apply/apply.jsp, 근로복지공단=https://www.kcomwel.or.kr/kcomwel/paym/acci/acci.jsp. 모르는 경우 해당 기관의 민원 또는 신청 서브페이지 URL을 추론해서 넣을 것.`;
    try{const raw=await callClaude(prompt);setResults(JSON.parse(raw));}catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  const toggleSave=(b)=>{const key=`benefit_item:${user.phone}:${b.id}`;if(savedIds.has(String(b.id))){sDel(key);setSavedIds(p=>{const n=new Set(p);n.delete(String(b.id));return n;});}else{sSet(key,{...b,savedAt:new Date().toISOString(),userPhone:user.phone});setSavedIds(p=>new Set([...p,String(b.id)]));}onSaved();};
  const urgent=results?.benefits?.filter(b=>b.isUrgent)||[];const normal=results?.benefits?.filter(b=>!b.isUrgent)||[];
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
    {loading&&<div style={{textAlign:'center',padding:'36px 0'}}><div style={{width:42,height:42,border:'3px solid #d4cdc2',borderTopColor:'#1a6b6b',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/><div style={{fontSize:14,color:'#6b6560'}}>전국 복지 혜택을 분석하고 있습니다...</div><div style={{fontSize:13,color:'#1a6b6b',marginTop:5,fontWeight:500}}>{LOADING_STEPS[step]}</div></div>}
    {err&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#991b1b',fontSize:13,marginBottom:16}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>}
    {results&&(<div ref={rRef}>
      <div style={{marginBottom:16}}><div style={{display:'flex',gap:7,alignItems:'center',marginBottom:5}}><span style={{background:'#1a6b6b',color:'#fff',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>분석 완료</span><span style={{fontSize:12,color:'#6b6560'}}>{age}세 · {gender} · {address}</span></div><div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700}}>총 <span style={{color:'#c94f1a'}}>{results.benefits?.length}개</span> 혜택 발견</div><div style={{fontSize:13,color:'#6b6560',marginTop:4}}>🔖 원하는 혜택 카드의 북마크 버튼으로 보관함에 저장하세요</div></div>
      <div style={{background:'linear-gradient(135deg,#1a6b6b,#0d4f4f)',borderRadius:14,padding:22,color:'#fff',marginBottom:18}}><div style={{fontFamily:'serif',fontWeight:700,marginBottom:12,fontSize:15}}>📊 나의 복지 혜택 요약</div><div style={{display:'flex',gap:24,flexWrap:'wrap'}}>{[{v:results.benefits?.length,l:'혜택 수'},{v:results.summary?.estimatedMonthlyBenefit,l:'월 예상 혜택'},{v:results.benefits?.filter(b=>b.isUrgent).length,l:'긴급 신청'}].map(({v,l})=>(<div key={l}><div style={{fontSize:'1.76rem',fontWeight:900,color:'#c9a84c',lineHeight:1}}>{v}</div><div style={{fontSize:12,opacity:0.7,marginTop:3}}>{l}</div></div>))}</div>{results.summary?.topPriority&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.15)',fontSize:13,opacity:0.85}}>⚡ 가장 먼저: <strong>{results.summary.topPriority}</strong></div>}</div>
      {urgent.length>0&&<><Divider label="🔴 긴급 신청 필요"/>{urgent.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}</>}
      {normal.length>0&&<><Divider label="전체 혜택 목록"/>{normal.map(b=><BCard key={b.id} b={b} savedIds={savedIds} onToggleSave={toggleSave}/>)}</>}
      <div style={{background:'#ede8dc',borderRadius:10,padding:'14px 16px',marginTop:20,fontSize:13,color:'#6b6560',lineHeight:1.7}}><strong style={{color:'#0d1117'}}>⚠️ 유의사항</strong><br/>본 분석은 참고 정보입니다. 실제 지원 조건·금액·기한은 해당 기관에 직접 확인하세요. (<strong>복지로 129</strong> / <strong>주민센터</strong>)</div>
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
      <div style={{background:'linear-gradient(135deg,#0d1117,#1e2733)',borderRadius:16,padding:'24px 26px',marginBottom:16,color:'#fff'}}><div style={{fontSize:11,fontWeight:700,color:'#c9a84c',letterSpacing:3,textTransform:'uppercase',marginBottom:10}}>✦ 나만의 인생 설계 플랜</div><div style={{fontFamily:'serif',fontSize:'1.43rem',fontWeight:700,marginBottom:10,lineHeight:1.4}}>{result.summary?.headline}</div><p style={{fontSize:14,color:'rgba(255,255,255,0.7)',lineHeight:1.7,marginBottom:16}}>{result.summary?.keyInsight}</p><div style={{display:'flex',gap:20,flexWrap:'wrap'}}>{[{v:result.summary?.totalYears+'년',l:'목표까지 예상 기간'},{v:result.financials?.totalNeeded,l:'총 필요 자금'},{v:result.financials?.monthlyRequired,l:'권장 월 저축액'}].map(({v,l})=>(<div key={l}><div style={{fontSize:'1.65rem',fontWeight:900,color:'#c9a84c',lineHeight:1}}>{v}</div><div style={{fontSize:12,opacity:0.6,marginTop:3}}>{l}</div></div>))}</div><div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}><button onClick={savePlan} style={BP({padding:'9px 16px',fontSize:13,borderRadius:8,background:'#c9a84c',color:'#0d1117'})}>💾 플랜 저장</button><button onClick={()=>setView('form')} style={BP({padding:'9px 16px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.1)'})}>✏️ 다시 설계</button></div></div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:14}}>💰 재정 분석</div>{result.financials?.breakdown?.map((b,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:i<result.financials.breakdown.length-1?'1px solid #f0ebe0':'none'}}><div><div style={{fontSize:14,fontWeight:600}}>{b.label}</div><div style={{fontSize:12,color:'#6b6560',marginTop:2}}>{b.note}</div></div><div style={{fontSize:15,fontWeight:700,color:'#1a6b6b',flexShrink:0,marginLeft:12}}>{b.amount}</div></div>))}<div style={{background:'#faf7f2',borderRadius:10,padding:'12px 14px',marginTop:8}}><div style={{fontSize:13,color:'#374151',lineHeight:1.7,marginBottom:4}}><strong>현재 저축 갭:</strong> {result.financials?.currentGap}</div><div style={{fontSize:13,color:'#374151',lineHeight:1.7}}><strong>자산 운용 시:</strong> {result.financials?.expectedReturn}</div></div></div>
      <div style={{marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.10rem',marginBottom:14}}>🗓 단계별 타임라인</div>{result.timeline?.map((phase,pi)=>{const pc=PHASE_COLORS[phase.color]||'#1a6b6b';return(<div key={pi} style={{marginBottom:14}}><div style={{background:pc,borderRadius:'12px 12px 0 0',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontSize:13,color:'rgba(255,255,255,0.7)',fontWeight:500}}>Phase {pi+1}</div><div style={{fontSize:17,fontWeight:700,color:'#fff'}}>{phase.phase}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:13,color:'rgba(255,255,255,0.8)'}}>{phase.period}</div><div style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>{phase.age}</div></div></div><div style={{background:'#fff',border:'1px solid #d4cdc2',borderTop:'none',borderRadius:'0 0 12px 12px',overflow:'hidden'}}>{phase.tasks?.map((task,ti)=>{const ts=TYPE_STYLE[task.type]||TYPE_STYLE['준비'];return(<div key={ti} style={{padding:'13px 16px',borderBottom:ti<phase.tasks.length-1?'1px solid #f5f0e8':'none',display:'flex',gap:12,alignItems:'flex-start',background:task.urgent?'#fffbf0':'#fff'}}><span style={{background:ts.bg,color:ts.color,fontSize:11,fontWeight:700,padding:'3px 7px',borderRadius:5,whiteSpace:'nowrap',flexShrink:0,marginTop:1}}>{task.type}</span><div style={{flex:1}}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><div><div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{task.urgent&&'⚡ '}{task.action}</div><div style={{fontSize:12,color:'#6b6560',lineHeight:1.5}}>{task.detail}</div></div><div style={{flexShrink:0,textAlign:'right'}}><div style={{fontSize:12,color:'#9ca3af'}}>{task.month}</div>{task.amount&&<div style={{fontSize:13,fontWeight:700,color:pc,marginTop:2}}>{task.amount}</div>}</div></div></div></div>);})}</div></div>);})}</div>
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
      <div style={{background:'linear-gradient(135deg,#4a0e4e,#1a0a2e)',borderRadius:14,padding:'22px 24px',marginBottom:16,color:'#fff'}}><div style={{fontSize:11,letterSpacing:3,color:'#f9a8d4',textTransform:'uppercase',marginBottom:8}}>✦ 웨딩 플래너</div><div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700,marginBottom:6}}>예산에 맞는 완벽한 결혼식을<br/>설계해드립니다 💍</div><p style={{fontSize:13,color:'rgba(255,255,255,0.65)',lineHeight:1.7}}>스드메부터 웨딩홀, 신혼여행까지 — 준비 일정과 예산을 한 번에</p></div>
      <div style={{...CS,marginBottom:14}}><h2 style={{fontFamily:'serif',fontSize:'1.10rem',fontWeight:700,marginBottom:14}}>결혼 기본 정보</h2><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}><div><label style={LS}>총 결혼 예산 (만원) <R/></label><input type="number" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="예: 3000" style={IS}/></div><div><label style={LS}>결혼식 지역 <R/></label><input value={region} onChange={e=>setRegion(e.target.value)} placeholder="예: 서울 강남, 수원" style={IS}/></div><div><label style={LS}>희망 결혼 시기</label><input type="month" value={wdate} onChange={e=>setWdate(e.target.value)} style={IS}/></div><div><label style={LS}>예상 하객 수 (명) <R/></label><input type="number" value={guests} onChange={e=>setGuests(e.target.value)} placeholder="예: 200" style={IS}/></div><div><label style={LS}>웨딩 스타일</label><select value={style} onChange={e=>setStyle(e.target.value)} style={SS}><option value="">선택하세요</option>{['일반 웨딩홀','야외/가든 웨딩','스몰 웨딩 (50명 이하)','호텔 웨딩','레스토랑 웨딩','교회/성당 웨딩','한옥 웨딩'].map(v=><option key={v}>{v}</option>)}</select></div><div><label style={LS}>양가 지원 / 예상 부조금</label><input value={contrib} onChange={e=>setContrib(e.target.value)} placeholder="예: 양가 1000만원 + 부조금 예상" style={IS}/></div><div style={{gridColumn:'1/-1'}}><label style={LS}>추가 요청사항</label><input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="예: 드레스 2벌, 야외 촬영 희망" style={IS}/></div></div><button onClick={analyze} disabled={loading} style={BP({width:'100%',marginTop:18,padding:'14px',fontSize:15,borderRadius:10,opacity:loading?0.7:1,background:'#4a0e4e',display:'flex',alignItems:'center',justifyContent:'center',gap:8})}><span style={{fontSize:18}}>💍</span>{loading?'맞춤 웨딩 플랜 설계 중...':'나만의 웨딩 플랜 설계하기'}</button></div>
      {loading&&<div style={{textAlign:'center',padding:'36px 0'}}><div style={{fontSize:35,marginBottom:12,animation:'spin 3s linear infinite',display:'inline-block'}}>💍</div><div style={{fontSize:14,color:'#6b6560'}}>맞춤 웨딩 플랜을 설계하고 있습니다...</div><div style={{fontSize:13,color:'#be185d',marginTop:5,fontWeight:500}}>{WEDDING_STEPS_LOAD[stepIdx]}</div></div>}
      {err&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#991b1b',fontSize:13}}><strong>오류:</strong><br/><code style={{fontSize:12,wordBreak:'break-all'}}>{err}</code></div>}
    </div>)}
    {view==='result'&&result&&(<div ref={rRef}>
      <div style={{background:'linear-gradient(135deg,#4a0e4e,#1a0a2e)',borderRadius:14,padding:'22px 24px',marginBottom:14,color:'#fff'}}><div style={{fontSize:11,letterSpacing:3,color:'#f9a8d4',textTransform:'uppercase',marginBottom:8}}>✦ 맞춤 웨딩 플랜</div><div style={{fontFamily:'serif',fontSize:'1.38rem',fontWeight:700,lineHeight:1.4,marginBottom:8}}>{result.summary?.headline}</div><p style={{fontSize:13,color:'rgba(255,255,255,0.7)',lineHeight:1.7,marginBottom:16}}>{result.summary?.keyAdvice}</p><div style={{display:'flex',gap:20,flexWrap:'wrap',marginBottom:16}}><div><div style={{fontSize:'1.65rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{result.summary?.totalBudget}</div><div style={{fontSize:12,opacity:0.6,marginTop:3}}>총 예산</div></div><div><div style={{fontSize:'1.65rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{result.summary?.perGuest}</div><div style={{fontSize:12,opacity:0.6,marginTop:3}}>1인당 비용</div></div><div><div style={{fontSize:'1.65rem',fontWeight:900,color:'#f9a8d4',lineHeight:1}}>{guests}명</div><div style={{fontSize:12,opacity:0.6,marginTop:3}}>하객 수</div></div></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button onClick={savePlan} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'#be185d',color:'#fff'})}>💾 플랜 저장</button><button onClick={()=>setView('calendar')} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.12)'})}>📅 캘린더 동기화</button><button onClick={()=>setView('form')} style={BP({padding:'9px 14px',fontSize:13,borderRadius:8,background:'rgba(255,255,255,0.08)'})}>✏️ 다시 설계</button></div></div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem',marginBottom:14}}>💰 예산 배분 계획</div>{result.budget?.items?.map((item,i)=>(<div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<result.budget.items.length-1?'1px solid #f5f0e8':'none'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:20}}>{item.icon}</span><span style={{fontSize:14,fontWeight:700}}>{item.category}</span></div><div style={{textAlign:'right'}}><span style={{fontSize:14,fontWeight:700,color:'#c9a84c'}}>{item.recommended}만원</span><span style={{fontSize:11,color:'#9ca3af',marginLeft:5}}>{item.min}~{item.max}만원</span></div></div><BudgetBar min={item.min} max={item.max} rec={item.recommended} total={budget}/><div style={{fontSize:12,color:'#6b6560',marginTop:4}}>💡 {item.tip}</div></div>))}{result.budget?.hiddenCosts?.length>0&&(<div style={{background:'#fef9c3',border:'1px solid #fde68a',borderRadius:8,padding:'10px 13px',marginTop:4}}><div style={{fontSize:12,fontWeight:700,color:'#854d0e',marginBottom:5}}>⚠️ 주의! 숨겨진 비용</div>{result.budget.hiddenCosts.map((c,i)=><div key={i} style={{fontSize:12,color:'#78350f',lineHeight:1.6}}>• {c}</div>)}</div>)}</div>
      <div style={{...CS,marginBottom:14}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem',marginBottom:14}}>💒 업체 추천</div><div style={{display:'flex',background:'#f5f0e8',borderRadius:9,padding:3,gap:3,marginBottom:14,overflowX:'auto'}}>{VENDOR_TABS.map(([v,l])=>(<button key={v} onClick={()=>setVendorTab(v)} style={{flex:'0 0 auto',padding:'8px 12px',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',background:vendorTab===v?VENDOR_ACCENT[v]:'transparent',color:vendorTab===v?'#fff':'#6b6560',whiteSpace:'nowrap'}}>{l}</button>))}</div>
      {[...(result.vendors?.[vendorTab]||[]),...(extraVendors[vendorTab]||[])].map((v,i)=>(<VendorCard key={i} v={v} accent={VENDOR_ACCENT[vendorTab]}/>))}
      {(extraVendors[vendorTab]||[]).length<10
        ?(<button onClick={()=>loadMoreVendors(vendorTab)} disabled={extraLoading} style={{width:'100%',marginTop:4,padding:'11px',border:`1.5px dashed ${VENDOR_ACCENT[vendorTab]}`,borderRadius:10,background:'transparent',color:VENDOR_ACCENT[vendorTab],fontSize:14,fontWeight:700,cursor:extraLoading?'not-allowed':'pointer',fontFamily:'inherit',opacity:extraLoading?0.6:1}}>{extraLoading?'업체 검색 중...':'+ 추가 업체 추천 받기'}</button>)
        :(<div style={{textAlign:'center',padding:'10px 0',fontSize:13,color:'#9ca3af'}}>✅ 추가 업체 추천이 완료됐습니다 ({(result.vendors?.[vendorTab]?.length||0)+(extraVendors[vendorTab]?.length||0)}개)</div>)
      }
      </div>
      <div style={{...CS,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}><div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem'}}>🗓 웨딩 준비 타임라인</div><div style={{display:'flex',gap:7}}><button onClick={downloadAllWeddingICS} style={BP({padding:'8px 13px',fontSize:12,borderRadius:8,background:'#edf6f6',color:'#1a6b6b',display:'flex',alignItems:'center',gap:5})}>📅 전체 캘린더 추가</button><button onClick={sendAllTimelineKakao} style={BP({padding:'8px 13px',fontSize:12,borderRadius:8,background:'#FEE500',color:'#3C1E1E',display:'flex',alignItems:'center',gap:5})}>💬 전체 카카오 공유</button></div></div><div style={{position:'relative'}}><div style={{position:'absolute',left:16,top:0,bottom:0,width:2,background:'#f0ebe0'}}/>{result.timeline?.map((task,i)=>{const cs=CAT_STYLE[task.category]||CAT_STYLE['준비'];const dl=parseDeadline(task.deadline);const days=daysLeft(dl);return(<div key={i} style={{display:'flex',gap:14,marginBottom:14,position:'relative'}}><div style={{width:32,height:32,borderRadius:'50%',background:cs.bg,border:`2px solid ${cs.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,zIndex:1}}>{task.icon||'💍'}</div><div style={{flex:1,background:task.urgent?'#fffbf0':'#faf7f2',border:`1px solid ${task.urgent?'#fde68a':'#e8e2d8'}`,borderRadius:10,padding:'11px 13px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap',marginBottom:4}}><div><span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:5,background:cs.bg,color:cs.color,marginRight:6}}>{task.category}</span><span style={{fontSize:14,fontWeight:700}}>{task.urgent?'⚡ ':''}{task.action}</span></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:11,color:'#9ca3af'}}>{task.timing}</div>{days!==null&&days>=0&&<div style={{fontSize:12,fontWeight:700,color:days<=30?'#c94f1a':'#c9a84c'}}>D-{days}</div>}</div></div><div style={{fontSize:12,color:'#6b6560',lineHeight:1.5,marginBottom:task.documents?.length?6:0}}>{task.detail}</div>{task.documents?.length>0&&(<div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:5}}>{task.documents.map(d=><span key={d} style={{fontSize:11,background:'#f0ebe0',border:'1px solid #d4cdc2',borderRadius:4,padding:'2px 6px'}}>📄 {d}</span>)}</div>)}<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>{task.vendor&&<span style={{fontSize:11,color:'#6b6560'}}>🏢 {task.vendor}</span>}{task.amount&&<span style={{fontSize:12,fontWeight:700,color:'#be185d'}}>💰 {task.amount}</span>}{dl&&(<div style={{marginLeft:'auto',display:'flex',gap:5}}><button onClick={()=>openGoogleCalendar({...task,title:task.action,institution:task.vendor||'웨딩 일정',requiredDocuments:task.documents||[]})} style={BP({padding:'4px 9px',fontSize:11,borderRadius:5,background:'#0d1117'})}>📱</button><button onClick={()=>sendKakaoMe({...task,title:task.action,institution:task.vendor||'웨딩 일정',requiredDocuments:task.documents||[]})} style={BP({padding:'4px 9px',fontSize:11,borderRadius:5,background:'#FEE500',color:'#3C1E1E'})}>💬</button></div>)}</div></div></div>);})}</div></div>
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
      <div style={{fontSize:11,letterSpacing:3,color:'#7dd3fc',textTransform:'uppercase',marginBottom:8}}>✦ 부동산 분석</div>
      <div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700,marginBottom:6}}>나에게 맞는 집을<br/>찾아드립니다 🏠</div>
      <p style={{fontSize:13,color:'rgba(255,255,255,0.65)',lineHeight:1.7}}>집 유형과 조건을 입력하면 매물 정보, 대출 상품, 정부 지원까지 한번에</p>
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
        <div style={{fontSize:11,letterSpacing:3,color:'#7dd3fc',textTransform:'uppercase',marginBottom:8}}>✦ 분석 완료</div>
        <div style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700,lineHeight:1.4,marginBottom:8}}>{result.summary?.headline}</div>
        <p style={{fontSize:13,color:'rgba(255,255,255,0.75)',lineHeight:1.7,marginBottom:14}}>{result.summary?.insight}</p>
        <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
          {[{v:result.summary?.avgPrice,l:'평균 매매가'},{v:result.summary?.priceRange,l:'가격 범위'},{v:houseType,l:'집 유형'}].map(({v,l})=>(<div key={l}><div style={{fontSize:'1.10rem',fontWeight:900,color:'#7dd3fc',lineHeight:1}}>{v}</div><div style={{fontSize:12,opacity:0.6,marginTop:3}}>{l}</div></div>))}
        </div>
        {result.summary?.marketTrend&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.15)',fontSize:13,color:'rgba(255,255,255,0.7)'}}>📈 {result.summary.marketTrend}</div>}
      </div>

      <div style={{...CS,marginBottom:14}}>
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem',marginBottom:14}}>🏠 추천 매물</div>
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
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem',marginBottom:14}}>💳 이용 가능한 대출 상품</div>
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
        <div style={{fontFamily:'serif',fontWeight:700,fontSize:'1.27rem',marginBottom:14}}>🏛 정부 지원 혜택</div>
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

  // API 키 없으면 경고 배너 표시
  const noKey = !API_KEY;

  useEffect(() => {
    const s = getSession();
    if (s) setUser(s);
    setReady(true);
  }, []);

  const login = (u) => { saveSession(u); setUser(u); };
  const logout = () => { clearSession(); setUser(null); setTab('analyze'); };
  const refreshCount = useCallback(() => {
    if (!user) return;
    setSavedCount(sList(`benefit_item:${user.phone}:`).length);
  }, [user]);
  useEffect(() => { refreshCount(); }, [refreshCount]);

  if (!ready) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0d1117',color:'#c9a84c',fontFamily:'serif',fontSize:'1.32rem',fontWeight:700}}>네모혜</div>;
  if (!user) return <AuthScreen onLogin={login} />;

  const NAV = [['analyze','🔍 혜택설계'],['life','🗺 인생설계'],['wedding','💍 결혼설계'],['realestate','🏠 부동산'],['saved',`📁 보관함${savedCount>0?` ${savedCount}`:''}`],['profile','👤 내 정보'],...(user?.isAdmin?[['admin','⚙️ Admin']]:[])];

  return (
    <div style={{fontFamily:"'Noto Sans KR', sans-serif",background:'#f5f0e8',minHeight:'100vh',color:'#0d1117'}}>
      {/* API 키 없을 때 경고 배너 */}
      {noKey && (
        <div style={{background:'#c94f1a',color:'#fff',padding:'10px 20px',textAlign:'center',fontSize:14,lineHeight:1.6}}>
          ⚠️ <strong>VITE_ANTHROPIC_KEY</strong> 환경변수가 설정되지 않았습니다.
          프로젝트 루트에 <code style={{background:'rgba(255,255,255,0.2)',padding:'2px 6px',borderRadius:4}}>.env</code> 파일을 만들고{' '}
          <code style={{background:'rgba(255,255,255,0.2)',padding:'2px 6px',borderRadius:4}}>VITE_ANTHROPIC_KEY=sk-ant-...</code>를 추가하세요.
        </div>
      )}

      <header style={{background:'#0d1117',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:200,height:56}}>
        <div onClick={()=>setTab('analyze')} style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer'}}>
          <Logo size={34}/>
          <span style={{fontFamily:'serif',fontWeight:900,fontSize:'1.26rem',color:'#fff',letterSpacing:-0.5}}>네모<span style={{color:'#c9a84c'}}>혜</span></span>
        </div>
        <nav style={{display:'flex',gap:2}}>
          {NAV.map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)}
              style={{background:tab===v?'rgba(255,255,255,0.1)':'transparent',color:tab===v?'#fff':'#6b7280',border:'none',padding:'7px 12px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}>
              {l}
            </button>
          ))}
        </nav>
        <button onClick={logout} style={{background:'transparent',border:'1px solid #3a4250',color:'#9ca3af',padding:'5px 12px',borderRadius:7,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>로그아웃</button>
      </header>

      {tab==='analyze' && (
        <div style={{background:'#0d1117',padding:'36px 20px 52px',textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',bottom:-2,left:0,right:0,height:32,background:'#f5f0e8',clipPath:'ellipse(55% 100% at 50% 100%)'}}/>
          <div style={{display:'inline-block',background:'rgba(201,168,76,0.15)',border:'1px solid #c9a84c',color:'#c9a84c',fontSize:11,letterSpacing:3,textTransform:'uppercase',padding:'5px 14px',borderRadius:20,marginBottom:14}}>✦ 네 모든 혜택 분석</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:11,marginBottom:12}}><Logo size={44}/><span style={{fontFamily:'serif',fontSize:'2.20rem',fontWeight:900,color:'#fff',letterSpacing:-1}}>네모<span style={{color:'#c9a84c'}}>혜</span></span></div>
          <p style={{color:'#9ba3ae',fontSize:14,lineHeight:1.7}}>안녕하세요, <strong style={{color:'#c9a84c'}}>{user.name}</strong>님 👋<br/>나이, 성별, 직업, 소득, 주소를 입력하면 맞춤 혜택을 찾아드려요</p>
        </div>
      )}

      {tab!=='analyze' && (
        <div style={{background:'#fff',borderBottom:'1px solid #d4cdc2',padding:'18px 20px'}}>
          <div style={{maxWidth:760,margin:'0 auto'}}>
            <h1 style={{fontFamily:'serif',fontSize:'1.32rem',fontWeight:700}}>
              {tab==='life'?'🗺 인생 설계':tab==='wedding'?'💍 결혼 설계':tab==='realestate'?'🏠 부동산 설계':tab==='saved'?'📁 내 혜택 보관함':tab==='admin'?'⚙️ Admin 회원 관리':'👤 내 정보'}
            </h1>
            {tab==='life'&&<p style={{fontSize:13,color:'#6b6560',marginTop:3}}>목표와 재정 상황을 입력하면 현실적인 단계별 인생 플랜을 설계해드려요</p>}
            {tab==='wedding'&&<p style={{fontSize:13,color:'#6b6560',marginTop:3}}>예산·지역·스타일 입력 → 스드메·웨딩홀 추천 + 준비 일정 캘린더 동기화</p>}
            {tab==='realestate'&&<p style={{fontSize:13,color:'#6b6560',marginTop:3}}>집 유형과 조건을 입력하면 추천 매물·대출 상품·정부 지원을 한번에 분석해드려요</p>}
            {tab==='saved'&&<p style={{fontSize:13,color:'#6b6560',marginTop:3}}>저장한 혜택 목록과 캘린더 알림을 확인할 수 있어요</p>}
          </div>
        </div>
      )}

      <div style={{maxWidth:760,margin:'0 auto',padding:tab==='analyze'?'0 20px 60px':'20px 20px 60px',position:'relative',zIndex:10,marginTop:tab==='analyze'?-14:0}}>
        {tab==='analyze' && <AnalyzeTab user={user} onSaved={refreshCount}/>}
        {tab==='life'    && <LifeTab user={user}/>}
        {tab==='wedding' && <WeddingTab user={user}/>}
        {tab==='realestate' && <RealEstateTab user={user}/>}
        {tab==='saved'   && <SavedTab user={user}/>}
        {tab==='profile' && <ProfileTab user={user} onLogout={logout} savedCount={savedCount}/>}
        {tab==='admin' && user?.isAdmin && <AdminTab/>}
      </div>

      <footer style={{background:'#0d1117',padding:'20px 24px',textAlign:'center',color:'#5a6270',fontSize:12,lineHeight:1.8}}>
        <p>본 서비스는 복지 안내 서비스로, 실제 수혜 여부는 관할 기관에 직접 문의하시기 바랍니다.</p>
        <p style={{marginTop:4,color:'#3a4250'}}>© 2026 네모혜 — 네 모든 혜택을 찾아드리는 서비스</p>
      </footer>
    </div>
  );
}
