/* =====================================================================
 * dna-history.test.js — 수법 계보(기록 저장·유사도·묶기) 자동 테스트
 * ===================================================================== */

const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/dna-history.js');
const { overlayRanges } = require('../js/dna-rules.js');

// 가짜 LocalStorage (Node.js에는 LocalStorage가 없어서 직접 흉내냄)
function fakeStorage() {
  const data = {};
  return {
    getItem: function (k) { return k in data ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); }
  };
}

/* ----- 1) 도메인 추출 ----- */

test('링크에서 도메인만 뽑음 (www·경로 제거)', function () {
  assert.deepStrictEqual(H.extractDomains('확인 http://www.CJ-check.example/a1?x=1 바로'), ['cj-check.example']);
  assert.deepStrictEqual(H.extractDomains('주소 bit.ly/abc 참고'), ['bit.ly']);
  assert.deepStrictEqual(H.extractDomains('금액 1.5만원'), []); // 숫자는 도메인 아님
});

/* ----- 2) 유사도 ----- */

test('숫자만 바뀐 같은 문자는 매우 비슷함', function () {
  const a = '[CJ대한통운] 운송장 123456 주소 불일치로 반송 예정입니다.';
  const b = '[CJ대한통운] 운송장 987654 주소 불일치로 반송 예정입니다.';
  assert.ok(H.similarity(a, b).score > 0.9);
});

test('전혀 다른 문자는 비슷하지 않음', function () {
  const a = '[CJ대한통운] 주소 불일치로 반송 예정입니다.';
  const b = '엄마 나 폰 액정 깨져서 임시폰으로 연락해';
  assert.ok(H.similarity(a, b).score < 0.2);
});

test('내용이 달라도 같은 링크 도메인이면 같은 조직 의심 (0.9 이상)', function () {
  const a = '택배 반송 확인 http://evil.example/a';
  const b = '과태료 조회 바랍니다 http://evil.example/b';
  const s = H.similarity(a, b);
  assert.ok(s.score >= 0.9);
  assert.deepStrictEqual(s.sharedDomains, ['evil.example']);
});

/* ----- 3) 묶기 ----- */

test('비슷한 문자끼리만 묶이고, 혼자인 문자는 묶음에서 빠짐', function () {
  const records = [
    { id: '1', text: '[CJ대한통운] 운송장 111 주소 불일치로 반송 예정' },
    { id: '2', text: '[CJ대한통운] 운송장 222 주소 불일치로 반송 예정' },
    { id: '3', text: '[교통민원] 과태료 미납 조회 http://fine.example/1' },
    { id: '4', text: '[국민건강보험] 검진결과 확인 http://fine.example/2' },
    { id: '5', text: '엄마 나 폰 고장나서 임시폰이야' }
  ];
  const clusters = H.clusterRecords(records);
  assert.strictEqual(clusters.length, 2);
  const ids = clusters.map(function (c) { return c.records.map(function (r) { return r.id; }).sort().join(','); }).sort();
  assert.deepStrictEqual(ids, ['1,2', '3,4']);
  // 3·4번은 공통 도메인으로 묶였어야 함
  const domainCluster = clusters.find(function (c) { return c.sharedDomains.length; });
  assert.deepStrictEqual(domainCluster.sharedDomains, ['fine.example']);
});

test('계열별 건수 집계', function () {
  const stats = H.familyStats([{ familyId: 'parcel' }, { familyId: 'parcel' }, { familyId: null }]);
  assert.deepStrictEqual(stats, [{ familyId: 'parcel', count: 2 }, { familyId: null, count: 1 }]);
});

/* ----- 4) 저장소 ----- */

test('저장 → 같은 문자 다시 저장하면 중복 없이 맨 앞으로', function () {
  const store = H.createStore(fakeStorage());
  store.add({ text: 'A' });
  store.add({ text: 'B' });
  store.add({ text: 'A' });
  assert.deepStrictEqual(store.list().map(function (r) { return r.text; }), ['A', 'B']);
  assert.ok(store.list()[0].id && store.list()[0].savedAt); // 번호·저장 시각 자동 추가
});

test('삭제와 전체 삭제', function () {
  const store = H.createStore(fakeStorage());
  const a = store.add({ text: 'A' });
  store.add({ text: 'B' });
  store.remove(a.id);
  assert.deepStrictEqual(store.list().map(function (r) { return r.text; }), ['B']);
  store.clear();
  assert.strictEqual(store.list().length, 0);
});

test('최대 개수를 넘으면 오래된 기록부터 지워짐', function () {
  const store = H.createStore(fakeStorage());
  for (let i = 0; i < H.MAX_RECORDS + 5; i++) store.add({ text: '문자 ' + i });
  assert.strictEqual(store.list().length, H.MAX_RECORDS);
  assert.strictEqual(store.list()[0].text, '문자 ' + (H.MAX_RECORDS + 4)); // 최신이 맨 앞
});

test('LocalStorage가 막혀 있어도(시크릿 모드 등) 메모리로 동작', function () {
  const broken = {
    getItem: function () { throw new Error('막힘'); },
    setItem: function () { throw new Error('막힘'); }
  };
  const store = H.createStore(broken);
  store.add({ text: 'A' });
  assert.strictEqual(store.list().length, 1);
  assert.strictEqual(store.isPersistent(), false);
});

/* ----- 5) 형광펜 두 겹 합치기 ----- */

test('AI 근거 형광펜이 위험 신호 형광펜을 가리지 않음', function () {
  // 0~30: AI가 잡은 긴 문장, 20~30: 그 안의 링크(위험 신호)
  const merged = overlayRanges(
    [{ start: 0, end: 30, type: 'family' }],
    [{ start: 20, end: 30, type: 'signal' }]
  );
  assert.deepStrictEqual(merged.map(function (r) { return [r.start, r.end, r.type]; }), [
    [0, 20, 'family'],
    [20, 30, 'signal']
  ]);
});
