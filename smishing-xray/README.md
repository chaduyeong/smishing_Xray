# 🔬 스미싱 X-ray (AI개발과실전 팀 프로젝트)

의심 문자를 **X-ray로 해부**하고, **수법 DNA**로 계열을 분석하고, **신고 패키지**로 증거 PDF까지 만드는 웹 서비스.

| 페이지 | 주소 | 기능 |
|---|---|---|
| 🔍 X-ray 스캔 | `/` (index.html) | 사칭 기관·위험 링크·수법 패턴 형광펜 + 공공데이터 대조 + 경찰청 통계 + **⚠️ 만약 눌렀다면? 시뮬레이션** |
| 🧬 수법 DNA | `/dna.html` | 수법 계열 분류, 진행 흐름·대처법, 수법 계보(같은 조직 의심 묶음) |
| 🚨 신고 패키지 | `/report.html` | 캡처 OCR → 수신 시각·번호·URL 추출 → 신고용 증거 PDF |

세 페이지는 상단 메뉴로 오가고, **X-ray → 수법 DNA → 신고 패키지**로 문자를 버튼 하나로 넘길 수 있다.

## 처음 설정 (한 번만)
1. [Node.js LTS](https://nodejs.org) 설치 (`node -v`로 확인). 따로 `npm install`은 필요 없음
2. `.env.example`을 복사해서 `.env` 만들기
   ```powershell
   Copy-Item .env.example .env
   ```
3. `.env`에 키 넣기 (없는 키는 비워둬도 실행됨 → 그 기능만 규칙 기반으로 대체)
   - `OPENROUTER_API_KEY` : AI 분석 (X-ray·수법 DNA 공통)
   - `KISA_KEY` / `MOIS_KEY` : 공공데이터포털 인증키 (X-ray 링크·기관 조회)
   - 팀원이 쓰던 `.env.local`이 있으면 그대로 넣어둬도 같이 읽음

## 실행
```bash
npm run dev     # 서버가 켜지고 브라우저가 자동으로 열림 → http://localhost:3000
```
끄기: 터미널에서 `Ctrl + C`

## 테스트
```bash
npm test                                         # 자동 테스트 (키 없이도 동작)
python eval/evaluate.py --csv smishing.csv       # 데이터셋 정확도 테스트 (서버 켠 상태에서)
```

## 폴더 구조
| 파일 | 역할 | 만든 사람 |
|---|---|---|
| `index.html`, `css/xray.css`, `js/xray.js` | X-ray 스캔 + 시뮬레이션 | 팀원 |
| `api/analyze.js`, `api/org.js`, `api/domain.js` | X-ray AI·행안부·KISA API | 팀원 |
| `data/경찰청_*.csv` | 경찰청 통계 | 팀원 |
| `report.html`, `css/report.css`, `js/report.js` | 신고 패키지 | 팀원 |
| `dna.html`, `css/dna.css`, `js/dna-*.js` | 수법 DNA | 김민서 |
| `api/analyze-dna.js`, `lib/dna-ai.js`, `data/dna_families.json` | 수법 DNA AI API·사전 | 김민서 |
| `eval/` | 정확도 테스트 (Python) | 김민서 |
| `css/nav.css`, `js/handoff.js`, `js/xray-links.js`, `dev-server.js` | [통합] 공통 메뉴, 페이지 간 문자 넘기기, 통합 서버 | 통합 |
| `tests/` | 자동 테스트 | 통합 |

## 통합하면서 바꾼 것
- 파일 이름이 겹쳐서(`style.css`, `script.js`) 기능별 이름으로 바꾸고 `css/`, `js/`, `data/` 폴더로 정리
- 프로젝트 전체를 CommonJS(`require`/`module.exports`)로 통일 (팀원 API 3개는 `export default` 한 줄만 변경)
- 개발 서버 하나로 통합: `.env`와 `.env.local`을 모두 읽고, **키 파일(.env 등)은 브라우저로 못 가져가게 차단**, 내 컴퓨터(127.0.0.1)에서만 접속 가능
- X-ray: 숨김(`.hidden`) 규칙이 없어 이미지를 안 올려도 미리보기·진행 막대가 보이던 문제 수정
- 신고 패키지: 캡처 없이 문자 본문만 있어도 PDF 생성 가능 (이미지 자리에 안내 문구)

## Vercel 배포
1. GitHub 저장소에 올리기 (`.env`, `.env.local`은 .gitignore에 있어서 안 올라감)
2. Vercel에서 저장소 Import (설정 그대로, Framework: Other)
3. Settings → Environment Variables에 `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `KISA_KEY`, `MOIS_KEY` 추가
4. Deploy

## 데이터 출처
- 경찰청 보이스피싱 현황 / 정보탈취 연계형 범죄 현황
- Hugging Face `jmjmjm3/kor-smishing-message` (CC BY-NC-SA 4.0)
- 카카오뱅크·안랩·금융감독원 공개 통계 (수법 DNA 사전)
