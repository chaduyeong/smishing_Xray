/* =====================================================================
 * dna-history.js — 수법 계보: 분석 기록 저장 + 비슷한 문자 묶기
 * ---------------------------------------------------------------------
 * 1) 분석한 문자를 브라우저 LocalStorage에 저장 (서버로 보내지 않음)
 * 2) 두 문자가 얼마나 비슷한지 계산 (문장 유사도 + 같은 링크 도메인)
 * 3) 비슷한 문자끼리 묶어서 "같은 조직 수법일 가능성"을 보여줌
 *    → 사이버수사에서 여러 피해 신고를 같은 사건으로 묶는 방식을 흉내 냄
 * 브라우저와 Node.js(테스트) 양쪽에서 동작한다.
 * ===================================================================== */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'smishingDna.history.v1'; // LocalStorage에 저장할 이름
  const MAX_RECORDS = 100;                      // 최대 저장 개수 (오래된 것부터 지워짐)
  const SIMILAR_THRESHOLD = 0.45;               // 이 점수 이상이면 "비슷한 문자"로 봄

  /* =================================================================
   * 유사도 계산
   * ================================================================= */

  // 문자에서 링크 도메인만 뽑기 (예: "http://www.cj-check.example/a1" → "cj-check.example")
  function extractDomains(text) {
    const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=[\/:?#\s]|$)/gi;
    const found = new Set();
    let m;
    while ((m = re.exec(text || '')) !== null) found.add(m[1].toLowerCase());
    return Array.from(found);
  }

  // 비교하기 좋게 문자 정리: 소문자, 링크 제거, 숫자는 #으로 통일, 공백 제거
  // (숫자를 통일하는 이유: 사기꾼은 금액·날짜·송장번호만 바꿔서 같은 문자를 뿌리기 때문)
  function normalize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, '');
  }

  // 두 글자씩 끊은 조각 모음 만들기 (예: "택배반송" → {"택배","배반","반송"})
  function bigrams(str) {
    const chars = Array.from(str);
    const set = new Set();
    for (let i = 0; i < chars.length - 1; i++) set.add(chars[i] + chars[i + 1]);
    return set;
  }

  // 자카드 유사도: 두 조각 모음이 얼마나 겹치는지 (0 = 전혀 다름, 1 = 똑같음)
  function jaccard(a, b) {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    a.forEach(function (x) { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  // ★ 두 문자의 유사도 계산
  // 같은 링크 도메인을 쓰면 같은 조직일 가능성이 매우 높아서 최소 0.9점을 줌
  function similarity(textA, textB) {
    const textScore = jaccard(bigrams(normalize(textA)), bigrams(normalize(textB)));
    const domainsB = extractDomains(textB);
    const sharedDomains = extractDomains(textA).filter(function (d) { return domainsB.indexOf(d) !== -1; });
    return {
      score: sharedDomains.length ? Math.max(textScore, 0.9) : textScore,
      textScore: textScore,
      sharedDomains: sharedDomains
    };
  }

  // 지금 문자와 비슷한 예전 기록 찾기 (비슷한 순서로 정렬)
  function findSimilar(text, records, threshold) {
    const limit = threshold === undefined ? SIMILAR_THRESHOLD : threshold;
    return records
      .filter(function (r) { return r.text !== text; }) // 자기 자신은 제외
      .map(function (r) {
        const s = similarity(text, r.text);
        return { record: r, score: s.score, sharedDomains: s.sharedDomains };
      })
      .filter(function (x) { return x.score >= limit; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  // ★ 비슷한 문자끼리 묶기 (2건 이상 묶인 것만 돌려줌)
  // 방법: A-B가 비슷하고 B-C가 비슷하면 A·B·C를 한 묶음으로 (union-find 알고리즘)
  function clusterRecords(records, threshold) {
    const limit = threshold === undefined ? SIMILAR_THRESHOLD : threshold;
    const parent = records.map(function (_, i) { return i; }); // 처음엔 각자 자기 묶음

    // i가 속한 묶음의 대표 찾기
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]; // 경로 압축 (다음 검색을 빠르게)
        i = parent[i];
      }
      return i;
    }

    const links = []; // 비슷하다고 판단된 쌍 기록 (묶음별 평균 유사도·공통 도메인 계산용)
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const s = similarity(records[i].text, records[j].text);
        if (s.score >= limit) {
          parent[find(i)] = find(j); // 두 묶음 합치기
          links.push({ i: i, j: j, score: s.score, sharedDomains: s.sharedDomains });
        }
      }
    }

    // 대표별로 기록 모으기
    const groups = {};
    records.forEach(function (r, i) {
      const root = find(i);
      (groups[root] = groups[root] || { records: [], scores: [], domains: new Set() }).records.push(r);
    });
    links.forEach(function (l) {
      const g = groups[find(l.i)];
      g.scores.push(l.score);
      l.sharedDomains.forEach(function (d) { g.domains.add(d); });
    });

    // 2건 이상인 묶음만, 큰 묶음 순으로
    return Object.keys(groups)
      .map(function (k) { return groups[k]; })
      .filter(function (g) { return g.records.length >= 2; })
      .map(function (g) {
        const avg = g.scores.reduce(function (a, b) { return a + b; }, 0) / g.scores.length;
        return { records: g.records, avgScore: avg, sharedDomains: Array.from(g.domains) };
      })
      .sort(function (a, b) { return b.records.length - a.records.length || b.avgScore - a.avgScore; });
  }

  // 계열별 건수 세기 (계열 없는 기록은 familyId = null로 묶임)
  function familyStats(records) {
    const counts = {};
    records.forEach(function (r) {
      const key = r.familyId || 'none';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts)
      .map(function (k) { return { familyId: k === 'none' ? null : k, count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /* =================================================================
   * 저장소
   * ================================================================= */

  // 기록마다 붙일 고유 번호 만들기
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // 저장소 만들기
  // storage: window.localStorage 같은 객체. 없거나 막혀 있으면(시크릿 모드 등) 메모리에만 임시 저장
  function createStore(storage) {
    let memory = null;       // LocalStorage를 못 쓸 때 대신 쓰는 메모리 저장 공간
    let persistent = true;   // 진짜로 브라우저에 저장되고 있는지

    function readRaw() {
      if (persistent && storage) {
        try { return storage.getItem(STORAGE_KEY); }
        catch (e) { persistent = false; } // 읽기 막힘 → 메모리 모드로 전환
      }
      return memory;
    }

    function writeRaw(value) {
      if (persistent && storage) {
        try { storage.setItem(STORAGE_KEY, value); return; }
        catch (e) { persistent = false; } // 쓰기 막힘(용량 초과 등) → 메모리 모드로 전환
      }
      memory = value;
    }

    // 저장된 기록 전체 불러오기 (최신순)
    function list() {
      try {
        const arr = JSON.parse(readRaw() || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return []; // 저장된 내용이 깨져 있으면 빈 목록
      }
    }

    function save(records) {
      writeRaw(JSON.stringify(records.slice(0, MAX_RECORDS)));
    }

    return {
      list: list,

      // 기록 추가: 같은 문자를 다시 분석하면 예전 기록을 지우고 맨 앞에 새로 넣음
      add: function (record) {
        const records = list().filter(function (r) { return r.text !== record.text; });
        const saved = Object.assign({ id: makeId(), savedAt: new Date().toISOString() }, record);
        records.unshift(saved);
        save(records);
        return saved;
      },

      // 기록 하나 삭제
      remove: function (id) {
        save(list().filter(function (r) { return r.id !== id; }));
      },

      // 전체 삭제
      clear: function () {
        save([]);
      },

      // 브라우저에 진짜 저장되고 있는지 (false면 새로고침 시 사라짐)
      isPersistent: function () {
        readRaw(); // 한 번 읽어봐서 막혔는지 확인
        return persistent && !!storage;
      }
    };
  }

  const api = {
    createStore: createStore,
    similarity: similarity,
    findSimilar: findSimilar,
    clusterRecords: clusterRecords,
    familyStats: familyStats,
    extractDomains: extractDomains,
    SIMILAR_THRESHOLD: SIMILAR_THRESHOLD,
    MAX_RECORDS: MAX_RECORDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;          // Node.js(테스트)
  } else {
    global.DnaHistory = api;       // 브라우저에서는 window.DnaHistory
  }
})(typeof window !== 'undefined' ? window : globalThis);
