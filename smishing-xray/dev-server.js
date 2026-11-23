/* =====================================================================
 * dev-server.js — 스미싱 X-ray 통합 개발 서버 (내 컴퓨터 테스트용)
 * ---------------------------------------------------------------------
 * 실행: npm run dev   (또는 node dev-server.js)
 *
 * 하는 일
 *  1) .env.local / .env 파일의 API 키를 환경변수로 불러온다
 *  2) 화면 파일(index.html, dna.html, report.html, css, js, data)을 보여준다
 *  3) /api/이름 요청은 api/이름.js 함수를 실행한다 (Vercel과 같은 방식)
 *  4) 실행하면 브라우저를 자동으로 열어준다
 *
 * 보안
 *  - .env, .env.local 처럼 점(.)으로 시작하는 파일·폴더는 절대 보여주지 않는다 (API 키 보호)
 *  - 내 컴퓨터(127.0.0.1)에서만 접속되게 열어서, 같은 와이파이의 다른 사람은 접속할 수 없다
 *
 * Vercel에 배포할 때는 이 파일을 쓰지 않는다 (Vercel이 같은 역할을 대신 함).
 * ===================================================================== */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const ROOT = __dirname;                              // 프로젝트 폴더
const PORT = Number(process.env.PORT) || 3000;       // 포트 번호 (기본 3000)
const HOST = process.env.HOST || '127.0.0.1';        // 내 컴퓨터에서만 접속 가능
const MAX_BODY = 8 * 1024 * 1024;                    // 요청 최대 크기 8MB (캡처 이미지 포함)

/* =================================================================
 * 1) 환경변수 파일 읽기
 * ================================================================= */

// KEY=VALUE 형식 파일을 읽어 환경변수로 등록 (이미 있는 값은 덮어쓰지 않음)
function loadEnv(fileName) {
  const file = path.join(ROOT, fileName);
  if (!fs.existsSync(file)) return false;
  fs.readFileSync(file, 'utf-8').split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/); // KEY = VALUE (앞뒤 공백 허용)
    if (!m) return;                                            // 빈 줄·주석(#)은 무시
    const value = m[2].replace(/^['"]|['"]$/g, '');            // 앞뒤 따옴표 제거
    if (!value || value.indexOf('여기에_키') !== -1) return;     // 비어 있거나 예시 문구 그대로면 키가 없는 걸로 봄
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  });
  return true;
}

// 팀원 X-ray는 .env.local, 수법 DNA는 .env를 써서 둘 다 읽음 (.env.local이 우선)
const loadedEnvFiles = ['.env.local', '.env'].filter(loadEnv);

/* =================================================================
 * 2) 파일 형식표
 * ================================================================= */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

/* =================================================================
 * 3) Vercel처럼 동작하게 요청·응답 객체에 기능 붙이기
 *    팀원 API는 res.status(200).json({...}), req.query, req.body를 쓰고
 *    수법 DNA API는 res.setHeader / res.end를 써서 둘 다 되게 맞춤
 * ================================================================= */
function addVercelHelpers(req, res, url, body) {
  // 주소 뒤 ?a=1&b=2 → req.query = { a: '1', b: '2' }
  req.query = {};
  url.searchParams.forEach(function (value, key) { req.query[key] = value; });
  req.body = body;

  // res.status(코드) — 상태 코드 지정 후 자기 자신을 돌려줘서 .json()을 이어 쓸 수 있게 함
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  // res.json(객체) — JSON으로 응답
  res.json = function (data) {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  // res.send(글자) — 일반 글자로 응답
  res.send = function (data) {
    if (typeof data === 'object') return res.json(data);
    if (!res.headersSent) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(String(data));
  };
}

// 요청 본문 읽기 (JSON이면 객체로, 아니면 글자 그대로)
function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
    const chunks = [];
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) {                 // 너무 큰 요청은 거절
        reject(new Error('요청이 너무 커요 (최대 8MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); }
    });
    req.on('error', reject);
  });
}

