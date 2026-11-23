// ======================================================== // 스크립트 메인 설정 영역 구분선입니다.
// 스미싱 및 보이스피싱 실시간 X-ray 정밀 분석 엔진 (AI & OCR 하이브리드) // 역할 주석입니다.
// ======================================================== // 구분선입니다.

// Vercel 서버리스 내부 엔드포인트 및 통계 CSV 경로 정의        // 상수 정의 주석입니다.
const INTERNAL_ORG_API_URL = "/api/org"; // 행정안전부 기관코드 조회를 중계하는 서버리스 엔드포인트입니다.
const INTERNAL_DOMAIN_API_URL = "/api/domain"; // KISA WHOIS 인터넷주소 조회를 중계하는 서버리스 엔드포인트입니다.
const INTERNAL_ANALYZE_API_URL = "/api/analyze"; // OpenRouter AI(문맥 및 비전) 서버리스 엔드포인트입니다.
const CSV_VOICE_PHISHING_PATH = "./data/경찰청_보이스피싱 현황.csv"; // 로컬 보이스피싱 통계 CSV 파일 상대 경로입니다. [통합] data 폴더로 옮겼습니다.
const CSV_INFO_THEFT_PATH = "./data/경찰청_정보탈취 연계형 범죄 현황.csv"; // 로컬 정보탈취형 범죄 통계 CSV 파일 상대 경로입니다. [통합] data 폴더로 옮겼습니다.

// [1단계: 대표 단축 URL 도메인 목록] - KISA API 미호출 즉시 위험 판정 // 단축 URL 주석입니다.
const SHORTENER_DOMAINS = [ // 스미싱에 주로 악용되는 대표적인 단축 URL 도메인 목록입니다.
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "v.gd", "ow.ly", "buff.ly", // 글로벌 대표 단축 URL 서비스들입니다.
  "cutt.ly", "rebrand.ly", "shorturl.at", "tiny.cc", "rb.gy", "han.gl", "me2.do", // 국내외 주요 리다이렉션 서비스들입니다.
  "vo.la", "url.kr", "zrr.kr", "buly.kr", "c11.kr", "asq.kr", "gg.gg", "tuney.kr" // 국내 스미싱에 빈번히 쓰이는 단축 링크들입니다.
]; // 단축 도메인 배열 선언을 마칩니다.

// [2단계: 정상 기업·플랫폼 공식 도메인 화이트리스트 (서브도메인 포함)] // 화이트리스트 주석입니다.
const WHITELIST_DOMAINS = [ // KISA API를 부르지 않고 안전(공식 도메인)으로 분류할 화이트리스트 목록입니다.
  "naver.com", "kakao.com", "coupang.com", "cjlogistics.com", "hanjin.com", // 국내 대표 포털 및 택배 물류사 도메인입니다.
  "lotteglogis.com", "ilogen.com", "daangn.com", "kt.com", "lguplus.com", // 물류, 중고거래, 이동통신사 공식 도메인입니다.
  "toss.im", "kakaobank.com", "hyundaicard.com", "samsungcard.com", "shinhancard.com" // 주요 핀테크, 인터넷은행, 신용카드사 도메인입니다.
]; // 화이트리스트 도메인 배열을 마칩니다.

// [3단계: 저가형 고위험 해외 최상위 도메인(TLD) 목록]          // 고위험 TLD 주석입니다.
const HIGH_RISK_TLDS = [ // 스미싱 피싱 사이트 생성에 악용되는 저가형 해외 최상위 도메인 확장자입니다.
  ".xyz", ".top", ".site", ".online", ".club", ".vip", ".icu", ".buzz", ".click", ".link" // 고위험 해외 TLD 10종입니다.
]; // 고위험 TLD 배열을 마칩니다.

// 경찰청 CSV 파싱 실패 또는 브라우저 보안 제약 시 적용할 통계 백업 데이터 // 백업 데이터 주석입니다.
const DEFAULT_POLICE_STATS = { // 공식 통계 기본 데이터 객체입니다.
  voicePhishing: { // 보이스피싱 통계 객체입니다.
    year: "2024", // 가장 최근 공식 통계 연도입니다.
    orgImpersonationCases: "9,519", // 기관사칭형 발생건수입니다.
    orgImpersonationLoss: "5,349", // 기관사칭형 총 피해액(억원)입니다.
    loanFraudCases: "11,320", // 대출사기형 발생건수입니다.
    loanFraudLoss: "3,196" // 대출사기형 총 피해액(억원)입니다.
  }, // 보이스피싱 블록을 닫습니다.
  infoTheft: { // 정보탈취 연계형 범죄 통계 객체입니다.
    year: "2025", // 최근 통계 연도입니다.
    smishingCases: "2,685", // 스미싱 발생건수입니다.
    messengerPhishingCases: "458", // 메신저피싱 발생건수입니다.
    bodycamCases: "163" // 몸캠피싱 발생건수입니다.
  } // 정보탈취 블록을 닫습니다.
}; // 객체 선언을 마칩니다.

// 범죄 수법 사전 (경찰청 통계 기반 주요 유인 키워드 매핑)       // 수법 사전 주석입니다.
const METHOD_PATTERNS = [ // 수법 패턴 목록 배열입니다.
  { // 기관사칭형 수법 유인 패턴 정의 객체입니다.
    category: "기관사칭형 보이스피싱", // 범죄 수법 분류명입니다.
    keywords: ["구속영장", "계좌동결", "자산보호", "안전계좌", "사건번호", "불법자금", "피의자", "개인정보유출"], // 기관명을 제외한 순수 수법 키워드입니다.
    statDesc: "2024년 기준 연간 9,519건 발생 (피해액 5,349억원)" // 경찰청 통계 설명 문구입니다.
  }, // 객체를 닫습니다.
  { // 대출사기형 패턴 정의 객체입니다.
    category: "대출사기형 보이스피싱", // 범죄 수법 분류명입니다.
    keywords: ["저금리", "정부지원", "대환대출", "특별승인", "서민금융", "선입금", "보증보험료", "신용평점", "수수료", "마이너스통장", "한도상향"], // 대출사기 키워드 목록입니다.
    statDesc: "2024년 기준 연간 11,320건 발생 (피해액 3,196억원)" // 통계 설명 문구입니다.
  }, // 객체를 닫습니다.
  { // 스미싱(문자결제사기) 패턴 정의 객체입니다.
    category: "스미싱 (정보탈취 연계형)", // 범죄 수법 분류명입니다.
    keywords: ["모바일청첩장", "부고장", "택배배송", "주소불명", "배송조회", "과태료", "미납금", "해외결제", "인증번호", "보안카드", "악성앱", "원격제어"], // 스미싱 키워드 목록입니다.
    statDesc: "2025년 기준 스미싱 2,685건 발생 (미확인 링크 클릭 시 악성앱 자동 설치)" // 통계 설명 문구입니다.
  }, // 객체를 닫습니다.
  { // 메신저피싱 패턴 정의 객체입니다.
    category: "메신저피싱 (지인사칭)", // 범죄 수법 분류명입니다.
    keywords: ["엄마 나 폰 고장", "아빠 나 폰", "문화상품권", "급하게 송금", "신분증 사진", "편의점 상품권", "폰 수리"], // 메신저피싱 키워드 목록입니다.
    statDesc: "2025년 기준 메신저피싱 458건 발생 (가족·지인 사칭 금전 요구)" // 통계 설명 문구입니다.
  } // 객체를 닫습니다.
]; // 배열 선언을 마칩니다.

// 주요 정부 및 공공기관/금융기관 탐지용 키워드 목록 (최우선 판별 대상) // 기관 탐지 목록 주석입니다.
const KNOWN_ORG_NAMES = [ // 탐지 대상 주요 기관명 목록입니다.
  "서울중앙지검", "대검찰청", "대구지검", "부산지검", "인천지검", "광주지검", "수원지검", // 검찰 기관명입니다.
  "경찰청", "서울경찰청", "사이버수사대", "강남경찰서", "마포경찰서", "경찰서", // 경찰 기관명입니다.
  "금융감독원", "금융위원회", "한국은행", "국세청", "고용노동부", "국민건강보험공단", // 주요 정부기관명입니다.
  "대법원", "지방법원", "우체국", "행정안전부", "관세청", "한국소비자원", // 공공 및 사법기관명입니다.
  "국민은행", "신한은행", "우리은행", "하나은행", "농협", "카카오뱅크", "토스" // 금융기관명입니다.
]; // 배열 선언을 마칩니다.

// 전역 상태 변수 관리                                         // 전역 상태 관리 주석입니다.
let parsedPoliceStats = JSON.parse(JSON.stringify(DEFAULT_POLICE_STATS)); // 동적 파싱된 경찰청 통계 데이터입니다.
let lastScanResults = null; // 가장 최근에 실행된 스캔 결과 객체 저장소입니다.
let currentUploadedImageDataUrl = null; // 현재 업로드된 이미지의 Base64 DataURL 문자열입니다.
let lastVisualAnalysisText = null; // AI 비전 모델이 분석한 이미지 시각적 사기 단서 요약입니다.

// ======================================================== // DOMContentLoaded 초기화 구분선입니다.
// 페이지 로드 시 초기 이벤트 등록                             // 초기화 주석입니다.
// ======================================================== // 구분선입니다.
document.addEventListener("DOMContentLoaded", () => { // DOM 트리가 준비되면 실행되는 메인 콜백입니다.
  initImageUploadAndOcr(); // 이미지 업로드, AI 비전 분석 및 OCR 기능을 활성화합니다.
  initActionButtons(); // 스캔 및 초기화 버튼 리스너를 등록합니다.
  loadPoliceCsvFiles(); // 로컬 경찰청 CSV 파일 비동기 로딩을 시작합니다.
  setupSimulationModalHandlers(); // '만약 눌렀다면?' 시뮬레이션 모달 핸들러를 등록합니다.
  setupGlobalTooltipListeners(); // 화면 이탈 방지 전역 툴팁 이벤트 리스너를 등록합니다.
}); // 이벤트 등록 블록을 닫습니다.

