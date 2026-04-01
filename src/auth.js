// ═══════════════════════════════════════════════════════════════════════
//  auth.js — 인증 모듈
//
//  📌 로그인 방식을 바꾸려면 이 파일만 수정하세요.
//     App.jsx는 건드릴 필요 없습니다.
//
//  현재 공급자: Solapi (솔라피/CoolSMS) SMS OTP
//
//  다른 공급자로 교체 시:
//    SECTION A (Provider Implementation) 를 통째로 교체하세요.
//    SECTION B (Common Interface) 는 그대로 유지됩니다.
// ═══════════════════════════════════════════════════════════════════════

// ─── 관리자 자격증명 ──────────────────────────────────────────────────
export const ADMIN_ID = 'lovejesus420';
export const ADMIN_PW = 'kim159753';

// ═══════════════════════════════════════════════════════════════════════
//  SECTION A: PROVIDER IMPLEMENTATION — Solapi SMS OTP
//
//  🔄 다른 공급자로 교체 시 이 섹션을 통째로 바꾸세요.
//  외부에 노출되는 함수: sendOTP(phone, _containerId), verifyOTP(code)
//
//  Solapi 설정 방법:
//    1. https://solapi.com 회원가입 → 충전 (건당 ₩8~20)
//    2. 콘솔 > 개발 > API Key Management > API Key / API Secret 복사
//    3. 콘솔 > 발신번호 > 발신번호 등록 (본인 번호 인증)
//    4. 프로젝트 루트 .env 파일:
//
//       SOLAPI_API_KEY=솔라피API키
//       SOLAPI_API_SECRET=솔라피API시크릿
//       SOLAPI_SENDER=발신번호(숫자만, e.g. 01012345678)
//       OTP_TOKEN_SECRET=랜덤긴문자열(openssl rand -hex 32 로 생성)
//
//    5. Vercel 배포 시: 프로젝트 Settings > Environment Variables 에 동일 변수 추가
//       (VITE_ 접두사 없이 서버 전용 변수로 설정)
//
//  작동 방식:
//    sendOTP → /api/send-otp (Vercel Function) → Solapi SMS 발송
//              → 서명된 OTP 토큰 반환 (DB 불필요, 5분 유효)
//    verifyOTP → /api/verify-otp (Vercel Function) → 토큰+코드 검증
//              → 성공 시 전화번호 반환
// ═══════════════════════════════════════════════════════════════════════

// 현재 인증 세션에서 임시로 OTP 토큰 보관
let _otpToken = null;

/**
 * SMS 인증코드 발송
 * @param {string} phone        - 한국 휴대폰 번호 (010-xxxx-xxxx 등 다양한 형식 허용)
 * @param {string} _containerId - 사용 안 함 (Firebase reCAPTCHA 호환성 유지용 파라미터)
 */
export async function sendOTP(phone, _containerId) {
  _otpToken = null;

  const res = await fetch('/api/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'SMS 발송에 실패했습니다.');

  _otpToken = data.token; // 서버에서 발급한 서명 토큰 보관
}

/**
 * 인증코드 검증
 * @param {string} code - 사용자가 입력한 6자리 숫자 코드
 * @returns {Promise<{ uid: string, phone: string }>}  phone: E.164 (+82...) 형식
 */
export async function verifyOTP(code) {
  if (!_otpToken) throw new Error('먼저 인증 코드를 요청하세요.');

  const res = await fetch('/api/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: _otpToken, code }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '인증에 실패했습니다.');

  _otpToken = null; // 사용 후 토큰 폐기
  return { uid: data.phone, phone: data.phone }; // uid = phone (Firebase uid 자리 대체)
}

// ═══════════════════════════════════════════════════════════════════════
//  SECTION B: COMMON INTERFACE
//  ✅ 공급자를 바꿔도 이 섹션은 수정하지 않아도 됩니다.
// ═══════════════════════════════════════════════════════════════════════

// localStorage 헬퍼 (auth 전용, App.jsx 의 sGet/sSet 과 독립적)
const _ls = {
  get:  (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set:  (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del:  (k) => { try { localStorage.removeItem(k); } catch {} },
  list: (p) => { try { return Object.keys(localStorage).filter(k => k.startsWith(p)); } catch { return []; } },
};

/** 현재 세션 불러오기 */
export function getSession()      { return _ls.get('session:current'); }
/** 세션 저장 */
export function saveSession(user) { _ls.set('session:current', user); }
/** 세션 삭제 */
export function clearSession()    { _ls.del('session:current'); }

/**
 * 신규 사용자 등록
 * @param {{ name: string, phone: string, uid: string }} user
 * @returns {{ name, phone, uid, createdAt }}
 */
export function registerUser(user) {
  const record = { ...user, createdAt: new Date().toISOString() };
  _ls.set(`user:${user.phone}`, record);
  return record;
}

/** 전화번호(E.164)로 사용자 조회 */
export function getUser(phone) { return _ls.get(`user:${phone}`); }

/** 전체 사용자 목록 (관리자 계정 제외, 가입일 최신순) */
export function getAllUsers() {
  return _ls.list('user:')
    .filter(k => k !== `user:${ADMIN_ID}`)
    .map(k => _ls.get(k))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** 사용자 삭제 */
export function deleteUser(phone) { _ls.del(`user:${phone}`); }

/**
 * 전화번호를 읽기 좋은 형식으로 변환
 * +821012345678 → 010-1234-5678
 * 관리자 ID 등 일반 문자열은 그대로 반환
 */
export function formatPhone(phone) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('82') ? '0' + d.slice(2) : d;
  if (local.length === 11) return local.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (local.length === 10) return local.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return phone;
}
