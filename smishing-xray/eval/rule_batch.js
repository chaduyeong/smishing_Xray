/* =====================================================================
 * eval/rule_batch.js — 여러 문자를 한 번에 규칙 분류하는 도우미
 * ---------------------------------------------------------------------
 * evaluate.py(파이썬)가 호출한다. 분류기는 자바스크립트라서
 * 파이썬에서 직접 못 쓰니까, 이 파일을 node로 실행해서 결과만 받아간다.
 * 입력(표준입력) : ["문자1", "문자2", ...]  (JSON 배열)
 * 출력(표준출력) : [{ family_id, confidence, signals }, ...]
 * ===================================================================== */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { classify } = require('../js/dna-rules.js');

// 수법 DNA 사전 불러오기
const dict = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'dna_families.json'), 'utf-8')
);

// 표준입력(파이썬이 보낸 내용) 전부 읽기 — 0은 표준입력을 뜻함
const texts = JSON.parse(fs.readFileSync(0, 'utf-8'));

// 문자마다 분류해서 필요한 값만 정리
const results = texts.map(function (text) {
  const r = classify(text, dict);
  if (!r) return { family_id: 'none', confidence: '없음', signals: [] }; // 빈 문자
  return {
    family_id: r.top ? r.top.family.id : 'none',
    confidence: r.confidence,                          // 높음/보통/낮음/없음
    signals: r.signals.map(function (s) { return s.id; }) // 발견된 위험 신호 id 목록
  };
});

process.stdout.write(JSON.stringify(results));