// ======================================================== // 순수 도메인 추출 정제 함수 구분선입니다.
// 1. 순수 도메인(호스트명) 정제 유틸리티                        // 호스트명 추출 주석입니다.
// ======================================================== // 구분선입니다.
function extractPureDomain(rawUrl) { // URL 또는 원문 문자열에서 순수 도메인을 추출하는 함수입니다.
  if (!rawUrl) return ""; // 입력이 없으면 빈 문자열을 반환합니다.
  let clean = String(rawUrl).trim(); // 공백을 제거한 문자열로 변환합니다.
  clean = clean.replace(/^[a-zA-Z]+:\/\//i, ""); // http://, https://, ftp:// 등 프로토콜 스킴을 제거합니다.
  clean = clean.split(/[\/?#]/)[0]; // 하위 경로(/...), 쿼리스트링(?...), 앵커(#...)를 잘라냅니다.
  clean = clean.split(":")[0]; // 포트번호(:8080 등)가 붙어 있는 경우 제거합니다.
  clean = clean.replace(/^\.+|\.+$/g, ""); // 도메인 앞뒤의 마침표를 제거합니다.
  return clean.toLowerCase(); // 소문자로 통일하여 순수 호스트명을 반환합니다.
} // extractPureDomain 함수를 닫습니다.

// ======================================================== // 도메인 유형별 4단계 정밀 판별 엔진 구분선입니다.
// 2. 도메인 유형별 4단계 판별 로직                             // 4단계 판별 주석입니다.
// ======================================================== // 구분선입니다.
async function evaluateDomainFourStages(urlItem) { // 추출된 URL을 4단계 알고리즘으로 판별하는 비동기 함수입니다.
  const pureDomain = extractPureDomain(urlItem); // 순수 호스트명을 추출합니다.
  if (!pureDomain) { // 도메인이 추출되지 않은 예외 경우입니다.
    return { // 에러 판별 객체를 반환합니다.
      stage: 0, // 단계 번호입니다.
      stageName: "형식 오류", // 단계 명칭입니다.
      pureDomain: urlItem, // 원본 단어입니다.
      level: "danger", // 위험 등급입니다.
      isSuspicious: true, // 위험 플래그입니다.
      title: "위험 링크: 비정상 주소 형식", // 툴팁 제목입니다.
      reason: "URL 주소 형식이 올바르지 않거나 도메인을 정상 파싱할 수 없습니다.", // 판별 근거입니다.
      point: "정상적이지 않은 인터넷 주소 형식은 피싱 또는 악성 스크립트 연결 시도일 가능성이 높습니다.", // 위험 요점입니다.
      apiCalled: false // KISA API 호출 여부입니다.
    }; // 객체 반환을 마칩니다.
  } // 조건문을 닫습니다.

  // [1단계: 대표 단축 URL 검사]                                // 1단계 검사 주석입니다.
  const isShortener = SHORTENER_DOMAINS.some(short => pureDomain === short || pureDomain.endsWith("." + short)); // 단축 도메인 일치 여부입니다.
  if (isShortener) { // 단축 URL에 해당하는 경우입니다.
    return { // 1단계 위험 판별 객체를 반환합니다.
      stage: 1, // 1단계 번호입니다.
      stageName: "1단계: 대표 단축 URL 검사", // 단계 명칭입니다.
      pureDomain: pureDomain, // 정제된 단축 도메인입니다.
      level: "danger", // 위험 등급입니다.
      isSuspicious: true, // 위험 플래그입니다.
      title: `위험 링크: 단축 URL 은폐 의심 (${pureDomain})`, // 툴팁 헤더 제목입니다.
      reason: "실제 연결 주소를 은폐하기 위해 단축 URL을 사용했습니다. 공공기관이나 금융사는 안내 문자에 단축 링크를 사용하지 않습니다.", // 요구사항 필수 근거 문구입니다.
      point: "단축 링크(bit.ly 등)는 실제 도착지를 숨기며, 클릭 시 악성 APK 자동 다운로드 또는 피싱 사이트로 연결됩니다.", // 핵심 위험 요점입니다.
      apiCalled: false // KISA API를 호출하지 않고 즉시 분류합니다.
    }; // 객체 반환을 마칩니다.
  } // 1단계 조건문을 닫습니다.

  // [2단계: 정상 기업·플랫폼 화이트리스트 검사 (서브도메인 포함)] // 2단계 검사 주석입니다.
  const isWhitelisted = WHITELIST_DOMAINS.some(white => pureDomain === white || pureDomain.endsWith("." + white)); // 화이트리스트 일치 여부입니다.
  if (isWhitelisted) { // 공식 기업 도메인에 해당하는 경우입니다.
    return { // 2단계 안전 판별 객체를 반환합니다.
      stage: 2, // 2단계 번호입니다.
      stageName: "2단계: 정상 기업·플랫폼 공식 도메인", // 단계 명칭입니다.
      pureDomain: pureDomain, // 정제된 공식 도메인입니다.
      level: "safe", // 안전 등급입니다.
      isSuspicious: false, // 위험하지 않은 공식 도메인 플래그입니다.
      title: `공식 기업 도메인 확인 (${pureDomain})`, // 툴팁 제목입니다.
      reason: `공식 기업 도메인(${pureDomain})으로 확인되나 발신 문맥을 함께 확인하세요.`, // 요구사항 필수 안내 문구입니다.
      point: "공식 기업 도메인으로 확인되나 발신 문맥을 함께 확인하세요.", // 툴팁 요점입니다.
      apiCalled: false // KISA API를 호출하지 않습니다.
    }; // 객체 반환을 마칩니다.
  } // 2단계 조건문을 닫습니다.

  // [3단계: 저가형 해외 TLD 및 미등록 해외 도메인 검사]          // 3단계 검사 주석입니다.
  const isHighRiskTld = HIGH_RISK_TLDS.some(tld => pureDomain.endsWith(tld)); // 고위험 해외 최상위 도메인 검사입니다.
  if (isHighRiskTld) { // 고위험 TLD에 걸린 경우입니다.
    return { // 3단계 고위험 해외 도메인 객체를 반환합니다.
      stage: 3, // 3단계 번호입니다.
      stageName: "3단계: 고위험 해외 TLD", // 단계 명칭입니다.
      pureDomain: pureDomain, // 도메인명입니다.
      level: "danger", // 위험 등급입니다.
      isSuspicious: true, // 위험 플래그입니다.
      title: `위험 링크: 고위험 해외 도메인 (${pureDomain})`, // 툴팁 제목입니다.
      reason: `스미싱에 자주 쓰이는 저가형 해외 최상위 도메인(${pureDomain})입니다.`, // 사유 문구입니다.
      point: "해외 사설 피싱 서버 또는 악성 앱 배포용으로 널리 악용되는 고위험 도메인입니다.", // 요점입니다.
      apiCalled: false // KISA API를 부르지 않습니다.
    }; // 객체를 닫습니다.
  } // 고위험 TLD 조건문을 닫습니다.

  const isDirectIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pureDomain); // 직접 IP 주소 형식인지 확인합니다.
  if (isDirectIp) { // 사설/직접 IP인 경우입니다.
    return { // 직접 IP 위험 객체를 반환합니다.
      stage: 3, // 3단계 번호입니다.
      stageName: "3단계: 사설/직접 IP 주소", // 단계 명칭입니다.
      pureDomain: pureDomain, // IP 주소입니다.
      level: "danger", // 위험 등급입니다.
      isSuspicious: true, // 위험 플래그입니다.
      title: `위험 인터넷 주소: 직접 IP 연결 (${pureDomain})`, // 제목입니다.
      reason: `일반 도메인 이름이 아닌 의심스러운 IP 주소(${pureDomain})로 직접 연결됩니다. 해외 사설 피싱 서버일 확률이 매우 높습니다.`, // 사유입니다.
      point: "공공기관 및 정상 기업은 IP 주소 링크를 문자로 발송하지 않으며, 해외 피싱 서버일 가능성이 극히 높습니다.", // 요점입니다.
      apiCalled: false // KISA API를 호출하지 않습니다.
    }; // 객체를 닫습니다.
  } // 직접 IP 조건문을 닫습니다.

  const isDomesticTld = pureDomain.endsWith(".kr") || pureDomain.endsWith(".한국"); // 국내 공공/등록 도메인 확장자인지 확인합니다.
  if (!isDomesticTld) { // .kr 또는 .한국이 아닌 기타 해외 도메인(.com, .net, .org 등)인 경우입니다.
    return { // 3단계 해외 도메인 의심 객체를 반환합니다.
      stage: 3, // 3단계 번호입니다.
      stageName: "3단계: KISA 미등록 해외 도메인", // 단계 명칭입니다.
      pureDomain: pureDomain, // 해외 도메인명입니다.
      level: "warning", // 의심/주의 등급입니다.
      isSuspicious: true, // 주의가 필요한 의심 플래그입니다.
      title: `의심/주의: KISA 미등록 해외 도메인 (${pureDomain})`, // 제목입니다.
      reason: "국내 공공기관·금융사의 공식 도메인이 아닌 해외 도메인입니다.", // 요구사항 필수 근거 문구입니다.
      point: "국내 공공기관·금융사는 해외 도메인(.com, .net 등)을 공식 대고객 문자 안내에 사용하지 않습니다.", // 요점입니다.
      apiCalled: false // KISA API 호출 대신 즉시 분류합니다.
    }; // 객체를 닫습니다.
  } // 기타 해외 도메인 조건문을 닫습니다.

  // [4단계: 국내 도메인(.kr, .한국) KISA WHOIS API 정밀 조회]   // 4단계 검사 주석입니다.
  const kisaResult = await verifyUrlWithKisaApi(pureDomain); // KISA WHOIS 서버리스 API를 비동기 호출합니다.

  if (kisaResult.status === "api_error" || kisaResult.status === "config_error" || kisaResult.status === "server_error") { // API 자체에서 에러(XML 에러 등)가 발생한 경우입니다.
    return { // API 에러 안내 객체를 반환합니다.
      stage: 4, // 4단계 번호입니다.
      stageName: "4단계: KISA WHOIS 정밀조회 (API 오류)", // 단계 명칭입니다.
      pureDomain: pureDomain, // 도메인명입니다.
      level: "warning", // 주의 등급입니다.
      isSuspicious: true, // 검증 불가로 인한 주의 플래그입니다.
      title: `도메인 조회 오류 (${pureDomain})`, // 제목입니다.
      reason: `KISA WHOIS 조회 중 API 에러 발생 [코드: ${kisaResult.errorCode || "에러"}] - ${kisaResult.errorReason || kisaResult.message}`, // 구체적 에러코드 및 사유 표시입니다.
      point: `공공데이터 API 반환 사유: ${kisaResult.errorReason || kisaResult.message}. 검증 불가로 각별한 주의가 필요합니다.`, // 요점입니다.
      apiCalled: true // API가 호출되었음을 나타냅니다.
    }; // 객체를 닫습니다.
  } // 에러 조건문을 닫습니다.

  if (kisaResult.status === "not_found" || !kisaResult.data) { // 조회 결과가 없거나 미등록 상태인 경우입니다.
    return { // KISA 미등록 위험 객체를 반환합니다.
      stage: 4, // 4단계 번호입니다.
      stageName: "4단계: KISA WHOIS 정밀조회 (미등록)", // 단계 명칭입니다.
      pureDomain: pureDomain, // 도메인명입니다.
      level: "danger", // 위험 등급입니다.
      isSuspicious: true, // 위험 플래그입니다.
      title: `위험 링크: KISA 미등록 도메인 (${pureDomain})`, // 제목입니다.
      reason: `KISA WHOIS 조회 결과 등록 정보가 없는 미등록 도메인(${pureDomain})입니다.`, // 필수 사유입니다.
      point: "국내 공공기관이나 기업은 반드시 KISA에 정식 등록된 도메인을 사용합니다. 미등록 도메인은 피싱용 위장 도메인입니다.", // 요점입니다.
      apiCalled: true // API 호출 플래그입니다.
    }; // 객체를 닫습니다.
  } // 미등록 조건문을 닫습니다.

  const regName = kisaResult.data.regName || "등록인 확인"; // 조회된 등록인 정보입니다.
  const regDate = kisaResult.data.regDate || "등록일 확인"; // 조회된 등록일자 정보입니다.
  return { // 정상 조회 확인 객체를 반환합니다.
    stage: 4, // 4단계 번호입니다.
    stageName: "4단계: KISA WHOIS 정밀조회 (정상 등록)", // 단계 명칭입니다.
    pureDomain: pureDomain, // 도메인명입니다.
    level: "safe", // 안전 등급입니다.
    isSuspicious: false, // 위험하지 않은 플래그입니다.
    title: `정상 등록 도메인 확인 (${pureDomain})`, // 제목입니다.
    reason: `KISA WHOIS 정상 등록 확인: 등록인 [${regName}], 등록일 [${regDate}].`, // 등록일·등록인 정보 포함 근거입니다.
    point: `KISA 공식 등록 정보: 등록인 [${regName}], 등록일 [${regDate}]. 정식 등록 도메인이나 발신 문맥을 함께 확인하세요.`, // 요점입니다.
    apiCalled: true // API 호출 플래그입니다.
  }; // 객체를 닫습니다.
} // evaluateDomainFourStages 함수를 닫습니다.

// ======================================================== // KISA WHOIS 서버리스 통신 헬퍼 구분선입니다.
// KISA WHOIS 서버리스 프록시 (/api/domain) 호출 헬퍼            // 통신 헬퍼 주석입니다.
// ======================================================== // 구분선입니다.
async function verifyUrlWithKisaApi(pureDomain) { // 순수 도메인을 받아 Vercel 프록시로 전송하는 함수입니다.
  const requestUrl = `${INTERNAL_DOMAIN_API_URL}?query=${encodeURIComponent(pureDomain)}`; // Vercel 서버리스 프록시 주소입니다.
  try { // 통신 시도 블록입니다.
    const response = await fetch(requestUrl); // 자체 Vercel API에 요청합니다.
    const data = await response.json().catch(() => null); // JSON 응답을 파싱합니다.
    if (!response.ok || !data) { // 비정상 응답이거나 파싱 실패인 경우입니다.
      return { // 에러 정보 객체를 반환합니다.
        status: "api_error", // API 에러 상태입니다.
        errorCode: data?.errorCode || response.status, // HTTP 상태코드 또는 반환 에러코드입니다.
        errorReason: data?.errorReason || "API 서버 응답 실패", // 반환된 에러 사유입니다.
        message: data?.message || "도메인 조회 인증키 또는 요청값을 확인해주세요" // 안내 메시지입니다.
      }; // 객체를 닫습니다.
    } // 조건문을 닫습니다.
    return data; // 정상 응답 JSON을 반환합니다.
  } catch (error) { // 네트워크 오류 등 예외 발생 시입니다.
    return { // 네트워크 에러 객체를 반환합니다.
      status: "server_error", // 서버 에러 상태입니다.
      errorCode: "NET_ERR", // 네트워크 에러 코드입니다.
      errorReason: error.message, // 상세 예외 메시지입니다.
      message: `통신 오류: ${error.message}` // 메시지입니다.
    }; // 객체를 닫습니다.
  } // try-catch 블록을 닫습니다.
} // verifyUrlWithKisaApi 함수를 닫습니다.

// ======================================================== // 행정안전부 기관코드 서버리스 프록시 호출 구분선입니다.
// 1. 행정안전부 기관코드 서버리스 프록시 (/api/org) 호출         // 서버리스 API 주석입니다.
// ======================================================== // 구분선입니다.
async function verifyOrgWithGovApi(orgName) { // 기관명 검증 비동기 함수입니다.
  const requestUrl = `${INTERNAL_ORG_API_URL}?full_nm=${encodeURIComponent(orgName)}`; // Vercel 서버리스 프록시 주소입니다.
  try { // 비동기 통신 시도 블록입니다.
    const response = await fetch(requestUrl); // 자체 Vercel API에 요청을 보냅니다.
    if (!response.ok) { // HTTP 상태코드가 정상이 아닐 때입니다.
      const err = await response.json().catch(() => null); // 에러 본문을 파싱합니다.
      return { status: "not_found", message: err?.message || "기관 조회 인증키 또는 요청값을 확인해주세요", raw: null }; // 예외 객체를 반환합니다.
    } // 조건문을 닫습니다.
    const result = await response.json(); // 응답 JSON을 파싱합니다.
    if (result.success && Array.isArray(result.data) && result.data.length > 0) { // 등록 기관 확인 시입니다.
      return { status: "verified", message: result.message || `정식 등록 기관명 확인 (${orgName})`, raw: result.data[0] }; // 등록 객체를 반환합니다.
    } else { // 미등록인 경우입니다.
      return { status: "not_found", message: result.message || "조회 결과 없음(미등록 의심 기관)", raw: null }; // 미등록 객체를 반환합니다.
    } // 조건문을 닫습니다.
  } catch (error) { // 네트워크 오류 등 예외 발생 시입니다.
    return { status: "not_found", message: "조회 결과 없음(미등록 의심)", raw: null }; // 안전하게 미등록 처리합니다.
  } // try-catch 블록을 닫습니다.
} // verifyOrgWithGovApi 함수를 닫습니다.

// ======================================================== // OpenRouter AI 서버리스 API 호출 구분선입니다.
// OpenRouter AI 서버리스 프록시 (/api/analyze) 호출 함수      // AI API 주석입니다.
// ======================================================== // 구분선입니다.
async function callOpenRouterAnalyzeApi(textPayload, imagePayload = null) { // 텍스트 및 base64 이미지를 서버리스 AI 엔드포인트로 전송하는 함수입니다.
  if (typeof window !== "undefined" && window.location.protocol === "file:") { // 브라우저에서 file:// 프로토콜로 직접 열었을 때입니다.
    console.warn("⚠️ [file:// 프로토콜 감지] 브라우저 보안 정책상 file:// 환경에서는 로컬 API 서버(/api/analyze)를 직접 호출할 수 없습니다. npm run dev로 서버를 실행해 http://localhost:3000 으로 접속해주세요. (현재는 규칙 기반 분석으로 자동 대체됩니다)"); // 안내 경고를 출력합니다.
    return { success: false, fallbackRequired: true, message: "file:// 프로토콜 환경 (로컬 서버 필요)" }; // 규칙 분석으로 즉시 폴백합니다.
  } // 조건문을 닫습니다.

  try { // 비동기 fetch 시도 블록입니다.
    const response = await fetch(INTERNAL_ANALYZE_API_URL, { // Vercel 내부 /api/analyze 주소로 요청합니다.
      method: "POST", // POST 방식을 사용합니다.
      headers: { "Content-Type": "application/json" }, // JSON 헤더를 설정합니다.
      body: JSON.stringify({ // 텍스트와 이미지를 JSON으로 직렬화합니다.
        text: textPayload || "", // 분석 대상 문자열입니다.
        image: imagePayload || null // base64 이미지 DataURL입니다.
      }) // 바디 구성을 마칩니다.
    }); // fetch 호출을 마칩니다.

    if (!response.ok) { // 서버리스 함수 응답이 정상이 아닌 경우입니다.
      const errData = await response.json().catch(() => ({})); // 에러 JSON 파싱을 시도합니다.
      console.warn("OpenRouter AI 호출 실패:", errData.message || response.statusText); // 경고를 남깁니다.
      return { success: false, fallbackRequired: true, message: errData.message || "AI 분석 실패" }; // 폴백 필요 객체를 반환합니다.
    } // 조건문을 닫습니다.

    const result = await response.json(); // 정상 JSON 응답을 파싱합니다.
    return result; // 결과 객체를 반환합니다.
  } catch (err) { // 네트워크 단절 등 예외 발생 시 포착합니다.
    console.warn("OpenRouter AI 통신 예외 발생 (규칙 기반 분석으로 폴백):", err.message); // 콘솔에 경고를 출력합니다.
    return { success: false, fallbackRequired: true, message: err.message }; // 폴백 지시 객체를 반환합니다.
  } // try-catch 블록을 마칩니다.
} // callOpenRouterAnalyzeApi 함수를 닫습니다.

// ======================================================== // 전역 플로팅 툴팁(화면 이탈 방지 및 유동 크기) 구분선입니다.
// 툴팁 위치 자동 계산 및 화면 이탈 방지 핸들러                  // 툴팁 좌표 보정 주석입니다.
// ======================================================== // 구분선입니다.
function showFloatingTooltip(targetEl) { // 마우스 호버 시 툴팁을 띄우는 함수입니다.
  const tooltipEl = document.getElementById("floatingTooltip"); // 전역 플로팅 툴팁 엘리먼트입니다.
  const headerEl = document.getElementById("floatingTooltipHeader"); // 툴팁 헤더 엘리먼트입니다.
  const bodyEl = document.getElementById("floatingTooltipBody"); // 툴팁 본문 엘리먼트입니다.
  const pointEl = document.getElementById("floatingTooltipPoint"); // 툴팁 요점 엘리먼트입니다.
  if (!tooltipEl || !headerEl || !bodyEl || !pointEl) return; // 필수 요소가 없으면 종료합니다.

  const icon = targetEl.getAttribute("data-icon") || ""; // 속성에서 아이콘을 읽어옵니다.
  const title = targetEl.getAttribute("data-title") || ""; // 제목을 읽어옵니다.
  const desc = targetEl.getAttribute("data-desc") || ""; // 설명을 읽어옵니다.
  const point = targetEl.getAttribute("data-point") || ""; // 핵심 요점을 읽어옵니다.

  headerEl.textContent = `${icon} ${title}`.trim(); // 헤더에 아이콘과 제목을 대입합니다.
  bodyEl.textContent = desc; // 본문에 근거 설명을 대입합니다.
  if (point) { // 핵심 요점이 있는 경우입니다.
    pointEl.textContent = `⚠️ ${point}`; // 경고 아이콘과 함께 요점을 표시합니다.
    pointEl.style.display = "block"; // 요점 영역을 화면에 노출합니다.
  } else { // 요점이 없는 경우입니다.
    pointEl.textContent = ""; // 텍스트를 비웁니다.
    pointEl.style.display = "none"; // 영역을 숨깁니다.
  } // 조건문을 닫습니다.

  tooltipEl.classList.remove("hidden"); // 숨김 클래스를 제거합니다.
  tooltipEl.style.visibility = "hidden"; // 정확한 크기 측정을 위해 잠시 비가시 상태로 둡니다.
  tooltipEl.style.opacity = "0"; // 투명도를 0으로 설정합니다.

  const targetRect = targetEl.getBoundingClientRect(); // 하이라이트된 단어의 뷰포트 좌표를 측정합니다.
  const tooltipRect = tooltipEl.getBoundingClientRect(); // 툴팁 카드의 가로·세로 크기를 측정합니다.
  const viewportWidth = window.innerWidth; // 브라우저 화면 가로 너비입니다.
  const viewportHeight = window.innerHeight; // 브라우저 화면 세로 높이입니다.
  const margin = 10; // 화면 가장자리 최소 안전 여백입니다.
  const gap = 8; // 단어와 말풍선 사이 간격입니다.

  let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2); // 기본적으로 단어 가로 중앙에 맞춥니다.
  if (left + tooltipRect.width > viewportWidth - margin) { // 툴팁이 오른쪽 화면 밖으로 넘치는 경우입니다.
    left = viewportWidth - tooltipRect.width - margin; // 오른쪽 가장자리에 딱 맞게 좌측 좌표를 보정합니다.
  } // 조건문을 닫습니다.
  if (left < margin) { // 툴팁이 왼쪽 화면 밖으로 잘리는 경우입니다.
    left = margin; // 왼쪽 최소 여백 10px 위치로 보정합니다.
  } // 조건문을 닫습니다.

  let top = targetRect.bottom + gap; // 기본적으로 단어 아래쪽에 툴팁을 배치합니다.
  if (top + tooltipRect.height > viewportHeight - margin) { // 툴팁이 아래쪽 화면 바깥으로 나가는 경우입니다.
    if (targetRect.top - gap - tooltipRect.height >= margin) { // 단어 위쪽에 충분한 공간이 있는 경우입니다.
      top = targetRect.top - gap - tooltipRect.height; // 단어 위쪽으로 위치를 자동 반전합니다.
    } else { // 위아래 모두 부족한 경우입니다.
      top = Math.max(margin, viewportHeight - tooltipRect.height - margin); // 화면 하단에 맞춰 잘림을 방지합니다.
    } // 내부 조건문을 닫습니다.
  } // 조건문을 닫습니다.

  tooltipEl.style.left = `${Math.round(left)}px`; // 보정된 좌측 픽셀 좌표를 적용합니다.
  tooltipEl.style.top = `${Math.round(top)}px`; // 보정된 상단 픽셀 좌표를 적용합니다.
  tooltipEl.style.visibility = "visible"; // 툴팁을 화면에 표시합니다.
  tooltipEl.style.opacity = "1"; // 투명도를 1로 올려 부드럽게 보여줍니다.
} // showFloatingTooltip 함수를 닫습니다.

function hideFloatingTooltip() { // 툴팁을 숨기는 전역 함수입니다.
  const tooltipEl = document.getElementById("floatingTooltip"); // 툴팁 엘리먼트입니다.
  if (tooltipEl) { // 툴팁이 존재하는 경우입니다.
    tooltipEl.classList.add("hidden"); // 숨김 클래스를 추가합니다.
    tooltipEl.style.opacity = "0"; // 투명도를 0으로 설정합니다.
  } // 조건문을 닫습니다.
} // hideFloatingTooltip 함수를 닫습니다.

function setupGlobalTooltipListeners() { // 전역 툴팁 이벤트 리스너를 등록하는 함수입니다.
  window.addEventListener("scroll", hideFloatingTooltip, true); // 스크롤 시 툴팁을 즉시 숨깁니다.
  document.addEventListener("click", (e) => { // 문서 전체 클릭 시 동작합니다.
    if (!e.target.closest(".hl") && !e.target.closest("#floatingTooltip")) { // 하이라이트 단어나 툴팁 외부를 클릭하면 숨깁니다.
      hideFloatingTooltip(); // 툴팁을 닫습니다.
    } // 조건문을 닫습니다.
  }); // 클릭 리스너를 닫습니다.
} // setupGlobalTooltipListeners 함수를 닫습니다.

function bindFloatingTooltipEvents(container) { // 하이라이트 단어들에 마우스 및 터치 이벤트를 바인딩하는 함수입니다.
  const hlElements = container.querySelectorAll(".hl"); // 컨테이너 안의 모든 하이라이트 요소를 찾습니다.
  hlElements.forEach(el => { // 각 요소를 순회합니다.
    el.addEventListener("mouseenter", () => showFloatingTooltip(el)); // 마우스가 진입하면 툴팁을 표시합니다.
    el.addEventListener("mouseleave", hideFloatingTooltip); // 마우스가 벗어나면 툴팁을 숨깁니다.
    el.addEventListener("focus", () => showFloatingTooltip(el)); // 키보드 포커스 시 툴팁을 엽니다.
    el.addEventListener("blur", hideFloatingTooltip); // 포커스를 잃으면 툴팁을 닫습니다.
    el.addEventListener("click", (e) => { // 모바일 탭 또는 클릭 시 동작합니다.
      e.stopPropagation(); // 부모로의 이벤트 전파를 차단합니다.
      showFloatingTooltip(el); // 툴팁을 화면에 띄웁니다.
    }); // 클릭 리스너를 닫습니다.
  }); // 반복문을 마칩니다.
} // bindFloatingTooltipEvents 함수를 닫습니다.

// ======================================================== // 이미지 업로드, AI 비전 분석 및 OCR 폴백 엔진 구분선입니다.
// 이미지 드래그앤드롭 및 문자 추출 로직                       // 비전 & OCR 주석입니다.
// ======================================================== // 구분선입니다.
function initImageUploadAndOcr() { // 이미지 업로드 및 분석 초기화 함수입니다.
  const dropZone = document.getElementById("dropZone"); // 드롭 영역 엘리먼트입니다.
  const fileInput = document.getElementById("imageFileInput"); // 숨김 파일 인풋입니다.
  const removeBtn = document.getElementById("removeImageBtn"); // 이미지 삭제 버튼입니다.
  if (!dropZone || !fileInput) return; // 요소가 없으면 종료합니다.

  dropZone.addEventListener("click", (e) => { // 드롭존 클릭 시 파일 탐색기를 엽니다.
    if (e.target.closest("#removeImageBtn")) return; // 이미지 삭제 버튼 클릭 시 파일창 열기를 방지합니다.
    fileInput.click(); // 파일 입력창을 프로그래밍 방식으로 클릭합니다.
  }); // 클릭 리스너를 닫습니다.

  ["dragenter", "dragover"].forEach(eventName => { // 드래그 진입 이벤트들입니다.
    dropZone.addEventListener(eventName, (e) => { // 드래그 중일 때 실행합니다.
      e.preventDefault(); // 기본 브라우저 동작을 중지합니다.
      e.stopPropagation(); // 이벤트 전파를 방지합니다.
      dropZone.classList.add("dragover"); // 시각적 활성화 클래스를 부여합니다.
    }); // 리스너를 닫습니다.
  }); // 순회를 닫습니다.

  ["dragleave", "drop"].forEach(eventName => { // 드래그 이탈 및 드롭 이벤트들입니다.
    dropZone.addEventListener(eventName, (e) => { // 드롭 완료 또는 이탈 시 실행합니다.
      e.preventDefault(); // 기본 동작을 막습니다.
      e.stopPropagation(); // 이벤트 전파를 차단합니다.
      dropZone.classList.remove("dragover"); // 활성화 클래스를 제거합니다.
    }); // 리스너를 닫습니다.
  }); // 순회를 닫습니다.

  dropZone.addEventListener("drop", (e) => { // 파일을 드롭했을 때의 처리기입니다.
    const files = e.dataTransfer.files; // 드롭된 파일 목록을 가져옵니다.
    if (files && files.length > 0) { // 파일이 존재하는 경우입니다.
      handleImageFile(files[0]); // 첫 번째 이미지 파일을 처리합니다.
    } // 조건문을 닫습니다.
  }); // 드롭 리스너를 닫습니다.

  fileInput.addEventListener("change", (e) => { // 파일 선택창에서 파일이 지정된 경우입니다.
    if (e.target.files && e.target.files.length > 0) { // 파일이 정상 선택된 경우입니다.
      handleImageFile(e.target.files[0]); // 선택된 파일을 처리합니다.
    } // 조건문을 닫습니다.
  }); // 변경 리스너를 닫습니다.

  if (removeBtn) { // 삭제 버튼이 존재하는 경우입니다.
    removeBtn.addEventListener("click", (e) => { // 삭제 버튼 클릭 시 실행합니다.
      e.stopPropagation(); // 부모 클릭 이벤트를 막습니다.
      resetImagePreview(); // 미리보기 및 인풋을 초기화합니다.
    }); // 리스너를 닫습니다.
  } // 조건문을 닫습니다.
} // initImageUploadAndOcr 함수를 닫습니다.

function handleImageFile(file) { // 선택된 이미지 파일을 처리하는 함수입니다.
  if (!file.type.startsWith("image/")) { // 이미지 형식이 아닌 경우입니다.
    alert("이미지 파일(JPG, PNG, WEBP 등)만 업로드할 수 있습니다."); // 경고창을 띄웁니다.
    return; // 함수를 빠져나갑니다.
  } // 조건문을 닫습니다.

  const reader = new FileReader(); // 브라우저 파일 리더 객체를 생성합니다.
  reader.onload = (e) => { // 파일 읽기가 완료된 경우입니다.
    const previewImg = document.getElementById("imagePreview"); // 미리보기 img 엘리먼트입니다.
    const previewWrap = document.getElementById("previewWrap"); // 미리보기 래퍼 엘리먼트입니다.
    const dropZoneContent = document.getElementById("dropZoneContent"); // 안내 텍스트 영역입니다.
    if (previewImg && previewWrap && dropZoneContent) { // 모든 UI가 준비된 경우입니다.
      previewImg.src = e.target.result; // 이미지 소스에 DataURL을 대입합니다.
      previewWrap.classList.remove("hidden"); // 미리보기를 화면에 노출합니다.
      dropZoneContent.classList.add("hidden"); // 업로드 안내문을 숨깁니다.
    } // 조건문을 닫습니다.
    currentUploadedImageDataUrl = e.target.result; // 업로드된 base64 이미지 데이터를 전역 보관합니다.
    runImageAnalysisPipeline(e.target.result); // AI 비전 및 Tesseract OCR 파이프라인을 가동합니다.
  }; // 리더 onload 콜백을 닫습니다.
  reader.readAsDataURL(file); // 이미지 파일을 base64 DataURL로 변환합니다.
} // handleImageFile 함수를 닫습니다.

function resetImagePreview() { // 이미지 미리보기를 비우는 초기화 함수입니다.
  const previewImg = document.getElementById("imagePreview"); // 미리보기 이미지입니다.
  const previewWrap = document.getElementById("previewWrap"); // 미리보기 래퍼입니다.
  const dropZoneContent = document.getElementById("dropZoneContent"); // 안내문 래퍼입니다.
  const fileInput = document.getElementById("imageFileInput"); // 숨김 파일 인풋입니다.
  const ocrProgressWrap = document.getElementById("ocrProgressWrap"); // OCR 진행바 래퍼입니다.
  const visualBox = document.getElementById("visualAnalysisContainer"); // 시각 분석 박스입니다.

  if (previewImg) previewImg.src = ""; // 이미지 경로를 비웁니다.
  if (previewWrap) previewWrap.classList.add("hidden"); // 미리보기를 숨깁니다.
  if (dropZoneContent) dropZoneContent.classList.remove("hidden"); // 안내문을 다시 노출합니다.
  if (fileInput) fileInput.value = ""; // 파일 인풋을 초기화합니다.
  if (ocrProgressWrap) ocrProgressWrap.classList.add("hidden"); // 진행바를 숨깁니다.
  if (visualBox) { // 시각 분석 컨테이너가 있으면 비우고 숨깁니다.
    visualBox.innerHTML = ""; // 내용을 비웁니다.
    visualBox.classList.add("hidden"); // 숨깁니다.
  } // 조건문을 닫습니다.
  currentUploadedImageDataUrl = null; // 전역 이미지 변수를 비웁니다.
  lastVisualAnalysisText = null; // 시각 분석 텍스트를 초기화합니다.
} // resetImagePreview 함수를 닫습니다.

// AI Vision 우선 분석 및 Tesseract.js 자동 폴백 파이프라인    // 하이브리드 비전 파이프라인 주석입니다.
async function runImageAnalysisPipeline(imageDataUrl) { // 이미지를 받아 AI와 OCR로 분석하는 비동기 함수입니다.
  const progressWrap = document.getElementById("ocrProgressWrap"); // 진행 래퍼입니다.
  const progressBar = document.getElementById("ocrProgressBar"); // 진행 바입니다.
  const statusText = document.getElementById("ocrStatusText"); // 상태 텍스트입니다.
  const textarea = document.getElementById("messageInput"); // 텍스트 입력창입니다.

  if (progressWrap) progressWrap.classList.remove("hidden"); // 진행 영역을 표시합니다.
  if (progressBar) progressBar.style.width = "20%"; // 프로그레스 바를 20%로 시작합니다.
  if (statusText) statusText.textContent = "🤖 OpenRouter AI 비전 모델로 이미지 및 시각 단서 분석 중... (20%)"; // 상태를 표시합니다.

  let aiSuccess = false; // AI 분석 성공 플래그입니다.

  try { // 1단계: OpenRouter Vision AI 호출 시도 블록입니다.
    const aiResponse = await callOpenRouterAnalyzeApi("", imageDataUrl); // 이미지를 base64로 전달하여 텍스트 및 시각 요소 분석을 요청합니다.

    if (aiResponse && aiResponse.success && aiResponse.data) { // AI 응답이 성공한 경우입니다.
      const extractedText = (aiResponse.data.extracted_text || "").trim(); // 추출된 텍스트를 가져옵니다.
      if (extractedText) { // 텍스트가 정상 추출된 경우입니다.
        aiSuccess = true; // 성공 플래그를 세웁니다.
        if (textarea) textarea.value = extractedText; // 입력창에 자동 기입합니다.
        if (aiResponse.data.visual_analysis) { // 시각적 사기 단서가 있으면 보관합니다.
          lastVisualAnalysisText = aiResponse.data.visual_analysis; // 전역에 저장합니다.
        } // 조건문을 닫습니다.

        if (progressBar) progressBar.style.width = "100%"; // 100%로 게이지를 채웁니다.
        if (statusText) statusText.textContent = "✅ AI 비전 분석 완료! X-ray 스캔을 시작합니다."; // 완료 안내입니다.

        setTimeout(() => { // 400ms 후 진행창을 닫고 정밀 스캔을 가동합니다.
          if (progressWrap) progressWrap.classList.add("hidden"); // 진행창을 닫습니다.
          handleScan(); // X-ray 정밀 스캔을 실행합니다.
        }, 400); // 딜레이를 줍니다.
        return; // 정상 종료합니다.
      } // 조건문을 닫습니다.
    } // 조건문을 닫습니다.
  } catch (aiErr) { // AI 비전 분석 중 에러 발생 시입니다.
    console.warn("AI 비전 분석 실패, Tesseract.js 로컬 OCR로 자동 폴백합니다:", aiErr.message); // 경고를 기록합니다.
  } // try-catch를 닫습니다.

  // 2단계: AI 분석 실패 또는 빈 텍스트 시 기존 Tesseract.js로 자동 폴백 // 폴백 로직 주석입니다.
  if (!aiSuccess) { // AI가 실패했으므로 로컬 Tesseract.js 엔진을 구동합니다.
    if (statusText) statusText.textContent = "⚠️ AI 비전 연결 실패: 로컬 Tesseract.js OCR로 자동 전환 중... (40%)"; // 폴백 전환 안내입니다.
    if (progressBar) progressBar.style.width = "40%"; // 게이지를 40%로 올립니다.
    await runTesseractFallback(imageDataUrl); // Tesseract OCR 함수를 호출합니다.
  } // 조건문을 닫습니다.
} // runImageAnalysisPipeline 함수를 닫습니다.

async function runTesseractFallback(imageDataUrl) { // Tesseract.js 로컬 폴백 비동기 함수입니다.
  const progressWrap = document.getElementById("ocrProgressWrap"); // 진행 래퍼입니다.
  const progressBar = document.getElementById("ocrProgressBar"); // 진행 바입니다.
  const statusText = document.getElementById("ocrStatusText"); // 상태 텍스트입니다.
  const textarea = document.getElementById("messageInput"); // 텍스트 입력창입니다.

  if (typeof Tesseract === "undefined") { // 라이브러리가 로드되지 않은 경우입니다.
    alert("OCR 엔진을 로드할 수 없습니다. 문자 내용을 직접 입력창에 붙여넣어주세요."); // 알림창입니다.
    if (progressWrap) progressWrap.classList.add("hidden"); // 진행창을 숨깁니다.
    return; // 종료합니다.
  } // 조건문을 닫습니다.

  try { // Tesseract 인식 시도 블록입니다.
    const result = await Tesseract.recognize( // Tesseract 인식 함수를 실행합니다.
      imageDataUrl, // 분석 대상 이미지 데이터입니다.
      "kor+eng", // 한국어와 영어를 동시에 판독합니다.
      { // 설정 옵션 객체입니다.
        logger: (m) => { // 진행 상황 콜백 함수입니다.
          if (m.status === "recognizing text" && progressBar && statusText) { // 텍스트 인식 단계일 때입니다.
            const pct = Math.round((m.progress || 0) * 60) + 40; // 40~100% 범위로 계산합니다.
            progressBar.style.width = `${pct}%`; // 게이지를 갱신합니다.
            statusText.textContent = `🔍 Tesseract OCR 문자 분석 중... (${pct}%)`; // 상태를 갱신합니다.
          } // 조건문을 닫습니다.
        } // logger 함수를 닫습니다.
      } // 옵션 객체를 마칩니다.
    ); // recognize 호출을 마칩니다.

    const recognizedText = result?.data?.text ? result.data.text.trim() : ""; // 추출된 텍스트입니다.
    if (!recognizedText) { // 글자가 감지되지 않은 경우입니다.
      alert("이미지에서 문자를 찾지 못했습니다. 선명한 캡처 이미지를 올려주시거나 직접 입력해주세요."); // 알림창입니다.
      if (progressWrap) progressWrap.classList.add("hidden"); // 진행창을 닫습니다.
      return; // 종료합니다.
    } // 조건문을 닫습니다.

    if (textarea) textarea.value = recognizedText; // 추출된 글자를 텍스트에어리어에 기입합니다.
    if (statusText) statusText.textContent = "✅ Tesseract 문자 추출 완료! X-ray 스캔을 시작합니다."; // 완료 안내입니다.
    if (progressBar) progressBar.style.width = "100%"; // 게이지를 100%로 채웁니다.

    setTimeout(() => { // 400ms 후 스캔을 시작합니다.
      if (progressWrap) progressWrap.classList.add("hidden"); // 진행창을 닫습니다.
      handleScan(); // 스캔을 실행합니다.
    }, 400); // 딜레이를 줍니다.
  } catch (err) { // Tesseract 에러 발생 시입니다.
    console.error("Tesseract OCR 오류:", err); // 콘솔에 기록합니다.
    alert("이미지 판독 중 오류가 발생했습니다. 직접 문자 내용을 입력해주세요."); // 오류를 안내합니다.
    if (progressWrap) progressWrap.classList.add("hidden"); // 진행창을 닫습니다.
  } // try-catch 블록을 마칩니다.
} // runTesseractFallback 함수를 닫습니다.

// ======================================================== // 액션 버튼 및 CSV 파싱 구분선입니다.
// 스캔/초기화 버튼 및 경찰청 CSV 통계 로더                      // CSV 파서 주석입니다.
// ======================================================== // 구분선입니다.
function initActionButtons() { // 메인 버튼 이벤트 초기화 함수입니다.
  const scanBtn = document.getElementById("scanButton"); // 스캔 버튼 엘리먼트입니다.
  const resetBtn = document.getElementById("resetButton"); // 리셋 버튼 엘리먼트입니다.
  if (scanBtn) scanBtn.addEventListener("click", handleScan); // 클릭 시 스캔 핸들러를 바인딩합니다.
  if (resetBtn) resetBtn.addEventListener("click", handleReset); // 클릭 시 초기화 핸들러를 바인딩합니다.
} // initActionButtons 함수를 닫습니다.

async function loadPoliceCsvFiles() { // 로컬 CSV 2종을 비동기로 로드하는 함수입니다.
  try { // 파일 요청 시도 블록입니다.
    const resVoice = await fetch(encodeURI(CSV_VOICE_PHISHING_PATH)); // Vercel 리눅스 호스팅 환경에서도 안전하게 URL 인코딩하여 요청합니다.
    if (resVoice.ok) { // 정상 응답 시입니다.
      const textVoice = await resVoice.text(); // 텍스트를 읽어옵니다.
      parseVoicePhishingCsv(textVoice); // 보이스피싱 CSV 파서를 호출합니다.
    } // 조건문을 닫습니다.
  } catch (e) { // 실패 시 백업 통계를 그대로 유지합니다.
    console.warn("보이스피싱 CSV 로드 실패 (기본 통계 사용):", e.message); // 콘솔 경고입니다.
  } // try-catch 블록을 닫습니다.

  try { // 정보탈취 CSV 요청 시도 블록입니다.
    const resInfo = await fetch(encodeURI(CSV_INFO_THEFT_PATH)); // 정보탈취 연계 범죄 CSV를 안전하게 요청합니다.
    if (resInfo.ok) { // 정상 응답 시입니다.
      const textInfo = await resInfo.text(); // 텍스트를 읽어옵니다.
      parseInfoTheftCsv(textInfo); // 정보탈취 CSV 파서를 호출합니다.
    } // 조건문을 닫습니다.
  } catch (e) { // 실패 시 백업 통계를 유지합니다.
    console.warn("정보탈취 범죄 CSV 로드 실패 (기본 통계 사용):", e.message); // 경고를 남깁니다.
  } // try-catch 블록을 닫습니다.
} // loadPoliceCsvFiles 함수를 닫습니다.

function parseVoicePhishingCsv(csvText) { // 보이스피싱 CSV 파싱 함수입니다.
  if (!csvText) return; // 내용이 없으면 종료합니다.
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0); // 빈 행을 제외합니다.
  if (lines.length <= 1) return; // 헤더뿐이면 종료합니다.
  const headers = lines[0].split(",").map(h => h.trim()); // 헤더를 분리합니다.

  for (let i = 1; i < lines.length; i++) { // 각 행을 순회합니다.
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, "")); // 쉼표와 따옴표를 제거합니다.
    if (cols.length < headers.length) continue; // 결측치 행은 건너뜁니다.
    const year = cols[0]; // 연도 컬럼입니다.
    if (year === "2024" || i === lines.length - 1) { // 최신 데이터 행을 찾습니다.
      parsedPoliceStats.voicePhishing = { // 통계 데이터를 갱신합니다.
        year: year, // 연도입니다.
        orgImpersonationCases: Number(cols[1] || 9519).toLocaleString(), // 기관사칭 발생건수입니다.
        orgImpersonationLoss: Number(cols[2] || 5349).toLocaleString(), // 기관사칭 피해액입니다.
        loanFraudCases: Number(cols[3] || 11320).toLocaleString(), // 대출사기 발생건수입니다.
        loanFraudLoss: Number(cols[4] || 3196).toLocaleString() // 대출사기 피해액입니다.
      }; // 객체 대입을 닫습니다.
      break; // 루프를 종료합니다.
    } // 조건문을 닫습니다.
  } // 행 루프를 닫습니다.
} // parseVoicePhishingCsv 함수를 닫습니다.

