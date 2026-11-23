/* =====================================================================
 * dna-app.js — 수법 DNA 화면 동작 (2단계: AI 분석 추가, [통합] 원래 이름 app.js)
 * ---------------------------------------------------------------------
 * 분석 순서
 *   1) /api/analyze-dna 로 AI 분석 요청 (문자 + 캡처 이미지)
 *   2) AI가 실패하면 1단계 규칙 분류기(DnaRules)로 자동 전환
 *   3) 두 결과 모두 같은 모양(view)으로 바꿔서 DNA 카드로 그림
 * 사용자가 넣은 문자는 textContent로만 넣어서 악성 스크립트가 실행되지 않게 했다.
 * ===================================================================== */

(function () {
  'use strict';

  // ----- 화면 요소 가져오기 -----
  const input = document.getElementById('msgInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const resultBox = document.getElementById('result');
  const exampleWrap = document.getElementById('exampleButtons');
  const imageInput = document.getElementById('imageInput');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const removeImageBtn = document.getElementById('removeImage');

  // (3단계 추가) 수법 계보 영역
  const lineageBox = document.getElementById('lineage');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const storageNote = document.getElementById('storageNote');

  let dict = null;          // 수법 DNA 사전
  let imageDataUrl = '';    // 올린 캡처 이미지 (data:image/jpeg;base64,... 형태)

  // (3단계 추가) 분석 기록 저장소
  // 일부 브라우저 설정에선 localStorage에 접근만 해도 오류가 나서 try로 감쌈
  let browserStorage = null;
  try { browserStorage = window.localStorage; } catch (e) { browserStorage = null; }
  const historyStore = window.DnaHistory.createStore(browserStorage);

  // ----- 예시 문자 (실제 수법을 참고해 만든 가짜 문자, 링크는 존재하지 않는 주소) -----
  const EXAMPLES = [
    { label: '📦 택배', text: '[CJ대한통운] 고객님 택배가 주소 불일치로 반송 예정입니다. 주소 확인: http://cj-check.example/a1' },
    { label: '🚨 과태료', text: '[교통민원24] 신호위반 과태료 미납 안내. 오늘까지 미확인 시 가산금 부과 http://efine.example' },
    { label: '👨‍👩‍👧 가족', text: '엄마 나 폰 액정이 깨져서 임시폰으로 연락해. 문화상품권 대신 결제 좀 해줄 수 있어?' },
    { label: '💌 부고', text: '저희 아버지께서 별세하셨습니다. 장례식장 안내 http://bugo.example/123' },
    { label: '💸 알바', text: '[모집] 재택 부업 일당 15만원 고수익 보장! 카톡으로 문의주세요' },
    { label: '✅ 정상', text: '[Web발신] [네이버] 인증번호 [746234]를 입력해 주세요.' }
  ];

  /* =================================================================
   * 작은 도우미 함수들
   * ================================================================= */

  // 태그를 만들고 클래스·글자를 한 번에 넣는 함수 (textContent라 HTML로 해석 안 됨)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // 결과 안의 작은 섹션(제목 + 내용)
  function section(title, content) {
    const wrap = el('div', 'section');
    wrap.appendChild(el('h3', null, title));
    wrap.appendChild(content);
    return wrap;
  }

  // 칩(작은 태그) 목록
  function renderChips(items) {
    const wrap = el('div', 'chips');
    items.forEach(function (item) {
      const chip = el('span', 'chip ' + (item.className || ''), item.text);
      if (item.title) chip.title = item.title;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  // 목록(ul/ol)
  function renderList(tag, className, items) {
    const list = el(tag, className);
    items.forEach(function (t) { list.appendChild(el('li', null, t)); });
    return list;
  }

  // 원문에 형광펜 칠하기
  function renderHighlightedText(text, highlights) {
    const box = el('div', 'message-box');
    let cursor = 0;
    highlights.forEach(function (h) {
      if (h.start > cursor) box.appendChild(document.createTextNode(text.slice(cursor, h.start)));
      const mark = el('mark', 'hl ' + (h.type === 'signal' ? 'hl-signal' : 'hl-family'), text.slice(h.start, h.end));
      mark.title = h.label; // 마우스 올리면 설명 표시
      box.appendChild(mark);
      cursor = h.end;
    });
    if (cursor < text.length) box.appendChild(document.createTextNode(text.slice(cursor)));
    return box;
  }

  // 사전에서 id로 계열 찾기
  function findFamily(id) {
    return dict.families.find(function (f) { return f.id === id; }) || null;
  }

  // 규칙 분류기가 찾은 위험 신호 → 형광펜 구간
  function signalRanges(rule) {
    const ranges = [];
    if (!rule) return ranges;
    rule.signals.forEach(function (s) {
      s.hits.forEach(function (h) {
        ranges.push({ start: h.start, end: h.end, type: 'signal', label: s.label + ': ' + s.description });
      });
    });
    return ranges;
  }

  /* =================================================================
   * 분석 결과 → 화면용 모양(view)으로 바꾸기
   * AI 결과든 규칙 결과든 같은 모양으로 맞춰야 그리는 함수를 하나로 쓸 수 있다.
   * ================================================================= */

  // 규칙 분류 결과 → view
  function viewFromRule(rule, note) {
    return {
      method: 'rule',
      methodNote: note || '',
      text: rule.text,
      family: rule.top ? rule.top.family : null,
      confidence: rule.confidence,
      risk: null,                                   // 규칙 분석은 위험도 판정을 하지 않음
      summary: rule.top ? rule.top.family.summary : '등록된 수법 키워드가 발견되지 않았어요.',
      highlights: rule.highlights,
      keywords: rule.top ? rule.top.matches : [],
      evidence: [],
      signals: rule.signals,
      variantNote: '',
      candidates: rule.candidates.map(function (c) { return { family: c.family, note: c.score + '점' }; })
    };
  }

  // AI 분석 결과 → view (규칙 결과는 위험 신호·키워드 보충용으로 함께 사용)
  function viewFromAi(ai, rule) {
    const family = ai.family_id === 'none' ? null : findFamily(ai.family_id);
    const text = ai.extracted_text;

    // AI 확신도(0~100) → 높음/보통/낮음
    const confidence = !family ? '없음' : ai.confidence >= 75 ? '높음' : ai.confidence >= 45 ? '보통' : '낮음';

    // AI 근거 구절의 위치를 원문에서 찾아 형광펜 구간으로 만들기
    const aiRanges = [];
    ai.evidence.forEach(function (e) {
      const idx = text.indexOf(e.quote);
      if (idx !== -1) {
        aiRanges.push({ start: idx, end: idx + e.quote.length, type: 'family', label: e.tactic + ': ' + e.why });
      }
    });

    // 규칙 분류기가 AI와 다른 계열을 골랐다면 "함께 의심되는 계열"로 보여줌
    const candidates = [];
    if (rule && rule.top && (!family || rule.top.family.id !== family.id)) {
      candidates.push({ family: rule.top.family, note: '키워드 분석 1순위' });
    }

    return {
      method: 'ai',
      methodNote: ai.model ? '모델: ' + ai.model : '',
      text: text,
      family: family,
      confidence: confidence,
      confidenceScore: ai.confidence,
      risk: ai.risk,
      summary: ai.one_line || (family ? family.summary : ''),
      // (3단계 수정) AI 근거 형광펜 위에 위험 신호 형광펜을 덮어서, 링크 등이 가려지지 않게 함
      highlights: window.DnaRules.overlayRanges(aiRanges, signalRanges(rule)),
      // 규칙 분류기도 같은 계열을 골랐으면 그 키워드도 같이 보여줌
      keywords: rule && rule.top && family && rule.top.family.id === family.id ? rule.top.matches : [],
      evidence: ai.evidence,
      signals: rule ? rule.signals : [],
      variantNote: ai.variant_note,
      candidates: candidates
    };
  }

  /* =================================================================
   * view → 화면 그리기
   * ================================================================= */
  function renderView(v) {
    resultBox.className = '';
    resultBox.replaceChildren();
    resultBox.style.setProperty('--family-color', v.family ? v.family.color : '#94a3b8');

    // 1) 분석 방식 + 위험도 표시줄
    const method = el('div', 'method');
    method.appendChild(el('span', 'method-tag ' + (v.method === 'ai' ? 'method-ai' : 'method-rule'),
      v.method === 'ai' ? '🤖 AI 분석' : '📏 키워드 규칙 분석'));
    if (v.risk) method.appendChild(el('span', 'risk risk-' + v.risk, '위험도: ' + v.risk));
    if (v.methodNote) method.appendChild(el('span', null, v.methodNote));
    resultBox.appendChild(method);

    // 2) DNA 헤더 (계열 이모지·이름·요약·신뢰도)
    const head = el('div', 'dna-head');
    let emoji = '🧬';
    let name = '알려진 수법 계열과 맞지 않아요';
    if (v.family) {
      emoji = v.family.emoji;
      name = v.family.name;
    } else if (v.risk === '안전') {
      emoji = '✅';
      name = '정상 문자로 보여요';
    } else if (v.risk === '위험' || v.risk === '주의') {
      emoji = '🆕';
      name = '새로운 유형의 수법일 수 있어요';
    }
    head.appendChild(el('div', 'dna-emoji', emoji));
    const info = el('div');
    info.appendChild(el('p', 'dna-name', name));
    if (v.summary) info.appendChild(el('p', 'dna-summary', v.summary));
    head.appendChild(info);
    const badgeText = '신뢰도 ' + v.confidence + (v.confidenceScore !== undefined && v.family ? ' (' + v.confidenceScore + ')' : '');
    head.appendChild(el('span', 'badge badge-' + v.confidence, badgeText));
    resultBox.appendChild(head);

    // 계열은 잡혔는데 위험 신호가 없으면 정상 안내 문자일 수도 있다고 알려줌
    if (v.family && v.signals.length === 0 && v.risk !== '위험') {
      resultBox.appendChild(el('p', 'hint',
        '💡 링크·전화·앱 설치 유도 같은 위험 신호는 없어요. 같은 주제의 정상 안내 문자일 수도 있습니다.'));
    }

    // 3) 원문 + 형광펜
    if (v.text) {
      resultBox.appendChild(section('원문 분석 (형광펜에 마우스를 올려보세요)', renderHighlightedText(v.text, v.highlights)));
    }

    // 4) AI가 찾은 근거 (AI 분석일 때만)
    if (v.evidence.length) {
      const list = el('ul', 'evidence');
      v.evidence.forEach(function (e) {
        const li = el('li');
        li.appendChild(el('q', null, e.quote));
        if (e.tactic) li.appendChild(el('span', 'tactic', e.tactic));
        if (e.why) li.appendChild(el('span', 'why', e.why));
        list.appendChild(li);
      });
      resultBox.appendChild(section('🤖 AI가 찾은 수법 근거', list));
    }

    // 5) 수법 키워드
    if (v.keywords.length) {
      resultBox.appendChild(section('🧬 발견된 수법 키워드', renderChips(v.keywords.map(function (m) {
        return { text: m.word, className: m.kind === 'strong' ? 'chip-strong' : '', title: m.kind === 'strong' ? '결정적 표현 (+3점)' : '일반 표현 (+1점)' };
      }))));
    }

    // 6) 공통 위험 신호
    if (v.signals.length) {
      resultBox.appendChild(section('⚠️ 발견된 위험 신호', renderChips(v.signals.map(function (s) {
        return { text: s.label, className: 'chip-signal', title: s.description };
      }))));
    }

    // 7) 변종 특징 (AI가 기존 계열과 다른 점을 찾았을 때)
    if (v.variantNote) {
      resultBox.appendChild(section('🆕 기존 수법과 다른 변종 특징', el('div', 'variant', v.variantNote)));
    }

    // 8~10) 계열이 있을 때만: 수법 흐름, 통계, 대처법
    if (v.family) {
      const f = v.family;
      resultBox.appendChild(section('🔗 이 수법의 진행 흐름 (노리는 것: ' + f.target + ')', renderList('ol', 'flow', f.howItWorks)));
      if (f.stat) {
        const stat = el('div', 'stat', '📊 ' + f.stat.text);
        stat.appendChild(el('small', null, '출처: ' + f.stat.source));
        resultBox.appendChild(section('통계로 보는 이 수법', stat));
      }
      resultBox.appendChild(section('🛡️ 이렇게 대처하세요', renderList('ul', 'advice', f.advice)));
    }

    // 11) 함께 의심되는 계열
    if (v.candidates.length) {
      resultBox.appendChild(section('🔍 함께 의심되는 계열', renderChips(v.candidates.map(function (c) {
        return { text: c.family.emoji + ' ' + c.family.name + ' (' + c.note + ')' };
      }))));
    }

    // 12) (3단계 추가) 전에 받은 비슷한 문자 — 같은 조직이 보냈을 가능성
    if (v.similar && v.similar.length) {
      const list = el('ul', 'advice similar');
      v.similar.slice(0, 3).forEach(function (s) {
        const li = el('li');
        li.appendChild(el('span', 'pct', Math.round(s.score * 100) + '%'));
        li.appendChild(document.createTextNode(shorten(s.record.text, 50)));
        if (s.sharedDomains.length) li.appendChild(el('span', 'why', '🔗 같은 링크 도메인: ' + s.sharedDomains.join(', ')));
        list.appendChild(li);
      });
      resultBox.appendChild(section('🕵️ 전에 분석한 비슷한 문자 ' + v.similar.length + '건 (같은 조직 수법일 수 있어요)', list));
    }
  }

  // 긴 문자를 앞부분만 잘라서 보여주는 도우미
  function shorten(text, max) {
    const oneLine = text.replace(/\s+/g, ' ');
    return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
  }

  /* =================================================================
   * (3단계 추가) 분석 마무리: 비슷한 기록 찾기 → 화면 그리기 → 저장 → 계보 갱신
   * ================================================================= */
  function finishAnalysis(view) {
    // 저장하기 "전에" 찾아야 이번 문자가 아닌 예전 기록과 비교됨
    view.similar = window.DnaHistory.findSimilar(view.text, historyStore.list());
    renderView(view);

    historyStore.add({
      text: view.text.slice(0, 1000),               // 너무 긴 문자는 잘라서 저장
      familyId: view.family ? view.family.id : null,
      method: view.method,                          // 'ai' 또는 'rule'
      risk: view.risk,
      confidence: view.confidence,
      summary: view.summary
    });
    renderLineage();
  }

  /* =================================================================
   * (3단계 추가) 수법 계보 화면 그리기
   * ================================================================= */
  function familyLabel(familyId) {
    const f = familyId ? findFamily(familyId) : null;
    return f ? { emoji: f.emoji, name: f.name, color: f.color } : { emoji: '❔', name: '미분류', color: '#94a3b8' };
  }

  // 저장 시각을 "11/21 14:30" 형태로
  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderLineage() {
    if (!dict) return; // 사전이 있어야 계열 이름을 표시할 수 있음
    const records = historyStore.list();
    lineageBox.replaceChildren();
    clearHistoryBtn.hidden = records.length === 0;

    // 저장 방식 안내 (시크릿 모드 등에서는 새로고침하면 사라짐)
    storageNote.textContent = historyStore.isPersistent()
      ? '분석 기록은 이 브라우저에만 저장돼요. (최대 ' + window.DnaHistory.MAX_RECORDS + '건)'
      : '⚠️ 이 브라우저에선 기록을 저장할 수 없어서, 새로고침하면 사라져요.';

    if (records.length === 0) {
      lineageBox.appendChild(el('p', 'result-empty', '아직 분석한 문자가 없어요. 문자를 분석하면 여기에 계보가 쌓여요.'));
      return;
    }

    const stats = window.DnaHistory.familyStats(records);
    const clusters = window.DnaHistory.clusterRecords(records);

    // 1) 요약 한 줄
    lineageBox.appendChild(el('p', 'lineage-summary',
      '지금까지 분석한 문자 ' + records.length + '건 · 수법 계열 ' +
      stats.filter(function (s) { return s.familyId; }).length + '종 · 같은 조직 의심 묶음 ' + clusters.length + '개'));

    const grid = el('div', 'lineage-grid');

    // 2) 왼쪽: 계열별 분포 막대그래프
    const bars = el('div', 'bars');
    const maxCount = stats[0].count;
    stats.forEach(function (s) {
      const label = familyLabel(s.familyId);
      const row = el('div', 'bar-row');
      row.appendChild(el('span', 'bar-label', label.emoji + ' ' + label.name));
      const track = el('div', 'bar-track');
      const fill = el('div', 'bar-fill');
      fill.style.width = Math.round((s.count / maxCount) * 100) + '%'; // 가장 많은 계열을 100%로
      fill.style.background = label.color;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'bar-count', s.count + '건'));
      bars.appendChild(row);
    });
    grid.appendChild(section('📊 계열별 분포', bars));

    // 3) 오른쪽: 같은 조직 의심 묶음
    const clusterWrap = el('div');
    if (clusters.length === 0) {
      clusterWrap.appendChild(el('p', 'hint', '아직 서로 비슷한 문자가 없어요. 비슷한 문자를 여러 개 분석하면 자동으로 묶여요.'));
    }
    clusters.forEach(function (c, idx) {
      const box = el('div', 'cluster');
      const head = el('div', 'cluster-head', '묶음 ' + (idx + 1) + ' · ' + c.records.length + '건 ');
      const reason = c.sharedDomains.length
        ? '같은 링크 도메인(' + c.sharedDomains.join(', ') + ')'
        : '문장 유사도 평균 ' + Math.round(c.avgScore * 100) + '%';
      head.appendChild(el('small', null, '— ' + reason));
      box.appendChild(head);
      c.records.forEach(function (r) {
        box.appendChild(el('div', 'mini', familyLabel(r.familyId).emoji + ' ' + shorten(r.text, 60)));
      });
      clusterWrap.appendChild(box);
    });
    grid.appendChild(section('🕵️ 같은 조직 의심 묶음', clusterWrap));

    lineageBox.appendChild(grid);

    // 4) 아래: 전체 기록 목록 (최신순)
    const list = el('ul', 'records');
    records.forEach(function (r) {
      const label = familyLabel(r.familyId);
      const li = el('li', 'record');
      li.appendChild(el('span', 'record-emoji', label.emoji));
      const textSpan = el('span', 'record-text', shorten(r.text, 80));
      textSpan.title = r.text; // 마우스 올리면 전체 문자
      li.appendChild(textSpan);
      li.appendChild(el('span', 'record-meta', (r.method === 'ai' ? '🤖' : '📏') + ' ' + formatTime(r.savedAt)));

      // 불러오기: 입력창에 다시 넣기 (AI 사용량을 아끼려고 자동 분석은 안 함)
      const loadBtn = el('button', null, '불러오기');
      loadBtn.type = 'button';
      loadBtn.addEventListener('click', function () {
        clearImage();
        input.value = r.text;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        input.focus();
      });
      li.appendChild(loadBtn);

      // 삭제
      const delBtn = el('button', null, '삭제');
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', '이 기록 삭제');
      delBtn.addEventListener('click', function () {
        historyStore.remove(r.id);
        renderLineage();
      });
      li.appendChild(delBtn);

      list.appendChild(li);
    });
    lineageBox.appendChild(section('🗂 전체 기록', list));
  }

  // 전체 삭제 버튼 (실수 방지를 위해 한 번 더 확인)
  clearHistoryBtn.addEventListener('click', function () {
    if (window.confirm('분석 기록을 전부 지울까요?')) {
      historyStore.clear();
      renderLineage();
    }
  });

  // 분석 중 표시
  function showLoading(message) {
    resultBox.className = '';
    resultBox.replaceChildren(el('div', 'loading', message));
  }

  // 오류만 표시 (규칙 분석으로도 대신할 수 없을 때)
  function showError(message) {
    resultBox.className = '';
    resultBox.replaceChildren(el('div', 'loading', '⚠️ ' + message));
  }

  /* =================================================================
   * AI API 호출
   * ================================================================= */
  async function callAi(text, image) {
    const res = await fetch('api/analyze-dna', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, image: image || undefined })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('AI 서버 연결 실패 (' + res.status + ')'));
    return data;
  }

  /* =================================================================
   * 분석 버튼 동작
   * ================================================================= */
  async function analyze() {
    if (!dict) {
      showError('수법 DNA 사전을 아직 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
      return;
    }
    const text = input.value.trim();
    if (!text && !imageDataUrl) {
      input.focus();
      return; // 아무것도 안 넣었으면 그냥 무시
    }

    analyzeBtn.disabled = true;
    showLoading(imageDataUrl ? '🤖 AI가 캡처 이미지를 읽고 분석하고 있어요...' : '🤖 AI가 문자를 분석하고 있어요...');

    try {
      // ① AI 분석 시도
      const ai = await callAi(text, imageDataUrl);

      // 이미지만 올렸을 때는 AI가 읽은 글자를 입력창에 채워서 보여줌
      if (!text && ai.extracted_text) input.value = ai.extracted_text;

      // AI가 읽은 글자로 규칙 분류도 돌려서 위험 신호·키워드를 보충
      const rule = window.DnaRules.classify(ai.extracted_text, dict);
      finishAnalysis(viewFromAi(ai, rule)); // (3단계) 화면 그리기 + 계보에 저장
      console.log('[수법 DNA] AI 결과:', ai);
    } catch (err) {
      // ② AI 실패 → 규칙 분석으로 대신
      console.warn('[수법 DNA] AI 분석 실패, 규칙 분석으로 전환:', err.message);
      const rule = window.DnaRules.classify(text, dict);
      if (rule) {
        finishAnalysis(viewFromRule(rule, 'AI 연결 실패로 대신 분석했어요 — ' + err.message));
      } else {
        // 이미지만 있고 글자가 없으면 규칙 분석도 불가능
        showError('AI 분석에 실패했어요. 이미지 속 문자를 직접 입력해서 다시 시도해주세요. (' + err.message + ')');
      }
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  /* =================================================================
   * 캡처 이미지 처리
   * ================================================================= */

  // 큰 이미지를 가로세로 최대 1280px JPEG로 줄이는 함수
  // (전송 용량을 줄여서 Vercel 요청 크기 제한·AI 처리 시간을 지키려고)
  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const MAX = 1280;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height)); // 작은 이미지는 그대로
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85)); // 화질 85%
        };
        img.onerror = function () { reject(new Error('이미지를 읽지 못했어요.')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('파일을 읽지 못했어요.')); };
      reader.readAsDataURL(file);
    });
  }

  // 이미지 등록 (파일 선택·붙여넣기 공통)
  async function setImage(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      showError('PNG·JPG·WEBP 이미지만 올릴 수 있어요.');
      return;
    }
    try {
      imageDataUrl = await resizeImage(file);
      previewImg.src = imageDataUrl;
      imagePreview.hidden = false;
    } catch (err) {
      showError(err.message);
    }
  }

  // 이미지 빼기
  function clearImage() {
    imageDataUrl = '';
    imageInput.value = '';
    previewImg.removeAttribute('src');
    imagePreview.hidden = true;
  }

  // 파일 선택 버튼
  imageInput.addEventListener('change', function () {
    if (imageInput.files[0]) setImage(imageInput.files[0]);
  });
  removeImageBtn.addEventListener('click', clearImage);

  // 입력창에 Ctrl+V로 캡처 이미지 붙여넣기
  input.addEventListener('paste', function (e) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        e.preventDefault();               // 이미지는 글자로 붙여넣지 않음
        setImage(items[i].getAsFile());
        return;
      }
    }
  });

  /* =================================================================
   * 예시 버튼, 단축키, 사전 불러오기
   * ================================================================= */
  EXAMPLES.forEach(function (ex) {
    const btn = el('button', null, ex.label);
    btn.type = 'button';
    btn.addEventListener('click', function () {
      clearImage();          // 예시는 글자로만 분석
      input.value = ex.text;
      analyze();
    });
    exampleWrap.appendChild(btn);
  });

  analyzeBtn.addEventListener('click', analyze);

  // [통합] 🚨 이 문자로 신고 패키지 만들기 → report.html로 문자 + 캡처 이미지 전달
  const toReportBtn = document.getElementById('toReportBtn');
  if (toReportBtn) {
    toReportBtn.addEventListener('click', function () {
      const text = input.value.trim();
      if (!text) {
        showError('먼저 문자를 입력하고 분석해 주세요.'); // 빈 문자는 보낼 수 없음
        input.focus();
        return;
      }
      window.Handoff.send('report.html', { text: text, image: imageDataUrl || null, from: '수법 DNA' });
    });
  }
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze(); // Ctrl(⌘)+Enter로 분석
  });

  fetch('data/dna_families.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      dict = data;
      console.log('[수법 DNA] 사전 불러옴: 계열 ' + data.families.length + '개');
      renderLineage(); // (3단계) 예전에 저장한 계보 보여주기

      // [통합] X-ray 스캔 화면에서 넘겨받은 문자가 있으면 입력창에 넣고 바로 분석
      const handoff = window.Handoff ? window.Handoff.take() : null;
      if (handoff) {
        input.value = handoff.text;
        window.Handoff.showNotice(document.querySelector('.page'), handoff.from, '자동으로 분석할게요.');
        analyze();
      }
    })
    .catch(function (err) {
      showError('수법 DNA 사전을 불러오지 못했어요. 터미널에서 "npm run dev"로 서버를 켜고 열어주세요. (' + err.message + ')');
    });
})();