// api·lib 폴더 코드를 고치면 서버를 다시 켜지 않아도 바로 반영되게 캐시 비우기
function clearApiCache() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.startsWith(path.join(ROOT, 'api')) || key.startsWith(path.join(ROOT, 'lib'))) {
      delete require.cache[key];
    }
  });
}

/* =================================================================
 * 4) 서버 본체
 * ================================================================= */
const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');

  // ----- (1) API 요청: /api/이름 → api/이름.js 실행 -----
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/\.js$/, '').replace(/[^a-z0-9-]/gi, ''); // 이상한 글자 제거 (보안)
    const file = path.join(ROOT, 'api', name + '.js');
    if (!name || !fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ success: false, message: 'API를 찾을 수 없어요: ' + url.pathname }));
    }
    try {
      const body = await readBody(req);
      addVercelHelpers(req, res, url, body);
      clearApiCache();
      await require(file)(req, res);
    } catch (err) {
      console.error('[API 오류] ' + url.pathname, err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: '서버 내부 오류: ' + err.message }));
      }
    }
    return;
  }

  // ----- (2) 화면 파일 요청 -----
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }  // 한글 파일 이름(경찰청 CSV 등) 해석
  catch (e) { res.statusCode = 400; return res.end('잘못된 주소'); }
  if (pathname.endsWith('/')) pathname += 'index.html';  // 폴더 주소면 index.html
  const filePath = path.normalize(path.join(ROOT, pathname));

  // 프로젝트 폴더 밖 파일, 점(.)으로 시작하는 파일·폴더(.env, .env.local, .git, .vercel)는 차단
  const relative = path.relative(ROOT, filePath);
  const hidden = relative.split(path.sep).some(function (part) { return part.startsWith('.'); });
  if (relative.startsWith('..') || path.isAbsolute(relative) || hidden) {
    res.statusCode = 403;
    return res.end('접근 금지');
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('파일 없음: ' + pathname);
    }
    res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); // 코드를 고치면 새로고침만으로 바로 반영되게
    res.end(data);
  });
});

// 포트가 이미 사용 중일 때 (예전 서버가 켜져 있을 때) 알아듣기 쉬운 안내
server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ ' + PORT + '번 포트를 이미 다른 서버가 쓰고 있어요.');
    console.error('   예전에 켜둔 터미널에서 Ctrl + C로 서버를 끄고 다시 실행하세요.');
  } else {
    console.error('❌ 서버 실행 실패:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, function () {
  const address = 'http://localhost:' + PORT;
  console.log('');
  console.log('========================================================');
  console.log('🔬 스미싱 X-ray 통합 서버 실행 중: ' + address);
  console.log('   🔍 X-ray 스캔   ' + address + '/');
  console.log('   🧬 수법 DNA     ' + address + '/dna.html');
  console.log('   🚨 신고 패키지  ' + address + '/report.html');
  console.log('========================================================');
  console.log(loadedEnvFiles.length ? '🔑 불러온 설정 파일: ' + loadedEnvFiles.join(', ') : '⚠️ .env 파일이 없어요. (.env.example을 복사해서 만드세요)');

  // 키 상태 표시 (키 값 자체는 절대 출력하지 않음)
  const keys = [
    ['OPENROUTER_API_KEY', 'AI 분석 (X-ray·수법 DNA)'],
    ['KISA_KEY', 'KISA 도메인 조회 (X-ray 링크 검사)'],
    ['MOIS_KEY', '행정안전부 기관 조회 (X-ray 기관 검사)']
  ];
  keys.forEach(function (k) {
    console.log((process.env[k[0]] ? '   ✅ ' : '   ⚠️ 없음 ') + k[0] + ' — ' + k[1]);
  });
  console.log('   (키가 없는 기능은 규칙 기반 분석으로 자동 대체돼요)');
  console.log('끄려면 Ctrl + C');

  // 브라우저 자동 열기 (NO_OPEN=1이면 생략)
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? 'start "" "' + address + '"'   // 윈도우
      : process.platform === 'darwin' ? 'open "' + address + '"'              // 맥
      : 'xdg-open "' + address + '"';                                         // 리눅스
    exec(cmd, function () { /* 브라우저 열기에 실패해도 서버는 계속 동작 */ });
  }
});