function parseInfoTheftCsv(csvText) { // 정보탈취 연계형 범죄 CSV 파서입니다.
  if (!csvText) return; // 비어 있으면 종료합니다.
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0); // 빈 행을 제거합니다.
  if (lines.length <= 1) return; // 데이터가 없으면 마칩니다.
  const headers = lines[0].split(",").map(h => h.trim()); // 헤더를 파싱합니다.

  for (let i = 1; i < lines.length; i++) { // 각 행을 순회합니다.
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, "")); // 컬럼을 분리합니다.
    if (cols.length < headers.length) continue; // 누락 행은 계산에서 제외합니다.
    const year = cols[0]; // 연도입니다.
    if (year === "2025" || i === lines.length - 1) { // 최신 연도를 감지합니다.
      parsedPoliceStats.infoTheft = { // 통계를 갱신합니다.
        year: year, // 연도입니다.
        smishingCases: Number(cols[1] || 2685).toLocaleString(), // 스미싱 발생건수입니다.
        messengerPhishingCases: Number(cols[2] || 458).toLocaleString(), // 메신저피싱 발생건수입니다.
        bodycamCases: Number(cols[3] || 163).toLocaleString() // 몸캠피싱 발생건수입니다.
      }; // 객체 대입을 마칩니다.
      break; // 순회를 종료합니다.
    } // 조건문을 닫습니다.
  } // 행 반복문을 닫습니다.
} // parseInfoTheftCsv 함수를 닫습니다.

