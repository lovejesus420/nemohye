// ═══════════════════════════════════════════════════════════════════════
//  auth.js — 인증 모듈
//
//  📌 로그인 방식을 바꾸려면 이 파일만 수정하세요.
//     App.jsx는 건드릴 필요 없습니다.
//
//  현재 공급자: Firebase Phone Auth (SMS OTP)
//
//  다른 공급자로 교체 시:
//    SECTION A (Provider Implementation) 를 통째로 교체하세요.
//    SECTION B (Common Interface) 는 그대로 유지됩니다.
//
//  교체 예시:
//    - NCP SENS + Vercel Serverless Function
//    - Twilio Verify + Vercel Serverless Function
//    - 이메일 + 비밀번호 방식으로 롤백
// ═══════════════════════════════════════════════════════════════════════

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

// ─── 관리자 자격증명 ──────────────────────────────────────────────────
export const ADMIN_ID = 'lovejesus420';
export const ADMIN_PW = 'kim159753';

// ═══════════════════════════════════════════════════════════════════════
//  SECTION A: PROVIDER IMPLEMENTATION — Firebase Phone Auth
//
//  🔄 다른 공급자로 교체 시 이 섹션을 통째로 바꾸세요.
//  외부에 노출되는 함수: sendOTP(phone, containerId), verifyOTP(code)
//
//  Firebase 설정 방법:
//    1. https://console.firebase.google.com 에서 프로젝트 생성
//    2. Authentication > Sign-in method > Phone 활성화
//    3. 프로젝트 설정 > 웹 앱 추가 > 아래 config 복사
//    4. 프로젝트 루트에 .env 파일 생성 후 아래 변수 입력:
//
//       VITE_FIREBASE_API_KEY=AIza...
//       VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
//       VITE_FIREBASE_PROJECT_ID=your-project
//       VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
//       VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
//       VITE_FIREBASE_APP_ID=1:123456789:web:abc123
//
//    5. Vercel 배포 시: 프로젝트 Settings > Environment Variables 에 동일 변수 추가
//    6. Firebase 콘솔 > Authentication > Settings > 승인된 도메인에 배포 도메인 추가
// ═══════════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let _auth = null;
let _confirmResult = null;

function _getFirebaseAuth() {
  if (!_auth) {
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _auth = getAuth(app);
    _auth.languageCode = 'ko';
  }
  return _auth;
}

// 한국 번호 → E.164 변환 (010-1234-5678 → +821012345678)
function _toE164(phone) {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('82')) return '+' + d;
  if (d.startsWith('0'))  return '+82' + d.slice(1);
  return '+82' + d;
}

/**
 * SMS 인증코드 발송
 * @param {string} phone        - 한국 휴대폰 번호 (010-xxxx-xxxx 등 다양한 형식 허용)
 * @param {string} containerId  - invisible reCAPTCHA 를 마운트할 DOM element id
 */
export async function sendOTP(phone, containerId) {
  const auth = _getFirebaseAuth();
  const e164 = _toE164(phone);

  // 기존 reCAPTCHA 정리 (재발송 시 필요)
  if (window._recaptchaVerifier) {
    try { window._recaptchaVerifier.clear(); } catch {}
    window._recaptchaVerifier = null;
  }

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {},
  });
  window._recaptchaVerifier = verifier;

  _confirmResult = await signInWithPhoneNumber(auth, e164, verifier);
}

/**
 * 인증코드 검증
 * @param {string} code - 사용자가 입력한 6자리 숫자 코드
 * @returns {Promise<{ uid: string, phone: string }>}  uid: Firebase UID, phone: E.164 형식
 */
export async function verifyOTP(code) {
  if (!_confirmResult) throw new Error('먼저 인증 코드를 요청하세요.');
  const cred = await _confirmResult.confirm(code);
  return { uid: cred.user.uid, phone: cred.user.phoneNumber };
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
  return phone; // 변환 불가 시 원본 반환
}
