/* =====================================================================
 * handoff.js — 페이지끼리 문자(와 캡처 이미지)를 넘겨주는 도우미
 * ---------------------------------------------------------------------
 * 예) X-ray 스캔 화면에서 "🚨 신고 패키지 만들기"를 누르면
 *     지금 문자 내용을 저장해 두고 report.html로 이동 → 신고 패키지 화면이 꺼내서 자동 입력
 *
 * 저장 위치: sessionStorage (이 브라우저 탭 안에서만, 탭을 닫으면 사라짐)
 * 서버로는 아무것도 보내지 않는다.
 * ===================================================================== */

(function (global) {
  'use strict';

  const KEY = 'smishingXray.handoff.v1'; // 저장할 때 쓰는 이름
  const MAX_AGE_MS = 10 * 60 * 1000;     // 10분이 지난 건 버림 (오래된 문자가 갑자기 뜨는 것 방지)
  const MAX_IMAGE_SIDE = 1600;           // 이미지 가로세로 최대 크기 (저장 공간 초과 방지)

  // 큰 캡처 이미지를 줄여서 JPEG로 바꾸는 함수 (sessionStorage는 보통 5MB까지만 저장 가능)
  function shrinkImage(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = function () { resolve(null); }; // 이미지를 못 읽으면 이미지 없이 진행
      img.src = dataUrl;
    });
  }

  // 저장 시도 (공간이 부족하면 false)
  function save(data) {
    try {
      global.sessionStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ★ 문자를 저장하고 다른 페이지로 이동
  //   targetPage: 'dna.html' 또는 'report.html'
  //   payload   : { text: '문자 내용', image: 'data:image/...' (없어도 됨), from: '보낸 화면 이름' }
  async function send(targetPage, payload) {
    const data = {
      text: (payload.text || '').trim(),
      image: null,
      from: payload.from || '',
      at: Date.now()
    };

    if (payload.image) data.image = await shrinkImage(payload.image);

    // 1순위: 이미지까지 저장 → 실패하면 2순위: 글자만 저장
    let ok = save(data);
    if (!ok && data.image) {
      data.image = null;
      ok = save(data);
    }

    // 저장소 자체를 못 쓰는 브라우저(일부 시크릿 모드)면 주소 뒤(#)에 글자만 붙여서 넘김
    if (!ok) {
      global.location.href = targetPage + '#handoff=' + encodeURIComponent(data.text) +
        '&from=' + encodeURIComponent(data.from);
      return;
    }
    global.location.href = targetPage;
  }

  // ★ 넘겨받은 문자 꺼내기 (한 번 꺼내면 지워짐). 없으면 null
  function take() {
    // 주소 뒤(#handoff=...)로 넘어온 경우
    const hash = global.location.hash;
    if (hash.indexOf('#handoff=') === 0) {
      const params = new URLSearchParams(hash.slice(1));
      history.replaceState(null, '', global.location.pathname); // 주소창에서 지우기
      return { text: params.get('handoff') || '', image: null, from: params.get('from') || '' };
    }

    // sessionStorage로 넘어온 경우
    try {
      const raw = global.sessionStorage.getItem(KEY);
      if (!raw) return null;
      global.sessionStorage.removeItem(KEY); // 한 번만 쓰고 지움
      const data = JSON.parse(raw);
      if (!data || !data.text || Date.now() - data.at > MAX_AGE_MS) return null;
      return data;
    } catch (e) {
      return null; // 저장소를 못 쓰거나 내용이 깨진 경우
    }
  }

  // 받은 화면 위쪽에 "○○에서 문자를 가져왔어요" 안내 띠 보여주기
  function showNotice(container, from, extra) {
    if (!container) return;
    const note = document.createElement('p');
    note.className = 'site-handoff-notice';
    note.textContent = '📨 ' + (from || '다른 화면') + '에서 문자를 가져왔어요.' + (extra ? ' ' + extra : '');
    container.insertBefore(note, container.firstChild);
  }

  global.Handoff = { send: send, take: take, showNotice: showNotice };
})(window);