function loadSample(sampleNumber) { // 상단 빠른 테스트 샘플 로더 함수입니다.
  const textarea = document.getElementById("messageInput"); // 텍스트 입력창입니다.
  if (!textarea) return; // 없으면 리턴합니다.
  resetImagePreview(); // 샘플 선택 시 기존 이미지를 정리합니다.

  if (sampleNumber === 1) { // 1번: 검찰청 사칭 보이스피싱 예시입니다.
    textarea.value = "[서울중앙지검] 금융사기전담부 이현우 검사입니다.\n귀하 명의로 불법 개설된 대포통장이 자금세탁 범죄에 이용되어 피해자 18명이 발생하였습니다.\n본 사건 연루 여부 확인을 위해 법원 구속영장 및 사건번호 발부되었습니다.\n자산보호를 위해 아래 가상 안전계좌로 예치금을 즉시 이전하십시오.\n공문 열람 및 영장 조회: http://192.168.1.105/gov-check"; // 1번 예시를 대입합니다.
  } else if (sampleNumber === 2) { // 2번: 택배 사칭 스미싱 예시입니다.
    textarea.value = "[CJ대한통운] 고객님의 우편물이 주소불명(동·호수 누락)으로 반송 처리되었습니다.\n배송조회 및 배송지 정보 수정 후 재배송 요청을 진행해주세요.\n실시간 배송조회 바로가기: http://bit.ly/cj-parcel-kr\n문의: 우체국 고객센터"; // 2번 예시를 대입합니다.
  } else if (sampleNumber === 3) { // 3번: 서민금융 정부지원 대환대출 사기 예시입니다.
    textarea.value = "[서민금융진흥원] 특별지원 저금리 대환대출 최종 승인 안내\n고객님은 연 3.2% 정부지원 특별대출 대상자로 선정되셨습니다.\n한도상향 및 신용평점 관리를 위한 보증보험료 선입금 수수료 30만원이 발생합니다.\n간편 신청 및 서류 접수: https://gov-loan-apply-portal.com"; // 3번 예시를 대입합니다.
  } // 조건문을 닫습니다.
} // loadSample 함수를 닫습니다.

