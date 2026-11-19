// ======================================================== // 로컬 개발 서버 스크립트 설정 영역 구분선입니다.
// Vercel 서버리스 함수 및 정적 웹사이트 로컬 에뮬레이션 서버   // 서버 역할 설명 주석입니다.
// ======================================================== // 구분선입니다.

import http from "node:http"; // Node.js 내장 HTTP 서버 모듈을 불러옵니다.
import fs from "node:fs"; // 파일 시스템 접근 모듈을 불러옵니다.
import path from "node:path"; // 파일 및 디렉토리 경로 연산 모듈을 불러옵니다.
import { fileURLToPath } from "node:url"; // ES 모듈 환경에서 현재 파일 경로를 추출하는 유틸리티입니다.

const __filename = fileURLToPath(import.meta.url); // 현재 실행 파일의 절대 경로입니다.
const __dirname = path.dirname(__filename); // 현재 실행 파일이 위치한 프로젝트 루트 디렉토리입니다.

// 1. .env.local 로컬 환경변수 파일 수동 로드                 // 환경변수 로더 주석입니다.
const envPath = path.join(__dirname, ".env.local"); // .env.local 파일의 절대 경로를 만듭니다.
if (fs.existsSync(envPath)) { // .env.local 파일이 존재하는 경우 실행합니다.
  const envContent = fs.readFileSync(envPath, "utf-8"); // 파일 내용을 텍스트로 읽어옵니다.
  envContent.split(/\r?\n/).forEach(line => { // 줄 단위로 분리하여 순회합니다.
    const trimmed = line.trim(); // 공백을 제거합니다.
    if (!trimmed || trimmed.startsWith("#")) return; // 빈 줄이나 주석(#)은 건너뜁니다.
    const eqIdx = trimmed.indexOf("="); // 첫 번째 등호(=) 위치를 찾습니다.
    if (eqIdx !== -1) { // 등호가 존재하는 유효한 환경변수 행인 경우입니다.
      const key = trimmed.substring(0, eqIdx).trim(); // 키 이름을 추출합니다.
      const val = trimmed.substring(eqIdx + 1).trim(); // 키 값을 추출합니다.
      if (!process.env[key]) { // 이미 지정되어 있지 않은 경우에만 환경변수에 등록합니다.
        process.env[key] = val; // process.env에 값을 할당합니다.
      } // 내부 조건문을 닫습니다.
    } // 조건문을 닫습니다.
  }); // 순회를 마칩니다.
  console.log("✅ .env.local 환경변수가 성공적으로 로드되었습니다."); // 로드 성공 콘솔 출력입니다.
} // 환경변수 로딩 블록을 닫습니다.

// 2. MIME 타입 사전 정의                                     // MIME 딕셔너리 주석입니다.
const MIME_TYPES = { // 확장자별 콘텐츠 타입 매핑 객체입니다.
  ".html": "text/html; charset=utf-8", // HTML 문서 MIME 타입입니다.
  ".css": "text/css; charset=utf-8", // CSS 스타일시트 MIME 타입입니다.
  ".js": "application/javascript; charset=utf-8", // JS 스크립트 MIME 타입입니다.
  ".json": "application/json; charset=utf-8", // JSON 데이터 MIME 타입입니다.
  ".csv": "text/csv; charset=utf-8", // CSV 텍스트 MIME 타입입니다.
  ".png": "image/png", // PNG 이미지 MIME 타입입니다.
  ".jpg": "image/jpeg", // JPG 이미지 MIME 타입입니다.
  ".jpeg": "image/jpeg", // JPEG 이미지 MIME 타입입니다.
  ".webp": "image/webp", // WEBP 이미지 MIME 타입입니다.
  ".svg": "image/svg+xml", // SVG 벡터 MIME 타입입니다.
  ".ico": "image/x-icon" // 파비콘 MIME 타입입니다.
}; // 객체 선언을 마칩니다.

