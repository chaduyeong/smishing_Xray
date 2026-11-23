/* =====================================================================
 * integration.test.js — [통합] 합친 뒤에도 서버·API가 제대로 도는지 확인하는 테스트
 * ---------------------------------------------------------------------
 * 1) 팀원 API(analyze·org·domain)가 CommonJS로 바꾼 뒤에도 정상 동작하는지
 * 2) 통합 개발 서버가 세 페이지를 보여주고, API 키 파일은 막는지
 * 진짜 OpenRouter·공공데이터 서버는 부르지 않는다 (가짜 fetch 사용).
 * ===================================================================== */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// Vercel 방식(res.status().json())을 흉내 내는 가짜 응답 객체
function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) { this.body = data; }
  };
}

// 환경변수를 잠깐 바꿨다가 테스트 끝나면 되돌리는 도우미
async function withEnv(vars, fn) {
  const saved = {};
  Object.keys(vars).forEach(function (k) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  });
  try { await fn(); }
  finally {
    Object.keys(saved).forEach(function (k) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
}

/* ----- 1) 팀원 API ----- */

test('X-ray 기관 조회 API: 키가 없으면 500 + 안내 메시지', async function () {
  await withEnv({ MOIS_KEY: undefined }, async function () {
    const res = fakeRes();
    await require('../api/org.js')({ query: { full_nm: '대검찰청' } }, res);
    assert.strictEqual(res.statusCode, 500);
    assert.ok(res.body.message.includes('MOIS_KEY'));
  });
});

test('X-ray 도메인 조회 API: 키가 없으면 config_error', async function () {
  await withEnv({ KISA_KEY: undefined }, async function () {
    const res = fakeRes();
    await require('../api/domain.js')({ query: { query: 'http://test.kr/a' } }, res);
    assert.strictEqual(res.body.status, 'config_error');
  });
});

test('X-ray AI API: 키가 없으면 규칙 분석으로 넘어가라는 표시(fallbackRequired)', async function () {
  await withEnv({ OPENROUTER_API_KEY: undefined }, async function () {
    const res = fakeRes();
    await require('../api/analyze.js')({ method: 'POST', body: { text: '안녕' }, headers: {} }, res);
    assert.strictEqual(res.body.fallbackRequired, true);
  });
});

test('X-ray AI API: 가짜 AI 응답을 정리해서 돌려줌', async function () {
  await withEnv({ OPENROUTER_API_KEY: 'test', OPENROUTER_BASE_URL: 'http://fake.example' }, async function () {
    const originalFetch = global.fetch;
    let calledUrl = '';
    global.fetch = async function (url) {
      calledUrl = url;
      return {
        ok: true,
        json: async function () {
          return { choices: [{ message: { content: '```json\n' + JSON.stringify({
            extracted_text: '[대검찰청] 확인 http://bit.ly/x',
            items: [{ category: 'org', target_text: '대검찰청', reason: '기관 사칭' }, { category: '이상한값', target_text: '확인', reason: 'x' }],
            ai_verdict: { risk_level: 'critical', confidence: 0.9, threat_type: '기관사칭형', summary: '위험' }
          }) + '\n```' } }] };
        }
      };
    };
    try {
      const res = fakeRes();
      await require('../api/analyze.js')({ method: 'POST', body: { text: '[대검찰청] 확인 http://bit.ly/x' }, headers: {} }, res);
      assert.strictEqual(calledUrl, 'http://fake.example/chat/completions'); // 주소 설정이 먹는지
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.items[1].category, 'pattern');       // 이상한 카테고리는 pattern으로 정리
      assert.strictEqual(res.body.data.ai_verdict.risk_level, 'critical');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

/* ----- 2) 통합 개발 서버 ----- */

test('통합 서버: 세 페이지·데이터는 보여주고, 키 파일은 막음', async function () {
  const port = 3900 + Math.floor(Math.random() * 90);
  // 테스트용으로 서버를 따로 켬 (브라우저 자동 열기 끔, 키 없음)
  const server = spawn(process.execPath, ['dev-server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(port), NO_OPEN: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // 서버가 "실행 중" 메시지를 낼 때까지 기다림
  await new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('서버가 5초 안에 안 켜짐')); }, 5000);
    server.stdout.on('data', function (d) {
      if (String(d).includes('실행 중')) { clearTimeout(timer); resolve(); }
    });
  });

  const base = 'http://127.0.0.1:' + port;
  async function get(p) {
    const r = await fetch(base + p);
    return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
  }

  try {
    for (const page of ['/', '/dna.html', '/report.html']) {
      const r = await get(page);
      assert.strictEqual(r.status, 200, page);
      assert.ok(r.text.includes('site-nav'), page + '에 공통 메뉴가 있어야 함');
    }
    const csv = await get('/' + encodeURI('data/경찰청_보이스피싱 현황.csv')); // 한글 파일 이름
    assert.strictEqual(csv.status, 200);
    assert.ok(csv.text.startsWith('연도'));

    assert.strictEqual((await get('/.env')).status, 403);        // 키 파일 차단
    assert.strictEqual((await get('/.env.local')).status, 403);  // 팀원 키 파일 차단
    assert.strictEqual((await get('/.vercel/project.json')).status, 403);

    const api = await get('/api/analyze');                       // GET은 405 (팀원 API가 res.status().json()으로 응답)
    assert.strictEqual(api.status, 405);
    assert.ok(api.type.includes('application/json'));
    assert.strictEqual((await get('/api/없는기능')).status, 404);
  } finally {
    server.kill();
  }
});