function handleReset() { // 초기화 핸들러 함수입니다.
  const textarea = document.getElementById("messageInput"); // 텍스트 입력창입니다.
  if (textarea) textarea.value = ""; // 입력된 글자를 지웁니다.
  resetImagePreview(); // 업로드 이미지 미리보기를 지웁니다.
  hideFloatingTooltip(); // 활성화된 플로팅 툴팁을 닫습니다.

  const highlightedContent = document.getElementById("highlightedContent"); // 결과 뷰어입니다.
  if (highlightedContent) { // 결과 뷰어가 있는 경우 기본 대기 상태로 복구합니다.
    highlightedContent.innerHTML = ` <!-- 대기 상태 HTML을 삽입합니다. -->
      <div class="empty-state"> <!-- 대기 래퍼입니다. -->
        <span class="empty-icon">🛡️</span> <!-- 아이콘입니다. -->
        <p>좌측에서 이미지를 업로드하거나 메시지를 입력한 후<br><strong>[X-ray 스캔 시작]</strong> 버튼을 눌러주세요.</p> <!-- 안내문입니다. -->
      </div> <!-- 대기 래퍼를 닫습니다. -->
    `; // 삽입을 마칩니다.
  } // 조건문을 닫습니다.

  const visualBox = document.getElementById("visualAnalysisContainer"); // 시각 분석 컨테이너입니다.
  if (visualBox) { // 시각 분석 박스를 숨깁니다.
    visualBox.innerHTML = ""; // 비웁니다.
    visualBox.classList.add("hidden"); // 숨김 처리합니다.
  } // 조건문을 닫습니다.

  const verdictBanner = document.getElementById("verdictBanner"); // 위험도 배너입니다.
  if (verdictBanner) verdictBanner.className = "verdict-banner"; // 기본 클래스로 복원합니다.
  const verdictBadge = document.getElementById("verdictBadge"); // 배지 요소입니다.
  if (verdictBadge) { // 배지가 있을 때입니다.
    verdictBadge.textContent = "⏳ 분석 대기"; // 대기 텍스트입니다.
    verdictBadge.className = "verdict-badge badge-standby"; // 대기 클래스입니다.
  } // 조건문을 닫습니다.
  const verdictTitle = document.getElementById("verdictTitle"); // 판정 타이틀입니다.
  if (verdictTitle) verdictTitle.textContent = "메시지 분석 대기 중"; // 타이틀을 복원합니다.
  const verdictSummary = document.getElementById("verdictSummary"); // 요약문입니다.
  if (verdictSummary) verdictSummary.textContent = "스캔을 시작하면 종합 위험도 판정이 여기에 표시됩니다."; // 요약문을 복원합니다.

  const detectedCount = document.getElementById("detectedCount"); // 탐지 개수입니다.
  if (detectedCount) detectedCount.textContent = "0개"; // 0개로 초기화합니다.
  const matchedMethodType = document.getElementById("matchedMethodType"); // 수법 요소입니다.
  if (matchedMethodType) matchedMethodType.textContent = "-"; // 대시로 초기화합니다.
  const policeStatFigure = document.getElementById("policeStatFigure"); // 통계 수치 요소입니다.
  if (policeStatFigure) policeStatFigure.textContent = "-"; // 대시로 초기화합니다.

  const evidenceList = document.getElementById("evidenceList"); // 근거 목록입니다.
  if (evidenceList) { // 근거 목록이 있을 때입니다.
    evidenceList.innerHTML = `<div class="evidence-placeholder">분석이 실행되면 각 위험 요소별 구체적 근거가 표시됩니다.</div>`; // 안내문으로 초기화합니다.
  } // 조건문을 닫습니다.
  lastScanResults = null; // 최근 스캔 결과를 초기화합니다.
} // handleReset 함수를 닫습니다.

// ======================================================== // 스캔 메인 실행 핸들러 및 하이브리드 엔진 구분선입니다.
// 스캔 메인 실행 핸들러                                         // 스캔 실행 주석입니다.
// ======================================================== // 구분선입니다.
async function handleScan() { // 스캔 버튼 클릭 시 동작하는 비동기 함수입니다.
  hideFloatingTooltip(); // 기존 툴팁을 닫습니다.
  const textarea = document.getElementById("messageInput"); // 메시지 입력창입니다.
  const rawText = textarea ? textarea.value.trim() : ""; // 공백을 제거한 텍스트입니다.
  if (!rawText && !currentUploadedImageDataUrl) { // 내용과 이미지가 모두 없는 경우입니다.
    alert("분석할 의심 메시지 내용을 입력하거나 이미지를 업로드해주세요."); // 알림을 띄웁니다.
    if (textarea) textarea.focus(); // 입력창에 포커스를 줍니다.
    return; // 함수를 마칩니다.
  } // 조건문을 닫습니다.

  const scanButton = document.getElementById("scanButton"); // 스캔 버튼입니다.
  if (scanButton) { // 버튼이 있을 때입니다.
    scanButton.disabled = true; // 비활성화합니다.
    scanButton.textContent = "⏳ AI 문맥 & 공공데이터 교차 분석 중..."; // 안내 텍스트입니다.
  } // 조건문을 닫습니다.

  try { // 분석 시도 블록입니다.
    const scanResults = await analyzeMessageHybrid(rawText, currentUploadedImageDataUrl); // 하이브리드 정밀 분석을 실행합니다.
    lastScanResults = scanResults; // 시뮬레이션 모달에서 활용할 수 있게 전역에 보관합니다.
    renderResults(rawText, scanResults); // 3단 레이아웃에 결과를 반영합니다.
  } catch (error) { // 오류 발생 시입니다.
    console.error("분석 중 오류 발생:", error); // 콘솔에 에러를 기록합니다.
    alert("분석 도중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."); // 알림을 줍니다.
  } finally { // 무조건 실행되는 마무리입니다.
    if (scanButton) { // 스캔 버튼 상태를 복원합니다.
      scanButton.disabled = false; // 버튼을 다시 활성화합니다.
      scanButton.textContent = "⚡ X-ray 스캔 시작"; // 원래 텍스트로 복귀합니다.
    } // 조건문을 닫습니다.
  } // try-finally 블록을 닫습니다.
} // handleScan 함수를 닫습니다.

