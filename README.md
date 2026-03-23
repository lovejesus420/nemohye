# 네모혜 🏷️
> 네 모든 혜택을 찾아드리는 서비스

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어서 VITE_ANTHROPIC_KEY에 실제 API 키 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:5173 에서 열림
```

## Vercel 배포 (가장 빠른 방법)

### 방법 1: GitHub 연동 자동 배포

1. 이 폴더를 GitHub 레포로 올리기
   ```bash
   git init
   git add .
   git commit -m "feat: 네모혜 초기 배포"
   git remote add origin https://github.com/YOUR_USERNAME/nemohye.git
   git push -u origin main
   ```

2. [vercel.com](https://vercel.com) 접속 → **Add New Project** → GitHub 레포 선택

3. **Environment Variables** 섹션에서 추가:
   - Key: `VITE_ANTHROPIC_KEY`
   - Value: `sk-ant-...` (실제 API 키)

4. **Deploy** 클릭 → 자동으로 `https://nemohye.vercel.app` 형태의 URL 발급

### 방법 2: CLI 직접 배포

```bash
# Vercel CLI 설치
npm install -g vercel

# 배포 (처음 실행 시 로그인 안내)
vercel --prod

# 환경변수 설정
vercel env add VITE_ANTHROPIC_KEY production
# → 입력창에 sk-ant-... 키 붙여넣기
```

## Netlify 배포

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```
Netlify 대시보드 → Site settings → Environment variables → `VITE_ANTHROPIC_KEY` 추가

---

## 주요 기능

| 탭 | 기능 |
|---|---|
| 🔍 분석 | 나이·성별·직업·소득·주소 입력 → 정부·지자체 복지 혜택 AI 분석 |
| 🗺 인생설계 | 목표별 재정 플랜 + 단계별 타임라인 |
| 💍 결혼설계 | 스드메·웨딩홀 업체 추천 + 준비 일정 캘린더 |
| 📁 보관함 | 저장 혜택 목록 + 캘린더 마감 알림 |
| 👤 내 정보 | 프로필 관리 |

## 스택

- **React 18** + **Vite 5**
- **Anthropic Claude API** (claude-sonnet-4-20250514)
- **localStorage** (사용자 데이터 영구 저장)
- 외부 라이브러리 없음 (Zero dependencies UI)
