/* =====================================================================
 * dna-rules.test.js — 규칙 기반 분류기 자동 테스트
 * 실행: npm test  (또는 node --test tests/)
 * 예시 문자는 실제 스미싱 수법을 참고해 직접 만든 가짜 문자이고,
 * 링크는 존재하지 않는 .example 주소를 썼다.
 * ===================================================================== */

const test = require('node:test');          // Node.js 기본 테스트 도구
const assert = require('node:assert');      // 결과가 맞는지 확인하는 도구
const path = require('node:path');
const fs = require('node:fs');
const { classify } = require('../js/dna-rules.js');

// 수법 DNA 사전(JSON)을 파일에서 읽어오기
const dict = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'dna_families.json'), 'utf-8')
);

// [문자 내용, 기대하는 계열 id] 목록 — 계열마다 1개씩
const cases = [
  ['[CJ대한통운] 고객님 택배가 주소 불일치로 반송 예정입니다. 주소 확인: http://cj-check.example/a1', 'parcel'],
  ['[국민카드] 해외 결제 승인 1,280,000원. 본인 아닐 시 고객센터 02-1234-5678', 'finance'],
  ['[네이버] 고객님 계정에 해외 로그인 시도가 감지되었습니다. 즉시 확인: http://nid-safe.example', 'personal_info'],
  ['저희 아버지께서 별세하셨습니다. 장례식장 안내 http://bugo.example/123', 'acquaintance'],
  ['[교통민원24] 신호위반 과태료 미납 안내. 오늘까지 미확인 시 가산금 부과 http://efine.example', 'enforcement'],
  ['엄마 나 폰 액정이 깨져서 임시폰으로 연락해. 문화상품권 대신 결제 좀 해줄 수 있어?', 'family'],
  ['[모집] 재택 부업 일당 15만원 고수익 보장! 카톡으로 문의주세요', 'job_invest'],
  ['[이벤트] 축하합니다! 경품 당첨되셨습니다. 수령하기 http://gift.example', 'ad_event']
];

// 계열별로 1순위가 기대한 계열인지 확인
cases.forEach(function ([text, expected]) {
  test('계열 분류: ' + expected, function () {
    const result = classify(text, dict);
    assert.ok(result.top, '아무 계열도 안 걸림: ' + text);
    assert.strictEqual(result.top.family.id, expected);
  });
});

// 링크 + 결정적 키워드가 있는 전형적 스미싱은 신뢰도 '높음'이어야 함
test('전형적인 택배 스미싱은 신뢰도 높음', function () {
  const result = classify(cases[0][0], dict);
  assert.strictEqual(result.confidence, '높음');
  // 링크 신호가 잡혔는지도 확인
  assert.ok(result.signals.some(function (s) { return s.id === 'url'; }));
});

// 정상 인증번호 문자는 신뢰도가 '낮음' 또는 '없음'이어야 함 (오탐 방지)
test('정상 인증번호 문자는 신뢰도 낮음 이하', function () {
  const result = classify('[Web발신] [네이버] 인증번호 [746234]를 입력해 주세요.', dict);
  assert.ok(['낮음', '없음'].includes(result.confidence), '실제 신뢰도: ' + result.confidence);
});

// 띄어쓰기를 붙여 써도 키워드를 잡는지 확인
test('띄어쓰기 무시: "개인정보유출"도 잡힘', function () {
  const result = classify('고객님의 개인정보유출이 확인되었습니다', dict);
  assert.strictEqual(result.top.family.id, 'personal_info');
});

// 빈 문자는 null을 돌려줘야 함
test('빈 문자는 분석하지 않음', function () {
  assert.strictEqual(classify('   ', dict), null);
});

// 형광펜 구간끼리 겹치지 않아야 화면이 깨지지 않음
test('형광펜 구간은 서로 겹치지 않음', function () {
  cases.forEach(function ([text]) {
    const hl = classify(text, dict).highlights;
    for (let i = 1; i < hl.length; i++) {
      assert.ok(hl[i].start >= hl[i - 1].end, '겹치는 구간 발견: ' + text);
    }
  });
});