// ========================================================================================= //
// 하이브리드 메시지 정밀 분석 엔진 (OpenRouter AI + 공공데이터 API + 경찰청 통계 교차 대조) // 핵심 엔진 주석입니다.
// ========================================================================================= //
async function analyzeMessageHybrid(text, imageBase64 = null) { // 텍스트와 이미지를 하이브리드로 정밀 분석하는 핵심 비동기 함수입니다.
  const detectedYellow = []; // 노랑(사칭 기관 - 최우선) 배열입니다.
  const detectedRed = []; // 빨강(위험 링크) 배열입니다.
  const detectedSafeLinks = []; // 초록(정상 확인된 공식 링크) 배열입니다.
  const detectedPurple = []; // 보라(수법 패턴) 배열입니다.

  // 1. OpenRouter AI 문맥 분석 API 비동기 호출 (실패 시 규칙 기반으로 자동 계속 진행) // AI 호출 주석입니다.
  let aiData = null; // AI 분석 데이터를 보관할 변수입니다.
  try { // AI 호출 시도 블록입니다.
    const aiResponse = await callOpenRouterAnalyzeApi(text, imageBase64); // /api/analyze 서버리스 함수를 호출합니다.
    if (aiResponse && aiResponse.success && aiResponse.data) { // AI 응답이 성공적인 경우입니다.
      aiData = aiResponse.data; // AI 데이터 객체를 할당합니다.
      if (aiData.visual_analysis) { // 시각적 분석이 있으면 보관합니다.
        lastVisualAnalysisText = aiData.visual_analysis; // 전역에 업데이트합니다.
      } // 조건문을 닫습니다.
    } // 조건문을 닫습니다.
  } catch (e) { // AI 호출 중 예외 발생 시입니다.
    console.warn("AI 문맥 분석 실패, 규칙 기반 분석을 지속합니다:", e.message); // 콘솔에 경고를 출력합니다.
  } // try-catch 블록을 마칩니다.

  // AI가 추출한 카테고리별 아이템 분리                       // AI 아이템 분리 주석입니다.
  const aiOrgItems = (aiData?.items || []).filter(it => it.category === "org" && text.includes(it.target_text)); // 사칭 기관 의심 아이템입니다.
  const aiLinkItems = (aiData?.items || []).filter(it => it.category === "link" && text.includes(it.target_text)); // 위험 링크 의심 아이템입니다.
  const aiPatternItems = (aiData?.items || []).filter(it => it.category === "pattern" && text.includes(it.target_text)); // 수법 패턴 의심 아이템입니다.

  // -------------------------------------------------------------------------------- //
  // 1. [최우선 검사] 사칭 기관 탐지 및 행안부 API 교차 대조 (노랑/주황 최우선 하이라이트) // 기관 교차 검증 주석입니다.
  // -------------------------------------------------------------------------------- //
  const candidateOrgs = new Set(KNOWN_ORG_NAMES); // 기본 알려진 주요 공공/금융 기관 목록입니다.
  aiOrgItems.forEach(item => { // AI가 문맥상 찾아낸 사칭 의심 기관명을 추가합니다.
    if (item.target_text && item.target_text.length >= 2) { // 2글자 이상 유효 기관명인 경우입니다.
      candidateOrgs.add(item.target_text); // 검증 후보에 등록합니다.
    } // 조건문을 닫습니다.
  }); // 순회를 마칩니다.

  const foundOrgs = []; // 메시지 원문에 실제로 등장하는 기관명 목록입니다.
  const agencyIntervals = []; // 기관명으로 검출된 원문 내 정확한 구간 [start, end] 배열입니다.

  for (const org of candidateOrgs) { // 후보 기관명 목록을 순회합니다.
    let searchStart = 0; // 검색 시작 위치입니다.
    let matchedInText = false; // 일치 여부 플래그입니다.

    while (searchStart < text.length) { // 텍스트 끝까지 검색합니다.
      const idx = text.indexOf(org, searchStart); // 기관명이 등장하는 인덱스를 찾습니다.
      if (idx === -1) break; // 더 이상 없으면 루프를 종료합니다.
      matchedInText = true; // 일치 플래그를 세웁니다.
      agencyIntervals.push({ start: idx, end: idx + org.length, term: org }); // 기관 구간을 기록합니다.
      searchStart = idx + 1; // 다음 검색 인덱스로 전진합니다.
    } // while 루프를 마칩니다.

    if (matchedInText && !foundOrgs.includes(org)) { // 원문에 존재하고 중복이 아니면 등록합니다.
      foundOrgs.push(org); // 목록에 추가합니다.
    } // 조건문을 닫습니다.
  } // 기관 순회를 마칩니다.

  for (const org of foundOrgs) { // 발견된 기관별로 행정안전부 기관코드 API 조회를 수행합니다.
    const apiResult = await verifyOrgWithGovApi(org); // 행안부 기관코드 조회를 호출합니다.
    const aiMatchedItem = aiOrgItems.find(it => it.target_text === org); // AI가 판별한 문맥 근거가 있는지 확인합니다.
    const aiReasonPart = aiMatchedItem ? ` [AI 문맥 분석: ${aiMatchedItem.reason}]` : ""; // AI 근거 문구입니다.

    detectedYellow.push({ // 노랑 탐지 목록에 상세 데이터를 저장합니다.
      term: org, // 기관명 단어입니다.
      type: "agency", // 유형 식별자입니다.
      apiResult: apiResult, // 행안부 API 결과입니다.
      tooltipTitle: `기관 사칭 의심: ${org}`, // 툴팁 헤더 제목입니다.
      tooltipDesc: `행정안전부 기관코드 대조 결과: ${apiResult.message}.${aiReasonPart}`, // 툴팁 본문 설명입니다.
      tooltipPoint: `검찰청, 경찰청, 법원, 금융감독원은 어떠한 경우에도 공문이나 구속영장을 문자·카카오톡으로 송달하지 않습니다.`, // 툴팁 핵심 위험 지점입니다.
      reason: `행안부 기관코드 대조: ${apiResult.message}.${aiReasonPart} 공공·수사기관을 사칭하여 피해자에게 심리적 공포를 조성하는 수법입니다.` // 요약 근거입니다.
    }); // 객체 삽입을 닫습니다.
  } // 반복문을 닫습니다.

  // -------------------------------------------------------------------------------- //
  // 2. 위험 링크/도메인 4단계 정밀 판별 및 KISA API 교차 검증 (빨강/초록)            // 링크 정밀 판별 주석입니다.
  // -------------------------------------------------------------------------------- //
  const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(?:\/[^\s]*)?)/gi; // URL 정규식입니다.
  const matches = text.match(urlRegex) || []; // 매칭된 모든 링크를 찾습니다.
  const candidateUrls = new Set(matches); // 중복 링크를 방지하는 Set 객체입니다.

  aiLinkItems.forEach(item => { // AI가 추출한 링크/도메인도 후보에 추가합니다.
    if (item.target_text) candidateUrls.add(item.target_text); // Set에 넣습니다.
  }); // 순회를 마칩니다.

  for (const urlItem of candidateUrls) { // 고유 링크들을 순회합니다.
    if (!text.includes(urlItem)) continue; // 원문에 실제 없는 문자열은 제외합니다.
    const domainAnalysis = await evaluateDomainFourStages(urlItem); // 도메인 4단계 판별 엔진을 실행합니다.
    const aiMatchedLink = aiLinkItems.find(it => it.target_text === urlItem); // AI 매칭 항목을 찾습니다.
    const aiReasonPart = aiMatchedLink ? ` [AI 분석 근거: ${aiMatchedLink.reason}]` : ""; // AI 사유 문구입니다.

    if (domainAnalysis.isSuspicious) { // 위험 또는 주의로 분류된 도메인인 경우입니다.
      detectedRed.push({ // 빨강 탐지 목록에 넣습니다.
        term: urlItem, // 원문 URL 단어입니다.
        pureDomain: domainAnalysis.pureDomain, // 추출된 순수 도메인입니다.
        type: "link", // 링크 식별자입니다.
        stage: domainAnalysis.stage, // 판별 단계 번호입니다.
        stageName: domainAnalysis.stageName, // 단계 명칭입니다.
        level: domainAnalysis.level, // 위험 수준입니다.
        isSuspicious: true, // 위험 플래그입니다.
        tooltipTitle: domainAnalysis.title, // 툴팁 제목입니다.
        tooltipDesc: `[${domainAnalysis.stageName}] ${domainAnalysis.reason}${aiReasonPart}`, // 툴팁 본문입니다.
        tooltipPoint: domainAnalysis.point, // 공식 도메인 차이점 및 핵심 위험 요점입니다.
        reason: `[${domainAnalysis.stageName}] ${domainAnalysis.reason}${aiReasonPart}` // 요약 리포트 근거입니다.
      }); // 객체 삽입을 닫습니다.
    } else { // 2단계 화이트리스트 또는 4단계 KISA 정식 등록 도메인인 경우입니다.
      detectedSafeLinks.push({ // 정상 링크 목록에 넣습니다.
        term: urlItem, // 원문 URL 단어입니다.
        pureDomain: domainAnalysis.pureDomain, // 순수 도메인입니다.
        type: "safe_link", // 안전 링크 식별자입니다.
        stage: domainAnalysis.stage, // 단계 번호입니다.
        stageName: domainAnalysis.stageName, // 단계 명칭입니다.
        level: "safe", // 안전 등급입니다.
        isSuspicious: false, // 비위험 플래그입니다.
        tooltipTitle: domainAnalysis.title, // 툴팁 제목입니다.
        tooltipDesc: `[${domainAnalysis.stageName}] ${domainAnalysis.reason}${aiReasonPart}`, // 툴팁 본문입니다.
        tooltipPoint: domainAnalysis.point, // 요점 안내입니다.
        reason: `[${domainAnalysis.stageName}] ${domainAnalysis.reason}${aiReasonPart}` // 요약 리포트 근거입니다.
      }); // 객체 삽입을 닫습니다.
    } // 분기문을 마칩니다.
  } // URL 순회 반복문을 닫습니다.

  // -------------------------------------------------------------------------------- //
  // 3. 범죄 수법 패턴 검사 (경찰청 통계 매칭 + AI 패턴, 사칭 기관과 겹치면 중복 제외) // 수법 패턴 주석입니다.
  // -------------------------------------------------------------------------------- //
  let matchedMethod = null; // 최다 매칭 수법입니다.
  let maxKeywordMatchCount = 0; // 최다 매칭 수입니다.

  for (const method of METHOD_PATTERNS) { // 범죄 수법들을 순회합니다.
    let currentMethodHits = 0; // 유효 매칭 횟수입니다.
    for (const kw of method.keywords) { // 키워드들을 순회합니다.
      let kwStart = 0; // 키워드 검색 시작 인덱스입니다.
      let hasValidNonOverlappingOccurrence = false; // 사칭 기관과 겹치지 않는 유효 출현 여부입니다.

      while (kwStart < text.length) { // 텍스트 전체에서 키워드 위치를 확인합니다.
        const idx = text.indexOf(kw, kwStart); // 키워드 시작 인덱스를 찾습니다.
        if (idx === -1) break; // 더 이상 없으면 루프를 종료합니다.
        const kwEnd = idx + kw.length; // 키워드 종료 인덱스입니다.

        // 요구사항 엄격 준수: 이미 '사칭 기관'으로 하이라이트된 구간과 겹치는지 검사합니다. // 중복 제외 주석입니다.
        const overlapsWithAgency = agencyIntervals.some(agency => !(kwEnd <= agency.start || idx >= agency.end)); // 겹침 판정입니다.

        if (!overlapsWithAgency) { // 사칭 기관과 겹치지 않는 순수 수법 키워드인 경우에만 인정합니다.
          hasValidNonOverlappingOccurrence = true; // 유효 출현 플래그를 세웁니다.
        } // 조건문을 닫습니다.
        kwStart = idx + 1; // 다음 위치로 검색 커서를 이동합니다.
      } // while 루프를 닫습니다.

      if (hasValidNonOverlappingOccurrence) { // 사칭 기관과 겹치지 않는 유효 출현이 있는 경우입니다.
        currentMethodHits++; // 카운트를 증가시킵니다.
        if (!detectedPurple.some(item => item.term === kw)) { // 중복 저장을 방지합니다.
          detectedPurple.push({ // 보라 탐지 목록에 추가합니다.
            term: kw, // 단어입니다.
            type: "method", // 유형입니다.
            category: method.category, // 수법 분류입니다.
            statDesc: method.statDesc, // 통계 설명입니다.
            tooltipTitle: `범죄 수법 패턴 일치: ${kw}`, // 툴팁 제목입니다.
            tooltipDesc: `경찰청 범죄 분석 통계 [${method.category}]의 핵심 유인 단어와 일치합니다.`, // 툴팁 본문입니다.
            tooltipPoint: `${method.statDesc}. 긴급한 조치를 요구하며 이성을 마비시키는 전형적 유인 화법입니다.`, // 툴팁 핵심 지점입니다.
            reason: `경찰청 범죄 통계 [${method.category}] 주요 유인 수법 패턴 일치 (${kw})` // 요약 근거입니다.
          }); // 객체 삽입을 닫습니다.
        } // 중복 방지 조건문을 닫습니다.
      } // 유효 출현 조건문을 닫습니다.
    } // 키워드 루프를 닫습니다.

    if (currentMethodHits > maxKeywordMatchCount) { // 최다 매칭 수 갱신입니다.
      maxKeywordMatchCount = currentMethodHits; // 카운트 갱신입니다.
      matchedMethod = method; // 수법 객체 저장입니다.
    } // 조건문을 닫습니다.
  } // 수법 루프를 닫습니다.

  // AI가 추가로 발견한 범죄 수법 패턴(pattern) 아이템 병합           // AI 수법 아이템 병합 주석입니다.
  for (const item of aiPatternItems) { // AI 패턴 목록을 순회합니다.
    const kw = item.target_text; // 키워드입니다.
    if (!kw || kw.length < 2) continue; // 너무 짧은 단어는 제외합니다.

    let kwStart = 0; // 시작 인덱스입니다.
    let hasValidNonOverlappingOccurrence = false; // 겹침 방지 플래그입니다.

    while (kwStart < text.length) { // 텍스트에서 인덱스를 찾습니다.
      const idx = text.indexOf(kw, kwStart); // 위치를 찾습니다.
      if (idx === -1) break; // 없으면 종료합니다.
      const kwEnd = idx + kw.length; // 종료 위치입니다.

      // 사칭 기관 구간과 겹치지 않는지 엄격 검사합니다.
      const overlapsWithAgency = agencyIntervals.some(agency => !(kwEnd <= agency.start || idx >= agency.end)); // 겹침 판정입니다.
      if (!overlapsWithAgency) { // 겹치지 않는 경우입니다.
        hasValidNonOverlappingOccurrence = true; // 인정합니다.
      } // 조건문을 닫습니다.
      kwStart = idx + 1; // 전진합니다.
    } // while 루프를 마칩니다.

    if (hasValidNonOverlappingOccurrence && !detectedPurple.some(it => it.term === kw)) { // 유효하고 중복이 아니면 추가합니다.
      const assignedCategory = matchedMethod?.category || aiData?.ai_verdict?.threat_type || "피싱 유인 수법"; // 카테고리입니다.
      const assignedStat = matchedMethod?.statDesc || "경찰청 및 AI 분석 모델 지정 핵심 피싱 유인 구문"; // 통계 설명입니다.

      detectedPurple.push({ // 보라 배열에 넣습니다.
        term: kw, // 단어입니다.
        type: "method", // 유형입니다.
        category: assignedCategory, // 분류명입니다.
        statDesc: assignedStat, // 설명입니다.
        tooltipTitle: `AI 탐지 위험 수법: ${kw}`, // 제목입니다.
        tooltipDesc: `[AI 문맥 분석] ${item.reason}`, // 설명입니다.
        tooltipPoint: `${assignedStat}. 피해자의 불안감을 자극하거나 조급한 결정을 유도하는 문맥입니다.`, // 요점입니다.
        reason: `[AI 문맥 분석] ${item.reason} (${kw})` // 요약 근거입니다.
      }); // 배열 삽입을 닫습니다.
    } // 조건문을 닫습니다.
  } // 순회를 마칩니다.

  // -------------------------------------------------------------------------------- //
  // 4. 종합 위험도 4단계 판정 (완전위험 / 위험 / 주의 / 안전 - AI 판단과 하이브리드 결합) // 4단계 종합 판정 주석입니다.
  // -------------------------------------------------------------------------------- //
  const hasAgency = detectedYellow.length > 0; // 사칭 기관(미등록/사칭 의심) 탐지 여부입니다.
  const hasDangerLink = detectedRed.length > 0; // 위험 링크(단축/해외/미등록 의심 도메인) 탐지 여부입니다.
  const hasMethod = detectedPurple.length > 0; // 범죄 수법 패턴 탐지 여부입니다.
  const totalDangers = detectedYellow.length + detectedRed.length + detectedPurple.length; // 총 위험 요소 개수입니다.

  let verdictLevel = "safe"; // 기본 '안전' 등급입니다.
  let verdictBadgeText = "🛡️ 안전"; // 배지 텍스트입니다.
  let verdictTitle = "🛡️ 안전 (정상 단계 - 위험 요소 미탐지)"; // 판정 제목입니다.
  let verdictSummary = "사칭 기관, 위험 링크, 범죄 수법 패턴 중 아무것도 탐지되지 않은 안전한 메시지입니다."; // 요약 설명입니다.

  const aiRisk = aiData?.ai_verdict?.risk_level; // AI가 판정한 위험 등급입니다.

  if ((hasAgency && hasDangerLink) || aiRisk === "critical") { // 1) 완전위험: '사칭 기관'과 '위험 링크'가 모두 확인된 경우 또는 AI 최고위험 판정 시입니다.
    verdictLevel = "critical"; // 최고 경고 등급 '완전위험'입니다.
    verdictBadgeText = "🚨 완전위험"; // 배지 문구입니다.
    verdictTitle = "🚨 완전위험 (최고 경고 단계 - 사칭기관 및 위험링크 동시 탐지)"; // 완전위험 제목입니다.
    verdictSummary = aiData?.ai_verdict?.summary || "공공·수사기관 사칭과 피싱 위험 링크가 동시에 확인된 최고 수준의 긴급 위험 상황입니다! 절대 링크를 누르거나 상대방의 지시에 응하지 마세요."; // 요약문입니다.
  } else if (hasAgency || hasDangerLink || aiRisk === "danger") { // 2) 위험: '사칭 기관' 또는 '위험 링크' 둘 중 하나가 확인된 경우 또는 AI 위험 판정 시입니다.
    verdictLevel = "danger"; // 고위험 등급 '위험'입니다.
    verdictBadgeText = "🛑 위험"; // 위험 배지 문구입니다.
    if (hasAgency) { // 사칭 기관만 탐지된 경우입니다.
      verdictTitle = "🛑 위험 (고위험 단계 - 공공·사법기관 사칭 의심)"; // 기관 사칭 위험 제목입니다.
      verdictSummary = aiData?.ai_verdict?.summary || "행정안전부 기관코드 대조 결과 존재하지 않거나 사칭이 강력히 의심되는 공공기관 명칭이 탐지되었습니다. 공공기관은 문자로 공문이나 영장을 보내지 않습니다."; // 요약문입니다.
    } else { // 위험 링크만 탐지된 경우입니다.
      verdictTitle = "🛑 위험 (고위험 단계 - 스미싱 피싱 링크 탐지)"; // 위험 링크 제목입니다.
      verdictSummary = aiData?.ai_verdict?.summary || "주소 은폐 단축 URL 또는 KISA 미등록/고위험 해외 도메인이 탐지되었습니다. 클릭 시 악성코드가 스마트폰에 설치될 위험이 극히 높습니다."; // 요약문입니다.
    } // 분기문을 닫습니다.
  } else if (hasMethod || aiRisk === "warning") { // 3) 주의: 사칭 기관과 위험 링크는 없지만 '범죄 수법 패턴'이 탐지된 경우입니다.
    verdictLevel = "warning"; // 경계 단계 '주의'입니다.
    verdictBadgeText = "⚡ 주의"; // 주의 배지 문구입니다.
    verdictTitle = "⚡ 주의 (경계 단계 - 범죄 유인 수법 패턴 감지)"; // 주의 제목입니다.
    verdictSummary = aiData?.ai_verdict?.summary || "사칭 기관이나 위험 링크는 없으나, 경찰청 공식 통계 및 AI 문맥 분석에 등록된 전형적인 피싱 유인 키워드가 감지되었습니다. 발신 번호의 진위를 공식 대표번호로 확인하세요."; // 주의 요약문입니다.
  } else { // 4) 안전: 사칭 기관, 위험 링크, 범죄 수법 패턴 중 아무것도 탐지되지 않은 경우입니다.
    verdictLevel = "safe"; // 정상 단계 '안전'입니다.
    verdictBadgeText = "🛡️ 안전"; // 안전 배지 문구입니다.
    verdictTitle = "🛡️ 안전 (정상 단계 - 위험 요소 미탐지)"; // 안전 제목입니다.
    verdictSummary = aiData?.ai_verdict?.summary || "사칭 기관, 위험 링크, 범죄 수법 패턴 중 아무것도 탐지되지 않았습니다. 단, 모르는 번호의 금전 요구에는 항상 주의하세요."; // 안전 요약문입니다.
  } // 4단계 분기문을 마칩니다.

  return { // 최종 분석 결과 객체를 반환합니다.
    detectedYellow, // 노랑(사칭 기관) 배열입니다.
    detectedRed, // 빨강(위험 링크) 배열입니다.
    detectedSafeLinks, // 초록(정상 확인 도메인) 배열입니다.
    detectedPurple, // 보라(수법 패턴) 배열입니다.
    totalDangers, // 총 위험 개수입니다.
    matchedMethod: matchedMethod || METHOD_PATTERNS[0], // 최다 매칭 수법입니다.
    verdictLevel, // 종합 위험도 등급(critical/danger/warning/safe)입니다.
    verdictBadgeText, // 4단계 배지 텍스트입니다.
    verdictTitle, // 4단계 판정 타이틀입니다.
    verdictSummary, // 4단계 요약 설명문입니다.
    agencyIntervals, // 사칭 기관 위치 구간 배열입니다.
    aiData, // OpenRouter AI 전체 분석 원본 데이터입니다.
    visualAnalysis: lastVisualAnalysisText // 비전 분석 요약입니다.
  }; // 객체를 닫습니다.
} // analyzeMessageHybrid 함수를 닫습니다.

