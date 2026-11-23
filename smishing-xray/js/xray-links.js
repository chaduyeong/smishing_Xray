/* =====================================================================
 * xray-links.js — [통합] X-ray 스캔 화면에서 다른 기능으로 문자 넘기기
 * ---------------------------------------------------------------------
 * 팀원이 만든 js/xray.js는 건드리지 않고, 버튼 동작만 이 파일에 따로 만들었다.
 *  - 🧬 이 문자 수법 DNA 분석      → dna.html로 문자 전달 (도착하면 자동 분석)
 *  - 🚨 이 문자로 신고 패키지 만들기 → report.html로 문자 + 캡처 이미지 전달
 * ===================================================================== */

(function () {
  'use strict';

  // 입력창에 있는 문자 가져오기 (스캔하면 캡처에서 읽은 글자도 여기에 들어 있음)
  function currentText() {
    const textarea = document.getElementById('messageInput');
    return textarea ? textarea.value.trim() : '';
  }

  // 올린 캡처 이미지 가져오기
  // xray.js 맨 위에 let으로 선언된 currentUploadedImageDataUrl 변수를 그대로 읽음
  function currentImage() {
    return typeof currentUploadedImageDataUrl !== 'undefined' ? currentUploadedImageDataUrl : null;
  }

  // 문자가 비어 있으면 안내하고 멈춤
  function requireText() {
    const text = currentText();
    if (!text) {
      alert('먼저 문자 내용을 입력하거나 캡처 이미지를 올려서 X-ray 스캔을 해주세요.');
      const textarea = document.getElementById('messageInput');
      if (textarea) textarea.focus();
      return null;
    }
    return text;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const toDnaBtn = document.getElementById('toDnaBtn');
    const toReportBtn = document.getElementById('toReportBtn');

    // 수법 DNA로 보내기 (글자만 보내면 충분해서 이미지는 보내지 않음)
    if (toDnaBtn) {
      toDnaBtn.addEventListener('click', function () {
        const text = requireText();
        if (text) window.Handoff.send('dna.html', { text: text, from: 'X-ray 스캔' });
      });
    }

    // 신고 패키지로 보내기 (증거 PDF에 넣을 캡처 이미지도 함께)
    if (toReportBtn) {
      toReportBtn.addEventListener('click', function () {
        const text = requireText();
        if (text) window.Handoff.send('report.html', { text: text, image: currentImage(), from: 'X-ray 스캔' });
      });
    }
  });
})();
