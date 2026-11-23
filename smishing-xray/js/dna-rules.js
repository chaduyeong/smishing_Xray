/* =====================================================================
 * dna-rules.js — 규칙(키워드) 기반 수법 DNA 분류기
 * ---------------------------------------------------------------------
 * - 문자 내용을 받아서 data/dna_families.json의 키워드와 비교해
 *   어떤 수법 계열(DNA)인지 점수를 매기고 1순위 계열을 고른다.
 * - AI 없이도 바로 동작하므로, 2단계에서 만들 AI 분석이 실패했을 때
 *   대신 쓰는 "백업 분류기" 역할도 한다.
 * - 브라우저(화면)와 Node.js(자동 테스트) 양쪽에서 쓸 수 있게 만들었다.
 * ===================================================================== */

(function (global) {
  'use strict';

  // 키워드 종류별 가중치: 결정적 표현(strong)은 3점, 일반 표현(normal)은 1점
  const WEIGHT = { strong: 3, normal: 1 };

  // 정규식에서 특별한 의미가 있는 문자( . * ? ( ) 등 )를 일반 글자로 바꿔주는 함수
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 키워드를 정규식으로 바꾸는 함수
  // 글자 사이 띄어쓰기를 무시하게 만들어서
  // "개인정보 유출"과 "개인정보유출"을 둘 다 잡을 수 있다.
  function keywordToRegex(word) {
    const chars = Array.from(word.replace(/\s+/g, '')); // 공백 제거 후 한 글자씩 분리
    const body = chars.map(escapeRegex).join('\\s*'); // 글자 사이에 "공백 0개 이상" 허용
    return new RegExp(body, 'gi'); // g: 전부 찾기, i: 영어 대소문자 무시
  }

  // 텍스트 안에서 정규식에 걸리는 모든 위치를 찾아 배열로 돌려주는 함수
  function findAll(text, regex) {
    const hits = [];
    regex.lastIndex = 0; // 같은 정규식을 다시 쓸 때를 대비해 검색 위치 초기화
    let m;
    while ((m = regex.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m[0].length === 0) regex.lastIndex++; // 길이 0짜리 매치로 무한루프 도는 것 방지
    }
    return hits;
  }

  // 한 계열(family)에 대해 점수를 계산하는 함수
  // 반환값: { score: 총점, matches: [{ word, kind, weight, hits }] }
  function scoreFamily(text, family) {
    const matches = [];
    let score = 0;

    // strong / normal 두 종류 키워드를 차례로 검사
    ['strong', 'normal'].forEach(function (kind) {
      const words = (family.keywords && family.keywords[kind]) || [];
      words.forEach(function (word) {
        const hits = findAll(text, keywordToRegex(word));
        if (hits.length > 0) {
          // 같은 키워드가 여러 번 나와도 점수는 한 번만 준다 (도배 문자 점수 폭주 방지)
          score += WEIGHT[kind];
          matches.push({ word: word, kind: kind, weight: WEIGHT[kind], hits: hits });
        }
      });
    });

    return { score: score, matches: matches };
  }

  // 공통 위험 신호(링크, 긴급성, 앱 설치 유도 등)를 찾는 함수
  function detectSignals(text, commonSignals) {
    const found = [];
    (commonSignals || []).forEach(function (signal) {
      let hits = [];
      signal.patterns.forEach(function (pattern) {
        hits = hits.concat(findAll(text, new RegExp(pattern, 'gi')));
      });
      if (hits.length > 0) {
        found.push({
          id: signal.id,
          label: signal.label,
          description: signal.description,
          hits: hits
        });
      }
    });
    return found;
  }

  // 분류 결과를 얼마나 믿을 수 있는지(신뢰도) 판단하는 함수
  // - 높음: 결정적 키워드가 있고(점수 3 이상) 위험 신호도 1개 이상
  // - 보통: 결정적 키워드만 있거나, 키워드 + 위험 신호가 함께 있음
  // - 낮음: 일반 키워드만 조금 걸림 (정상 안내 문자일 가능성 큼)
  function judgeConfidence(top, signalCount) {
    if (!top) return '없음';
    if (top.score >= 3 && signalCount >= 1) return '높음';
    if (top.score >= 3 || signalCount >= 1) return '보통';
    return '낮음';
  }

  // 화면에서 형광펜 칠할 구간 목록을 만드는 함수
  // 겹치는 구간은 먼저 시작하고 더 긴 쪽을 남긴다.
  function buildHighlights(top, signals) {
    const ranges = [];

    // 1순위 계열의 키워드 위치 → 계열 색으로 표시
    if (top) {
      top.matches.forEach(function (m) {
        m.hits.forEach(function (h) {
          ranges.push({
            start: h.start,
            end: h.end,
            type: 'family',
            label: top.family.name + ' 키워드: ' + m.word,
            color: top.family.color
          });
        });
      });
    }

    // 공통 위험 신호 위치 → 빨간 계열로 표시
    signals.forEach(function (s) {
      s.hits.forEach(function (h) {
        ranges.push({ start: h.start, end: h.end, type: 'signal', label: s.label + ': ' + s.description });
      });
    });

    return mergeRanges(ranges);
  }

  // 형광펜 구간 목록에서 겹치는 구간을 정리하는 함수
  // (2단계부터 AI 근거 구간도 이 함수로 정리하려고 따로 분리함)
  function mergeRanges(ranges) {
    // 원본 배열을 건드리지 않도록 복사한 뒤
    // 시작 위치 순으로 정렬, 같은 위치면 긴 구간을 앞으로
    const sorted = ranges.slice().sort(function (a, b) {
      return a.start - b.start || (b.end - b.start) - (a.end - a.start);
    });

    // 앞 구간과 겹치는 구간은 버린다 (형광펜이 겹쳐 깨지는 것 방지)
    const result = [];
    let lastEnd = -1;
    sorted.forEach(function (r) {
      if (r.start >= lastEnd) {
        result.push(r);
        lastEnd = r.end;
      }
    });
    return result;
  }

  // 형광펜 두 겹 합치기: 위 겹(topRanges)은 그대로 두고, 아래 겹(baseRanges)은 위 겹과 겹치는 부분만 잘라냄
  // (3단계 추가) AI 근거가 문장 전체를 잡아도 링크 같은 위험 신호 형광펜이 가려지지 않게 하려고
  function overlayRanges(baseRanges, topRanges) {
    const pieces = [];
    baseRanges.forEach(function (b) {
      let segments = [{ start: b.start, end: b.end }]; // 잘려 나갈 수 있는 조각들
      topRanges.forEach(function (t) {
        const next = [];
        segments.forEach(function (s) {
          if (t.end <= s.start || t.start >= s.end) { next.push(s); return; } // 안 겹치면 그대로
          if (t.start > s.start) next.push({ start: s.start, end: t.start });  // 겹치는 부분 앞쪽 조각
          if (t.end < s.end) next.push({ start: t.end, end: s.end });          // 겹치는 부분 뒤쪽 조각
        });
        segments = next;
      });
      // 잘린 조각마다 원래 형광펜 정보(색, 설명)를 그대로 복사
      segments.forEach(function (s) {
        if (s.end > s.start) pieces.push(Object.assign({}, b, { start: s.start, end: s.end }));
      });
    });
    return mergeRanges(pieces.concat(topRanges));
  }

  // ★ 메인 함수: 문자 내용(text)과 수법 DNA 사전(dict)을 받아 분류 결과를 돌려준다
  function classify(text, dict) {
    const clean = (text || '').trim();
    if (!clean) return null; // 빈 문자는 분석하지 않음

    // 모든 계열의 점수를 계산하고, 0점은 빼고, 점수 높은 순으로 정렬
    const ranked = dict.families
      .map(function (family) {
        const r = scoreFamily(clean, family);
        return { family: family, score: r.score, matches: r.matches };
      })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    const signals = detectSignals(clean, dict.commonSignals);
    const top = ranked[0] || null; // 1순위 계열 (하나도 안 걸리면 null)

    return {
      text: clean,                                  // 분석한 원문
      top: top,                                     // 1순위 수법 계열
      candidates: ranked.slice(1, 3),               // 2·3순위 후보 (헷갈리는 경우 참고용)
      signals: signals,                             // 공통 위험 신호 목록
      confidence: judgeConfidence(top, signals.length), // 신뢰도
      highlights: buildHighlights(top, signals),    // 형광펜 구간
      method: 'rule'                                // 분석 방식 표시 (2단계에서 'ai'가 추가됨)
    };
  }

  // 밖에서 쓸 함수들을 묶어서 내보내기
  const api = {
    classify: classify,
    mergeRanges: mergeRanges,
    overlayRanges: overlayRanges,
    keywordToRegex: keywordToRegex,
    escapeRegex: escapeRegex
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node.js(테스트)에서 require로 불러올 때
  } else {
    global.DnaRules = api; // 브라우저에서는 window.DnaRules로 사용
  }
})(typeof window !== 'undefined' ? window : globalThis);