// ======================================================== // UI 렌더링 및 3단 카드 화면 반영 구분선입니다.
// 분석 결과 렌더링 함수                                        // 렌더러 함수 주석입니다.
// ======================================================== // 구분선입니다.
function renderResults(rawText, results) { // 원문과 분석 결과를 받아 3단 화면에 뿌려주는 함수입니다.
  // 1. 우측 요약 카드: 종합 위험도 4단계 배너 및 테마 반영        // 위험도 배너 렌더링 주석입니다.
  const verdictBanner = document.getElementById("verdictBanner"); // 배너 엘리먼트입니다.
  const verdictBadge = document.getElementById("verdictBadge"); // 뱃지 엘리먼트입니다.
  const verdictTitle = document.getElementById("verdictTitle"); // 제목 엘리먼트입니다.
  const verdictSummary = document.getElementById("verdictSummary"); // 요약 엘리먼트입니다.

  if (verdictBanner) verdictBanner.className = `verdict-banner verdict-${results.verdictLevel}`; // 4단계 테마 클래스를 적용합니다.
  if (verdictBadge) { // 뱃지가 있을 때입니다.
    verdictBadge.textContent = results.verdictBadgeText; // 4단계 배지 텍스트와 이모지를 표기합니다.
    verdictBadge.className = `verdict-badge badge-${results.verdictLevel}`; // 4단계 스타일 클래스를 적용합니다.
  } // 조건문을 닫습니다.
  if (verdictTitle) verdictTitle.textContent = results.verdictTitle; // 4단계 제목과 아이콘을 업데이트합니다.
  if (verdictSummary) verdictSummary.textContent = results.verdictSummary; // 요약을 업데이트합니다.

  // 2. 우측 요약 카드: 미니 통계 3종 반영                        // 통계 렌더링 주석입니다.
  const detectedCountEl = document.getElementById("detectedCount"); // 개수 요소입니다.
  const matchedMethodTypeEl = document.getElementById("matchedMethodType"); // 수법 요소입니다.
  const policeStatFigureEl = document.getElementById("policeStatFigure"); // 경찰청 통계 수치 요소입니다.

  if (detectedCountEl) detectedCountEl.textContent = `${results.totalDangers}개`; // 탐지 개수를 큰 글자로 표기합니다.
  if (matchedMethodTypeEl) { // 매칭 수법을 표기합니다.
    const displayCategory = results.matchedMethod?.category || results.aiData?.ai_verdict?.threat_type || "특이 수법 없음"; // 수법 분류입니다.
    matchedMethodTypeEl.textContent = results.totalDangers > 0 ? displayCategory : "특이 수법 없음"; // 수법명을 대입합니다.
  } // 조건문을 닫습니다.

  if (policeStatFigureEl) { // 경찰청 통계 수치를 구성합니다.
    const category = results.matchedMethod?.category || ""; // 수법 분류명입니다.
    if (category.includes("스미싱")) { // 스미싱 분류일 경우입니다.
      policeStatFigureEl.innerHTML = `최근 발생 <strong>${parsedPoliceStats.infoTheft.smishingCases}</strong>건<br><small>(경찰청 정보탈취 현황)</small>`; // 스미싱 통계를 반영합니다.
    } else if (category.includes("메신저")) { // 메신저피싱일 경우입니다.
      policeStatFigureEl.innerHTML = `최근 발생 <strong>${parsedPoliceStats.infoTheft.messengerPhishingCases}</strong>건<br><small>(경찰청 정보탈취 현황)</small>`; // 메신저피싱 통계를 반영합니다.
    } else if (category.includes("대출사기")) { // 대출사기형일 경우입니다.
      policeStatFigureEl.innerHTML = `발생 <strong>${parsedPoliceStats.voicePhishing.loanFraudCases}</strong>건 / 피해액 <strong>${parsedPoliceStats.voicePhishing.loanFraudLoss}</strong>억원<br><small>(경찰청 보이스피싱 현황)</small>`; // 대출사기 통계를 반영합니다.
    } else { // 기본 기관사칭형일 경우입니다.
      policeStatFigureEl.innerHTML = `발생 <strong>${parsedPoliceStats.voicePhishing.orgImpersonationCases}</strong>건 / 피해액 <strong>${parsedPoliceStats.voicePhishing.orgImpersonationLoss}</strong>억원<br><small>(경찰청 보이스피싱 현황)</small>`; // 기관사칭 통계를 반영합니다.
    } // 분기문을 마칩니다.
  } // 조건문을 닫습니다.

  // 3. 중앙 카드: 사칭기관 최우선 순차 하이라이트 치환 및 툴팁 연계 // 하이라이트 렌더링 주석입니다.
  renderHighlightsWithTooltips(rawText, results); // 비파괴 우선순위 하이라이트 렌더러를 호출합니다.

  // 4. 중앙 카드 하단: AI 시각 분석(Vision) 결과가 있는 경우 표시  // 시각 분석 박스 주석입니다.
  const visualBox = document.getElementById("visualAnalysisContainer"); // 시각 분석 박스 엘리먼트입니다.
  if (visualBox) { // 요소가 존재하는 경우입니다.
    if (results.visualAnalysis) { // AI가 분석한 시각적 사기 단서가 있는 경우입니다.
      visualBox.innerHTML = ` <!-- 시각 분석 안내 박스 HTML입니다. -->
        <div class="visual-analysis-box"> <!-- 박스 스타일입니다. -->
          <div class="visual-analysis-title">👁️ OpenRouter AI 비전 분석 (시각적 피싱 요소)</div> <!-- 제목입니다. -->
          <p>${escapeHtml(results.visualAnalysis)}</p> <!-- 본문 내용입니다. -->
        </div> <!-- 박스를 닫습니다. -->
      `; // HTML 삽입을 마칩니다.
      visualBox.classList.remove("hidden"); // 박스를 화면에 노출합니다.
    } else { // 시각 분석 단서가 없는 경우입니다.
      visualBox.innerHTML = ""; // 내용을 비웁니다.
      visualBox.classList.add("hidden"); // 박스를 숨깁니다.
    } // 조건 분기를 마칩니다.
  } // 조건문을 닫습니다.

  // 5. 우측 요약 카드: 핵심 근거 요약 리포트 반영                // 근거 리포트 렌더링 주석입니다.
  renderEvidenceReport(results); // 근거 리포트 생성 함수를 호출합니다.
} // renderResults 함수를 닫습니다.

// ======================================================== // 사칭기관 최우선 하이라이트 파서 구분선입니다.
// 요구사항: 사칭기관 최우선 및 중복 제외 하이라이트 조립      // 핵심 우선순위 하이라이트 주석입니다.
// ======================================================== // 구분선입니다.
function renderHighlightsWithTooltips(rawText, results) { // 원문과 분석 결과를 인자로 받습니다.
  const container = document.getElementById("highlightedContent"); // 하이라이트 컨테이너입니다.
  if (!container) return; // 없으면 종료합니다.

  // 1. [1순위: 사칭 기관] 구간들을 가장 먼저 수집합니다.         // 1순위 사칭기관 수집 주석입니다.
  const agencyIntervals = []; // 사칭 기관 확정 구간 배열입니다.
  for (const item of results.detectedYellow) { // 사칭 기관 목록을 순회합니다.
    let startIdx = 0; // 검색 시작 위치입니다.
    while (startIdx < rawText.length) { // 텍스트 끝까지 검색합니다.
      const idx = rawText.indexOf(item.term, startIdx); // 단어 인덱스를 찾습니다.
      if (idx === -1) break; // 없으면 종료합니다.
      agencyIntervals.push({ // 기관 구간을 추가합니다.
        start: idx, // 시작 위치입니다.
        end: idx + item.term.length, // 종료 위치입니다.
        priority: 1, // 최우선 순위 번호입니다.
        item: { ...item, color: "yellow", class: "hl-yellow", icon: "🟡" } // 노랑 최우선 매핑입니다.
      }); // 배열에 넣습니다.
      startIdx = idx + 1; // 다음 위치로 이동합니다.
    } // while 루프를 닫습니다.
  } // 순회를 마칩니다.

  // 2. [2순위: 위험 링크 및 정상 링크] 구간들을 수집합니다.     // 2순위 링크 수집 주석입니다.
  const linkIntervals = []; // 링크 구간 배열입니다.
  for (const item of results.detectedRed) { // 위험 링크들을 순회합니다.
    let startIdx = 0; // 시작 인덱스입니다.
    while (startIdx < rawText.length) { // 텍스트 끝까지 검색합니다.
      const idx = rawText.indexOf(item.term, startIdx); // 인덱스를 찾습니다.
      if (idx === -1) break; // 없으면 종료합니다.
      linkIntervals.push({ // 링크 구간을 추가합니다.
        start: idx, // 시작 위치입니다.
        end: idx + item.term.length, // 종료 위치입니다.
        priority: 2, // 2순위 번호입니다.
        item: { ...item, color: "red", class: "hl-red", icon: "🔴" } // 빨강 링크 매핑입니다.
      }); // 배열 삽입을 마칩니다.
      startIdx = idx + 1; // 다음 위치입니다.
    } // while 루프를 닫습니다.
  } // 순회를 마칩니다.

  for (const item of (results.detectedSafeLinks || [])) { // 정상 확인 도메인들을 순회합니다.
    let startIdx = 0; // 시작 인덱스입니다.
    while (startIdx < rawText.length) { // 끝까지 검색합니다.
      const idx = rawText.indexOf(item.term, startIdx); // 인덱스를 찾습니다.
      if (idx === -1) break; // 없으면 종료합니다.
      linkIntervals.push({ // 정상 링크 구간을 추가합니다.
        start: idx, // 시작 위치입니다.
        end: idx + item.term.length, // 종료 위치입니다.
        priority: 2, // 2순위 번호입니다.
        item: { ...item, color: "green", class: "hl-green", icon: "🟢" } // 초록 정상 매핑입니다.
      }); // 배열 삽입을 닫습니다.
      startIdx = idx + 1; // 다음 위치입니다.
    } // while 루프를 닫습니다.
  } // 순회를 마칩니다.

  // 3. [3순위: 범죄 수법 패턴] - 이미 사칭 기관이나 링크와 겹치는 구간은 완전 제외합니다. // 3순위 수법 수집 주석입니다.
  const methodIntervals = []; // 수법 패턴 유효 구간 배열입니다.
  for (const item of results.detectedPurple) { // 수법 키워드들을 순회합니다.
    let startIdx = 0; // 시작 인덱스입니다.
    while (startIdx < rawText.length) { // 끝까지 검색합니다.
      const idx = rawText.indexOf(item.term, startIdx); // 인덱스를 찾습니다.
      if (idx === -1) break; // 없으면 루프를 종료합니다.
      const kwEnd = idx + item.term.length; // 키워드 끝 인덱스입니다.

      // 이미 '사칭 기관'으로 하이라이트된 단어(또는 겹치는 구간)는 수법 패턴에서 완전히 제외합니다. // 겹침 검사 주석입니다.
      const overlapsAgency = agencyIntervals.some(a => !(kwEnd <= a.start || idx >= a.end)); // 사칭기관 중복 여부입니다.
      const overlapsLink = linkIntervals.some(l => !(kwEnd <= l.start || idx >= l.end)); // 링크 중복 여부입니다.

      if (!overlapsAgency && !overlapsLink) { // 사칭기관 및 링크와 겹치지 않는 순수 수법 구간만 등록합니다.
        methodIntervals.push({ // 수법 구간을 추가합니다.
          start: idx, // 시작 인덱스입니다.
          end: kwEnd, // 종료 인덱스입니다.
          priority: 3, // 3순위 번호입니다.
          item: { ...item, color: "purple", class: "hl-purple", icon: "🟣" } // 보라 수법 매핑입니다.
        }); // 삽입을 닫습니다.
      } // 조건문을 닫습니다.
      startIdx = idx + 1; // 다음 검색 위치로 이동합니다.
    } // while 루프를 닫습니다.
  } // 순회를 마칩니다.

  // 4. 우선순위(기관 1순위 > 링크 2순위 > 수법 3순위) 및 시작 위치 순서로 정렬합니다. // 정렬 주석입니다.
  const rawIntervals = [...agencyIntervals, ...linkIntervals, ...methodIntervals]; // 전체 구간을 병합합니다.
  rawIntervals.sort((a, b) => a.start - b.start || a.priority - b.priority || (b.end - b.start) - (a.end - a.start)); // 정렬 기준을 적용합니다.

  // 5. 겹침 방지 정제: 사칭 기관이 최우선으로 온전히 보존되도록 비중첩 정제합니다. // 정제 주석입니다.
  const cleanIntervals = []; // 정제된 구간 목록입니다.
  let currentPos = 0; // 현재 텍스트 처리 커서입니다.

  for (const interval of rawIntervals) { // 정렬된 구간들을 순회합니다.
    let effectiveStart = interval.start; // 시작 위치입니다.
    let effectiveEnd = interval.end; // 종료 위치입니다.

    if (effectiveStart < currentPos) { // 앞선 하이라이트와 겹치는 경우입니다.
      if (effectiveEnd > currentPos && interval.priority < 3) { // 우선순위가 높은 요소만 뒷부분을 허용합니다.
        effectiveStart = currentPos; // 뒷부분부터 하이라이트합니다.
      } else { // 사칭 기관이 이미 점유한 구간이거나 포함된 경우 건너뜁니다.
        continue; // 중복 덮어쓰기 방지를 위해 제외합니다.
      } // 분기문을 닫습니다.
    } // 겹침 조건문을 닫습니다.

    cleanIntervals.push({ // 유효한 구간을 저장합니다.
      start: effectiveStart, // 시작 인덱스입니다.
      end: effectiveEnd, // 종료 인덱스입니다.
      item: interval.item // 항목 데이터입니다.
    }); // 삽입을 닫습니다.
    currentPos = effectiveEnd; // 커서를 전진시킵니다.
  } // 정제 루프를 닫습니다.

  // 6. 공백 없는 매끄러운 인라인 태그로 최종 HTML을 조립합니다. // HTML 조립 주석입니다.
  let finalHtml = ""; // 완성될 HTML 문자열입니다.
  let lastIndex = 0; // 직전 처리 완료 인덱스입니다.

  for (const seg of cleanIntervals) { // 정제된 구간들을 순회합니다.
    if (seg.start > lastIndex) { // 하이라이트 이전 일반 텍스트가 있는 경우입니다.
      finalHtml += escapeHtml(rawText.slice(lastIndex, seg.start)); // 일반 텍스트를 이스케이프하여 이어붙입니다.
    } // 조건문을 닫습니다.

    const tokenText = rawText.slice(seg.start, seg.end); // 하이라이트 대상 글자입니다.
    const escapedToken = escapeHtml(tokenText); // XSS 방지용 이스케이프를 적용합니다.
    const icon = escapeHtml(seg.item.icon || ""); // 아이콘입니다.
    const title = escapeHtml(seg.item.tooltipTitle || ""); // 제목입니다.
    const desc = escapeHtml(seg.item.tooltipDesc || ""); // 본문입니다.
    const point = escapeHtml(seg.item.tooltipPoint || ""); // 요점입니다.

    // 사칭기관(노랑), 위험링크(빨강), 수법패턴(보라) 클래스를 부여해 인라인으로 결합합니다. // 인라인 결합 주석입니다.
    finalHtml += `<span class="hl ${seg.item.class}" data-icon="${icon}" data-title="${title}" data-desc="${desc}" data-point="${point}" tabindex="0">${escapedToken}</span>`; // 태그를 추가합니다.
    lastIndex = seg.end; // 마지막 인덱스를 전진시킵니다.
  } // 구간 루프를 닫습니다.

  if (lastIndex < rawText.length) { // 마지막 하이라이트 뒤 남은 일반 텍스트가 있는 경우입니다.
    finalHtml += escapeHtml(rawText.slice(lastIndex)); // 남은 일반 텍스트를 끝까지 이어붙입니다.
  } // 조건문을 닫습니다.

  container.innerHTML = finalHtml; // 완성된 무결점 하이라이트 HTML 코드를 컨테이너에 반영합니다.
  bindFloatingTooltipEvents(container); // 생성된 모든 하이라이트 요소에 동적 툴팁 이벤트를 연동합니다.
} // renderHighlightsWithTooltips 함수를 닫습니다.