// 3. HTTP 서버 생성 및 요청 라우팅                           // 서버 생성 주석입니다.
const server = http.createServer(async (req, res) => { // 비동기 요청 처리기를 등록합니다.
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`); // 요청 URL을 정밀하게 파싱합니다.
  const pathname = decodeURIComponent(parsedUrl.pathname); // 요청 경로를 디코딩합니다.

  // CORS 프리플라이트 요청 처리                               // CORS 처리 주석입니다.
  res.setHeader("Access-Control-Allow-Origin", "*"); // 모든 오리진에서의 요청을 허용합니다.
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); // 허용 메서드를 명시합니다.
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); // 허용 헤더를 명시합니다.

  if (req.method === "OPTIONS") { // 브라우저 사전 요청(OPTIONS)인 경우입니다.
    res.writeHead(204); // 204 No Content로 즉시 응답합니다.
    res.end(); // 응답을 마칩니다.
    return; // 함수를 빠져나갑니다.
  } // 조건문을 닫습니다.

  // 4. Vercel 서버리스 API 라우팅 (/api/*)                    // API 라우팅 주석입니다.
  if (pathname.startsWith("/api/")) { // /api/ 로 시작하는 요청인 경우입니다.
    const apiName = pathname.replace(/^\/api\//, "").replace(/\.js$/, ""); // 파일 식별자를 추출합니다.
    const apiFilePath = path.join(__dirname, "api", `${apiName}.js`); // 실제 api/*.js 파일 경로를 만듭니다.

    if (!fs.existsSync(apiFilePath)) { // 해당 API 핸들러 파일이 존재하지 않는 경우입니다.
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }); // 404 상태코드를 반환합니다.
      res.end(JSON.stringify({ success: false, message: `API 엔드포인트를 찾을 수 없습니다: ${pathname}` })); // 에러 JSON을 전송합니다.
      return; // 종료합니다.
    } // 조건문을 닫습니다.

    // 요청 바디(Body) 비동기 버퍼링 수집                      // 바디 파싱 주석입니다.
    let rawBody = ""; // 본문 원시 텍스트를 담을 변수입니다.
    for await (const chunk of req) { // 요청 스트림 청크를 비동기 순회합니다.
      rawBody += chunk; // 청크를 이어붙입니다.
    } // 순회를 마칩니다.

    let parsedBody = {}; // 파싱된 바디 객체입니다.
    if (rawBody) { // 수신된 본문이 있는 경우입니다.
      try { // JSON 변환을 시도합니다.
        parsedBody = JSON.parse(rawBody); // 바디를 JSON 객체로 파싱합니다.
      } catch (_) { // 실패 시 원시 텍스트를 유지합니다.
        parsedBody = rawBody; // 문자열 형태로 유지합니다.
      } // catch 블록을 닫습니다.
    } // 조건문을 닫습니다.

    // 쿼리 파라미터 파싱                                      // 쿼리 파싱 주석입니다.
    const queryObj = {}; // 쿼리 객체를 선언합니다.
    parsedUrl.searchParams.forEach((val, key) => { // URL 쿼리를 순회합니다.
      queryObj[key] = val; // 객체에 매핑합니다.
    }); // 순회를 마칩니다.

    // Vercel 호환 req/res 래퍼 객체 생성                      // Vercel 에뮬레이션 주석입니다.
    const vercelReq = { // Vercel 요청 객체 모사입니다.
      method: req.method, // HTTP 메서드입니다.
      headers: req.headers, // 요청 헤더입니다.
      query: queryObj, // 파싱된 쿼리스트링입니다.
      body: parsedBody // 파싱된 본문 데이터입니다.
    }; // vercelReq 객체를 닫습니다.

    const vercelRes = { // Vercel 응답 객체 모사입니다.
      statusCode: 200, // 기본 상태코드입니다.
      status(code) { // status() 체이닝 메서드입니다.
        this.statusCode = code; // 상태코드를 지정합니다.
        return this; // 체이닝을 위해 자신을 반환합니다.
      }, // status 메서드를 닫습니다.
      json(data) { // json() 응답 메서드입니다.
        res.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" }); // 헤더를 작성합니다.
        res.end(JSON.stringify(data)); // JSON 직렬화 후 전송합니다.
      }, // json 메서드를 닫습니다.
      send(data) { // send() 메서드입니다.
        res.writeHead(this.statusCode, { "Content-Type": "text/plain; charset=utf-8" }); // 헤더를 작성합니다.
        res.end(String(data)); // 전송합니다.
      } // send 메서드를 닫습니다.
    }; // vercelRes 객체를 닫습니다.

    try { // API 모듈 동적 로드 및 실행 블록입니다.
      const moduleUrl = `file://${apiFilePath}?t=${Date.now()}`; // 캐시 방지 쿼리를 붙여 모듈 URL을 만듭니다.
      const apiModule = await import(moduleUrl); // 핸들러 모듈을 동적 임포트합니다.
      const handler = apiModule.default || apiModule; // default 익스포트를 추출합니다.
      await handler(vercelReq, vercelRes); // 핸들러 함수를 실행합니다.
    } catch (err) { // 핸들러 실행 중 예외 발생 시입니다.
      console.error(`[API 오류] ${pathname}:`, err); // 서버 콘솔에 에러를 기록합니다.
      if (!res.writableEnded) { // 아직 응답이 완료되지 않은 경우입니다.
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" }); // 500 오류 상태를 설정합니다.
        res.end(JSON.stringify({ success: false, message: "서버 내부 처리 오류", error: err.message })); // 오류 JSON을 전송합니다.
      } // 조건문을 닫습니다.
    } // try-catch 블록을 닫습니다.
    return; // API 처리를 종료합니다.
  } // API 라우팅 블록을 닫습니다.

  // 5. 정적 파일 서빙 (index.html, style.css, script.js, csv 등) // 정적 파일 서빙 주석입니다.
  let filePath = pathname === "/" ? path.join(__dirname, "index.html") : path.join(__dirname, pathname); // 실제 파일 경로를 조합합니다.

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { // 파일이 없거나 디렉토리인 경우입니다.
    filePath = path.join(__dirname, "index.html"); // SPA 기본값으로 index.html을 바라보게 합니다.
  } // 조건문을 닫습니다.

  const ext = path.extname(filePath).toLowerCase(); // 파일 확장자를 추출합니다.
  const contentType = MIME_TYPES[ext] || "application/octet-stream"; // MIME 타입을 결정합니다.

  try { // 정적 파일 읽기 및 전송 시도 블록입니다.
    const fileData = fs.readFileSync(filePath); // 파일 데이터를 바이너리로 읽어옵니다.
    res.writeHead(200, { "Content-Type": contentType }); // 적절한 헤더와 함께 200 상태코드를 설정합니다.
    res.end(fileData); // 파일 내용을 클라이언트로 전송합니다.
  } catch (err) { // 파일 읽기 실패 시입니다.
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); // 500 에러 헤더를 작성합니다.
    res.end(`파일 읽기 오류: ${err.message}`); // 오류 내용을 전달합니다.
  } // try-catch를 닫습니다.
}); // createServer 블록을 닫습니다.

// 6. 서버 포트 바인딩 및 구동                                 // 포트 바인딩 주석입니다.
const PORT = Number(process.env.PORT) || 3000; // 사용할 포트 번호입니다.
server.listen(PORT, "0.0.0.0", () => { // 모든 인터페이스에 서버를 오픈합니다.
  console.log(`\n========================================================`); // 구분선 출력입니다.
  console.log(`🚀 스미싱 X-ray 스캐너 로컬 개발 서버가 구동되었습니다!`); // 시작 메시지입니다.
  console.log(`👉 접속 URL: http://localhost:${PORT}`); // 로컬 접속 주소 안내입니다.
  console.log(`👉 네트워크 URL: http://127.0.0.1:${PORT}`); // IP 접속 주소 안내입니다.
  console.log(`👉 지원 API: /api/analyze, /api/org, /api/domain`); // 구동 엔드포인트 안내입니다.
  console.log(`========================================================\n`); // 구분선입니다.
}); // listen 콜백을 마칩니다.

