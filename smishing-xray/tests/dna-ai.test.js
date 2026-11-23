/* =====================================================================
 * dna-ai.test.js — AI 분석 로직 + API 자동 테스트
 * 진짜 OpenRouter를 부르지 않고, fetch를 가짜로 바꿔서 테스트한다.
 * (API 키 없이도, 인터넷 없이도 돌릴 수 있음)
 * ===================================================================== */

const test = require('node:test');
const assert = require('node:assert');
const { buildMessages, parseModelJson, validateResult } = require('../lib/dna-ai.js');
const handler = require('../api/analyze-dna.js');

/* ----- 1) AI 답변 해석 ----- */

test('코드블록(```json)으로 감싼 답변도 JSON으로 해석', function () {
  const obj = parseModelJson('분석 결과입니다.\n```json\n{"family_id":"parcel"}\n```');
  assert.strictEqual(obj.family_id, 'parcel');
});

test('JSON이 없는 답변은 오류', function () {
  assert.throws(function () { parseModelJson('잘 모르겠어요'); });
});

/* ----- 2) AI 결과 검증 ----- */

const sample = '[CJ대한통운] 주소 불일치로 반송 예정. 확인 http://x.example';

test('사전에 없는 계열 id는 none으로 바뀜', function () {
  const r = validateResult({ family_id: 'alien_attack', extracted_text: sample }, sample);
  assert.strictEqual(r.family_id, 'none');
});

test('원문에 없는(지어낸) 근거는 제거됨', function () {
  const r = validateResult({
    family_id: 'parcel',
    extracted_text: sample,
    evidence: [
      { quote: '주소 불일치', tactic: '핑계', why: '클릭 유도' },
      { quote: '계좌번호를 보내주세요', tactic: '정보 요구', why: '지어낸 문장' }
    ]
  }, sample);
  assert.strictEqual(r.evidence.length, 1);
  assert.strictEqual(r.evidence[0].quote, '주소 불일치');
});

test('확신도는 0~100 사이로 잘림, 이상한 위험도는 주의로', function () {
  assert.strictEqual(validateResult({ confidence: 250 }, sample).confidence, 100);
  assert.strictEqual(validateResult({ confidence: '모름' }, sample).confidence, 0);
  assert.strictEqual(validateResult({ risk: '아주위험' }, sample).risk, '주의');
});

/* ----- 3) 프롬프트 만들기 ----- */

test('이미지가 있으면 메시지에 이미지가 포함됨', function () {
  const msgs = buildMessages({ text: '', image: 'data:image/png;base64,AAAA' });
  const parts = msgs[1].content;
  assert.ok(parts.some(function (p) { return p.type === 'image_url'; }));
});

test('시스템 프롬프트에 모든 계열 id가 들어감', function () {
  const system = buildMessages({ text: '안녕' })[0].content;
  ['parcel', 'finance', 'personal_info', 'acquaintance', 'enforcement', 'family', 'job_invest', 'ad_event']
    .forEach(function (id) { assert.ok(system.includes(id), id + ' 없음'); });
});

/* ----- 4) API 전체 흐름 (가짜 fetch 사용) ----- */

// 가짜 응답 객체: handler가 res.statusCode / setHeader / end만 쓰므로 그것만 흉내냄
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader: function (k, v) { this.headers[k] = v; },
    end: function (b) { this.body = JSON.parse(b); }
  };
}

test('API: 정상 요청이면 검증된 결과를 돌려줌', async function () {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  // 가짜 OpenRouter 응답
  global.fetch = async function () {
    return {
      ok: true,
      json: async function () {
        return { choices: [{ message: { content: JSON.stringify({
          extracted_text: sample, risk: '위험', family_id: 'parcel', confidence: 92,
          one_line: '택배 반송을 핑계로 링크 클릭을 유도해요.',
          evidence: [{ quote: '반송 예정', tactic: '긴급성 유도', why: '서두르게 만듦' }],
          variant_note: ''
        }) } }] };
      }
    };
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body: { text: sample } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.family_id, 'parcel');
    assert.strictEqual(res.body.evidence.length, 1);
  } finally {
    global.fetch = originalFetch; // 원래 fetch로 되돌리기
  }
});

test('API: 빈 요청은 400', async function () {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const res = fakeRes();
  await handler({ method: 'POST', body: {} }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('API: 키가 없으면 500 + 안내 메시지', async function () {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const res = fakeRes();
  await handler({ method: 'POST', body: { text: '안녕' } }, res);
  assert.strictEqual(res.statusCode, 500);
  assert.ok(res.body.error.includes('OPENROUTER_API_KEY'));
  process.env.OPENROUTER_API_KEY = saved;
});

test('API: OpenRouter 사용량 초과(429)면 안내 문구 포함 502', async function () {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = async function () {
    return { ok: false, status: 429, json: async function () { return { error: { message: 'Rate limit' } }; } };
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body: { text: '안녕' } }, res);
    assert.strictEqual(res.statusCode, 502);
    assert.ok(res.body.error.includes('사용량 초과'));
  } finally {
    global.fetch = originalFetch;
  }
});