// 우측 요약 카드: 왜 위험한지 핵심 근거 요약 리포트 렌더링      // 근거 리포트 주석입니다.
function renderEvidenceReport(results) { // 결과를 받아 근거 리스트를 조립하는 함수입니다.
  const listEl = document.getElementById("evidenceList"); // 리스트 컨테이너 엘리먼트입니다.
  if (!listEl) return; // 없으면 종료합니다.
  listEl.innerHTML = ""; // 기존 목록을 초기화합니다.

  if (results.totalDangers === 0 && (!results.detectedSafeLinks || results.detectedSafeLinks.length === 0)) { // 위험 및 정상 링크 모두 없는 초기 안전 상태일 때입니다.
    listEl.innerHTML = ` <!-- 안전 안내 아이템입니다. -->
      <div class="evidence-item"> <!-- 아이템 박스입니다. -->
        <div class="evidence-item-title">🟢 특이 위험 요소 미발견</div> <!-- 타이틀입니다. -->
        <div class="evidence-item-desc">행정안전부 기관코드, KISA WHOIS, 경찰청 범죄 수법 데이터 및 OpenRouter AI 문맥 분석 결과 즉각적인 피싱 지표가 감지되지 않았습니다.</div> <!-- 설명입니다. -->
      </div> <!-- 박스를 닫습니다. -->
    `; // HTML 삽입을 마칩니다.
    return; // 함수를 마칩니다.
  } // 조건문을 닫습니다.

  // [최우선 표기] 노랑(기관사칭) 근거 항목 추가                 // 노랑 근거 주석입니다.
  results.detectedYellow.forEach(item => { // 노랑 탐지 목록을 순회합니다.
    const div = document.createElement("div"); // 새 div 엘리먼트를 만듭니다.
    div.className = "evidence-item item-yellow"; // 노랑 스타일 클래스를 부여합니다.
    div.innerHTML = ` <!-- 근거 내용 HTML을 작성합니다. -->
      <div class="evidence-item-title">🟡 [최우선 탐지] 기관 사칭 의심: "${escapeHtml(item.term)}"</div> <!-- 항목 제목입니다. -->
      <div class="evidence-item-desc">${escapeHtml(item.reason)}</div> <!-- 구체적 사유입니다. -->
    `; // 생성을 마칩니다.
    listEl.appendChild(div); // 목록에 추가합니다.
  }); // 순회를 마칩니다.

  // 빨강(위험/주의 링크) 근거 항목 추가                         // 빨강 근거 주석입니다.
  results.detectedRed.forEach(item => { // 빨강 탐지 목록을 순회합니다.
    const div = document.createElement("div"); // 새 div 엘리먼트를 만듭니다.
    div.className = "evidence-item item-red"; // 빨강 스타일 클래스를 부여합니다.
    div.innerHTML = ` <!-- 근거 내용 HTML을 작성합니다. -->
      <div class="evidence-item-title">🔴 ${escapeHtml(item.tooltipTitle)}: "${escapeHtml(item.term)}"</div> <!-- 항목 제목입니다. -->
      <div class="evidence-item-desc">${escapeHtml(item.reason)}</div> <!-- 구체적 사유 및 도메인 판별 결과입니다. -->
    `; // 생성을 마칩니다.
    listEl.appendChild(div); // 목록에 추가합니다.
  }); // 순회를 마칩니다.

  // 초록(공식/정상 확인 도메인) 근거 항목 추가                   // 초록 정상 근거 주석입니다.
  (results.detectedSafeLinks || []).forEach(item => { // 정상 확인 목록을 순회합니다.
    const div = document.createElement("div"); // 새 div 요소를 생성합니다.
    div.className = "evidence-item item-green"; // 초록 스타일 클래스를 부여합니다.
    div.innerHTML = ` <!-- 정상 확인 근거 HTML을 작성합니다. -->
      <div class="evidence-item-title">🟢 ${escapeHtml(item.tooltipTitle)}: "${escapeHtml(item.term)}"</div> <!-- 항목 제목입니다. -->
      <div class="evidence-item-desc">${escapeHtml(item.reason)}</div> <!-- 등록일·등록인 및 안내 문구입니다. -->
    `; // 생성을 마칩니다.
    listEl.appendChild(div); // 목록에 추가합니다.
  }); // 순회를 마칩니다.

  // 보라(범죄수법) 근거 항목 추가                              // 보라 근거 주석입니다.
  results.detectedPurple.forEach(item => { // 보라 탐지 목록을 순회합니다.
    const div = document.createElement("div"); // 새 div 엘리먼트를 생성합니다.
    div.className = "evidence-item item-purple"; // 보라 스타일 클래스를 부여합니다.
    div.innerHTML = ` <!-- 근거 내용 HTML을 작성합니다. -->
      <div class="evidence-item-title">🟣 범죄 수법 패턴 일치: "${escapeHtml(item.term)}" [${escapeHtml(item.category)}]</div> <!-- 항목 제목입니다. -->
      <div class="evidence-item-desc">${escapeHtml(item.reason)} | <em>${escapeHtml(item.statDesc)}</em></div> <!-- 통계 및 사유입니다. -->
    `; // 생성을 마칩니다.
    listEl.appendChild(div); // 목록에 추가합니다.
  }); // 순회를 마칩니다.
} // renderEvidenceReport 함수를 닫습니다.

// ======================================================== // '만약 눌렀다면?' 시뮬레이션 모달 구분선입니다.
// 시뮬레이션 모달 핸들러 및 시나리오 렌더링                   // 모달 핸들러 주석입니다.
// ======================================================== // 구분선입니다.
function setupSimulationModalHandlers() { // 모달 이벤트 설정 함수입니다.
  const simulationBtn = document.getElementById("simulationBtn"); // 시뮬레이션 버튼입니다.
  const modal = document.getElementById("simulationModal"); // 모달 오버레이입니다.
  const closeModalBtn = document.getElementById("closeModalBtn"); // X 닫기 버튼입니다.
  const confirmModalBtn = document.getElementById("confirmModalBtn"); // 확인 완료 버튼입니다.

  if (!simulationBtn || !modal) return; // 요소가 없으면 종료합니다.

  simulationBtn.addEventListener("click", () => { // 시뮬레이션 버튼 클릭 시 모달을 띄웁니다.
    openSimulationModal(); // 시뮬레이션 모달 오픈 함수를 호출합니다.
  }); // 클릭 리스너를 닫습니다.

  if (closeModalBtn) { // X 닫기 버튼이 있을 때입니다.
    closeModalBtn.addEventListener("click", () => { // 클릭 시 모달을 닫습니다.
      modal.classList.add("hidden"); // 숨김 클래스를 추가합니다.
    }); // 리스너를 닫습니다.
  } // 조건문을 닫습니다.

  if (confirmModalBtn) { // 확인 완료 버튼이 있을 때입니다.
    confirmModalBtn.addEventListener("click", () => { // 클릭 시 모달을 닫습니다.
      modal.classList.add("hidden"); // 숨김 클래스를 추가합니다.
    }); // 리스너를 닫습니다.
  } // 조건문을 닫습니다.

  modal.addEventListener("click", (e) => { // 모달 바깥 어두운 배경 클릭 시 닫기입니다.
    if (e.target === modal) { // 배경 자체를 클릭한 경우입니다.
      modal.classList.add("hidden"); // 숨김 클래스를 추가합니다.
    } // 조건문을 닫습니다.
  }); // 리스너를 닫습니다.
} // setupSimulationModalHandlers 함수를 닫습니다.

function openSimulationModal() { // 모달을 띄우는 함수입니다.
  const modal = document.getElementById("simulationModal"); // 모달 오버레이입니다.
  const body = document.getElementById("simulationBody"); // 모달 본문 컨테이너입니다.
  if (!modal || !body) return; // 요소가 없으면 종료합니다.

  // 현재 감지된 수법 유형에 따라 맞춤형 4단계 시나리오를 구성합니다. // 시나리오 분기 주석입니다.
  const methodCat = lastScanResults?.matchedMethod?.category || lastScanResults?.aiData?.ai_verdict?.threat_type || "기관사칭형 보이스피싱"; // 감지된 수법 분류명입니다.
  let stepsHtml = ""; // 단계별 HTML 코드를 담을 변수입니다.

  if (methodCat.includes("스미싱")) { // 스미싱 문자결제사기 시나리오입니다.
    stepsHtml = ` <!-- 스미싱 시나리오를 작성합니다. -->
      <div class="sim-step"> <!-- 1단계입니다. -->
        <div class="sim-step-num">1</div> <!-- 1번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[1단계] 문자 내 미확인 링크(URL) 무심코 클릭</strong> <!-- 제목입니다. -->
          <p>택배 배송 조회, 모바일 부고장, 과태료 고지서 등을 확인하려 링크를 누르는 순간 스마트폰에 가짜 다운로드 페이지가 뜹니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 1단계를 닫습니다. -->
      <div class="sim-step"> <!-- 2단계입니다. -->
        <div class="sim-step-num">2</div> <!-- 2번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[2단계] 가짜 뷰어 또는 배송조회 위장 악성 APK 자동 설치</strong> <!-- 제목입니다. -->
          <p>'앱을 업데이트해야 확인 가능합니다'라는 안내와 함께 원격 제어 악성코드(APK)가 폰에 몰래 깔리고 개인정보 접근 권한을 획득합니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 2단계를 닫습니다. -->
      <div class="sim-step"> <!-- 3단계입니다. -->
        <div class="sim-step-num">3</div> <!-- 3번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[3단계] 은행 인증서 탈취 및 전화 가로채기(콜 파밍) 활성화</strong> <!-- 제목입니다. -->
          <p>스마트폰의 주소록, 신분증 사진, 은행 보안카드 정보가 사기단 서버로 유출되며 피해자가 112나 은행에 거는 전화까지 중간에서 가로챕니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 3단계를 닫습니다. -->
      <div class="sim-step"> <!-- 4단계입니다. -->
        <div class="sim-step-num">4</div> <!-- 4번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[4단계] 소액결제 진행 및 비대면 대출 실행으로 거액 피해 발생</strong> <!-- 제목입니다. -->
          <p>탈취된 인증 정보로 수백만 원 상당의 모바일 소액결제 및 신규 대출이 일사천리로 실행되어 통장 잔고가 순식간에 인출됩니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 4단계를 닫습니다. -->
    `; // 리터럴을 닫습니다.
  } else if (methodCat.includes("대출사기")) { // 대출사기형 시나리오입니다.
    stepsHtml = ` <!-- 대출사기 시나리오를 작성합니다. -->
      <div class="sim-step"> <!-- 1단계입니다. -->
        <div class="sim-step-num">1</div> <!-- 1번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[1단계] '정부지원 저금리 특별대출 승인' 문자에 상담 신청</strong> <!-- 제목입니다. -->
          <p>시중 은행보다 파격적으로 저렴한 금리에 현혹되어 문자에 적힌 가짜 사이트에 접속하거나 상담원 번호로 전화를 겁니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 1단계를 닫습니다. -->
      <div class="sim-step"> <!-- 2단계입니다. -->
        <div class="sim-step-num">2</div> <!-- 2번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[2단계] 서류 접수 명목 가짜 대출 신청 앱 설치 유도</strong> <!-- 제목입니다. -->
          <p>비대면 심사를 위해 필수라며 보내준 링크로 앱을 설치하게 만듭니다. 이 앱은 폰의 모든 통화와 문자를 사기단으로 연결합니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 2단계를 닫습니다. -->
      <div class="sim-step"> <!-- 3단계입니다. -->
        <div class="sim-step-num">3</div> <!-- 3번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[3단계] '보증보험료·기존 대출금 상환' 명목 선입금 요구</strong> <!-- 제목입니다. -->
          <p>'신용 평점 상향 비용' 또는 '기존 대출을 먼저 상환해야 정부 대출이 나간다'며 지정 계좌로 돈을 보낼 것을 집요하게 압박합니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 3단계를 닫습니다. -->
      <div class="sim-step"> <!-- 4단계입니다. -->
        <div class="sim-step-num">4</div> <!-- 4번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[4단계] 수천만 원 송금 직후 사기단 연락 두절 및 잠적</strong> <!-- 제목입니다. -->
          <p>입금이 확인되면 즉시 대포통장 인출책이 돈을 빼내고, 상담원 번호와 가짜 앱 서버는 즉시 폐쇄되어 돌이킬 수 없는 피해를 입습니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 4단계를 닫습니다. -->
    `; // 리터럴을 닫습니다.
  } else { // 기본: 검찰/경찰 기관사칭형 시나리오입니다.
    stepsHtml = ` <!-- 기관사칭 시나리오를 작성합니다. -->
      <div class="sim-step"> <!-- 1단계입니다. -->
        <div class="sim-step-num">1</div> <!-- 1번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[1단계] 사건 연루 및 체포영장 위협으로 극도의 심리적 공포 유발</strong> <!-- 제목입니다. -->
          <p>"당신의 명의로 대포통장이 개설되어 금융사기 피의자로 입건되었습니다. 즉시 협조하지 않으면 구속수사 대상입니다."라며 압박합니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 1단계를 닫습니다. -->
      <div class="sim-step"> <!-- 2단계입니다. -->
        <div class="sim-step-num">2</div> <!-- 2번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[2단계] 가짜 대검찰청 사이트 접속시켜 위조된 구속영장 공문 열람</strong> <!-- 제목입니다. -->
          <p>실제 대검찰청 홈페이지와 똑같이 만든 피싱 사이트 링크를 보내고, 피해자의 이름과 주민번호가 적힌 위조 영장을 보여주며 믿게 만듭니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 2단계를 닫습니다. -->
      <div class="sim-step"> <!-- 3단계입니다. -->
        <div class="sim-step-num">3</div> <!-- 3번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[3단계] '자산 검수' 빙자 국가 안전계좌 송금 유도</strong> <!-- 제목입니다. -->
          <p>"불법 자금 여부를 전산 확인해야 하니 은행 예금을 모두 인출하여 금융감독원 공식 안전계좌로 임시 예치하라"고 속입니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 3단계를 닫습니다. -->
      <div class="sim-step"> <!-- 4단계입니다. -->
        <div class="sim-step-num">4</div> <!-- 4번 번호입니다. -->
        <div class="sim-step-content"> <!-- 내용입니다. -->
          <strong>[4단계] 전 재산 및 비상금 전액 편취 후 즉각 잠적</strong> <!-- 제목입니다. -->
          <p>수사기관과 금융기관은 절대 '안전계좌'로 송금을 요구하지 않습니다. 송금된 돈은 즉시 인출되어 전액 탈취당합니다.</p> <!-- 설명입니다. -->
        </div> <!-- 내용을 닫습니다. -->
      </div> <!-- 4단계를 닫습니다. -->
    `; // 리터럴을 닫습니다.
  } // 조건문 분기를 마칩니다.

  body.innerHTML = stepsHtml; // 조립된 시나리오 HTML 코드를 모달 본문에 삽입합니다.
  modal.classList.remove("hidden"); // 모달 팝업을 화면에 띄웁니다.
} // openSimulationModal 함수를 닫습니다.

// ======================================================== // 공통 문자열 유틸리티 구분선입니다.
// HTML 특수문자 이스케이프 함수                                 // XSS 방지 유틸리티 주석입니다.
// ======================================================== // 구분선입니다.
function escapeHtml(str) { // 문자열을 인자로 받는 이스케이프 함수입니다.
  if (!str) return ""; // 비어 있으면 빈 문자열을 반환합니다.
  return String(str) // 문자열로 강제 변환합니다.
    .replace(/&/g, "&amp;") // & 기호를 변환합니다.
    .replace(/</g, "&lt;") // < 기호를 변환합니다.
    .replace(/>/g, "&gt;") // > 기호를 변환합니다.
    .replace(/"/g, "&quot;") // 큰따옴표를 변환합니다.
    .replace(/'/g, "&#039;"); // 작은따옴표를 변환합니다.
} // escapeHtml 함수를 닫습니다.

// 정규식 특수문자 이스케이프 함수                              // 정규식 유틸리티 주석입니다.
function escapeRegExp(string) { // 정규식 문자열을 인자로 받습니다.
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // 특수문자 앞에 역슬래시를 붙여 안전하게 반환합니다.
} // escapeRegExp 함수를 닫습니다.
