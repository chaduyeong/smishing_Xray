/* =====================================================================
 * api/analyze-dna.js — AI 수법 DNA 분석 API (Vercel 서버리스 함수)
 * ---------------------------------------------------------------------
 * 주소: POST /api/analyze-dna
 * 보내는 값: { "text": "문자 내용", "image": "data:image/...;base64,..." } (둘 중 하나 이상)
 * 받는 값  : { risk, family_id, confidence, one_line, evidence, variant_note, extracted_text, model }
 *
 * API 키를 브라우저 코드에 넣으면 누구나 훔쳐갈 수 있어서,
 * 키는 서버(이 파일)에서만 환경변수로 읽어 OpenRouter를 대신 호출한다.
 * ===================================================================== */

'use strict';

const { buildMessages, parseModelJson, validateResult } = require('../lib/dna-ai.js');

// 기본 모델 (환경변수 OPENROUTER_MODEL로 바꿀 수 있음)
// openrouter/free: 그때그때 사용 가능한 무료 모델을 자동으로 골라줌 (이미지 입력도 지원)
// 특정 무료 모델 하나만 쓰면 사용자가 몰릴 때 429 오류가 자주 나서 이걸 기본으로 함
const DEFAULT_MODEL = 'openrouter/free';
const MAX_TEXT = 2000;          // 문자 최대 글자 수
const MAX_IMAGE = 4000000;      // 이미지 최대 크기 (base64 글자 수 기준, 약 3MB)
const TIMEOUT_MS = 25000;       // AI 응답 최대 대기 시간 (25초)

// ----- JSON으로 응답 보내는 도우미 -----
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// ----- 요청 본문(body) 읽기 -----
// Vercel은 req.body를 미리 읽어주지만, 로컬 개발 서버는 직접 읽어야 해서 둘 다 처리
function readBody(req) {
  if (req.body !== undefined) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  }
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_IMAGE + 100000) { // 너무 큰 요청은 중간에 끊음
        reject(new Error('요청이 너무 커요.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')); }
      catch (e) { reject(new Error('JSON 형식이 아니에요.')); }
    });
    req.on('error', reject);
  });
}

// ----- 메인 함수: Vercel이 요청이 올 때마다 이 함수를 실행 -----
module.exports = async function handler(req, res) {
  // POST 요청만 받음
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 가능해요.' });

  // 서버에 API 키가 있는지 확인
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return send(res, 500, { error: '서버에 OPENROUTER_API_KEY가 설정되지 않았어요.' });

  // 요청 내용 읽기
  let body;
  try { body = await readBody(req); }
  catch (e) { return send(res, 400, { error: e.message }); }

  // 입력값 검사
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!text && !image) return send(res, 400, { error: '문자 내용이나 이미지를 보내주세요.' });
  if (image && !/^data:image\/(png|jpe?g|webp);base64,/.test(image)) {
    return send(res, 400, { error: '이미지는 PNG·JPG·WEBP만 가능해요.' });
  }
  if (image.length > MAX_IMAGE) return send(res, 413, { error: '이미지가 너무 커요.' });

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  // 테스트할 때 가짜 서버로 바꿀 수 있게 주소도 환경변수로 받음
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  // 25초 넘게 응답이 없으면 요청 취소
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

  try {
    // OpenRouter에 분석 요청
    const aiRes = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'X-Title': 'Smishing X-ray'           // OpenRouter 대시보드에 표시될 앱 이름
      },
      body: JSON.stringify({
        model: model,
        messages: buildMessages({ text: text, image: image }),
        temperature: 0.2                      // 낮을수록 매번 비슷하게 답함 (분석용이라 낮게)
      }),
      signal: controller.signal
    });

    const data = await aiRes.json().catch(function () { return {}; });

    // OpenRouter가 오류를 돌려준 경우
    if (!aiRes.ok) {
      const msg = (data.error && data.error.message) || '알 수 없는 오류';
      const hint = aiRes.status === 429 ? ' (무료 모델 사용량 초과 — 잠시 후 다시 시도하세요)' : '';
      return send(res, 502, { error: 'AI 서버 오류 ' + aiRes.status + ': ' + msg + hint });
    }

    // AI 답변 꺼내기 → JSON 해석 → 검증
    const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) return send(res, 502, { error: 'AI가 빈 답변을 보냈어요.' });

    const result = validateResult(parseModelJson(raw), text);
    result.model = model;                     // 어떤 모델로 분석했는지 화면에 표시하려고 같이 보냄
    return send(res, 200, result);
  } catch (err) {
    if (err.name === 'AbortError') return send(res, 504, { error: 'AI 응답 시간이 초과됐어요.' });
    return send(res, 502, { error: 'AI 분석 실패: ' + err.message });
  } finally {
    clearTimeout(timer);                      // 타이머 정리
  }
};
