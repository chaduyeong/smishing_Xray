// ======================================================== // Vercel 서버리스 함수 설정 영역 구분선입니다.
// OpenRouter AI API 연동 문맥 및 멀티모달(Vision) 분석 핸들러 // 핸들러 역할 설명 주석입니다.
// ======================================================== // 구분선입니다.

// 기본 사용할 OpenRouter AI 모델 식별자 (환경변수 미설정 시 기본값) // 모델 상수 정의 주석입니다.
const DEFAULT_AI_MODEL = "nvidia/nemotron-3.5-super-vl:free"; // Vision(이미지)과 고성능 추론을 지원하는 무료 모델입니다.

// [통합 수정] 프로젝트 전체를 CommonJS 방식(require/module.exports)으로 통일해서 export default 대신 module.exports를 씁니다.
module.exports = async function handler(req, res) { // Vercel 서버리스 HTTP 요청 핸들러 함수입니다.
  // 1. 요청 메서드 검증 (POST 요청만 허용)                      // HTTP 메서드 검증 주석입니다.
  if (req.method !== "POST") { // POST 방식이 아닌 경우입니다.
    return res.status(405).json({ // 405 Method Not Allowed 상태코드를 반환합니다.
      success: false, // 실패 상태 플래그입니다.
      message: "POST 요청만 허용됩니다." // 안내 메시지입니다.
    }); // 응답 전송을 마칩니다.
  } // 조건문 블록을 닫습니다.

  // 2. OpenRouter API 키 및 모델 환경변수 확인                  // 환경변수 확인 주석입니다.
  const apiKey = process.env.OPENROUTER_API_KEY; // 서버 환경변수에서 OpenRouter API 키를 읽어옵니다.
  const model = process.env.OPENROUTER_MODEL || DEFAULT_AI_MODEL; // 지정된 모델 또는 기본 모델을 선택합니다.

  if (!apiKey) { // 서버에 API 키가 설정되지 않은 경우입니다.
    return res.status(200).json({ // 클라이언트 중단을 막기 위해 200 상태코드와 폴백 플래그를 반환합니다.
      success: false, // 실패 플래그입니다.
      errorCode: "API_KEY_MISSING", // 오류 코드입니다.
      message: "OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다. .env.local 설정을 확인해주세요.", // 안내 메시지입니다.
      fallbackRequired: true // 규칙 기반 분석으로 폴백하도록 지시합니다.
    }); // 응답 전송을 마칩니다.
  } // 조건문 블록을 닫습니다.

  // 3. 요청 본문 데이터 추출 (텍스트 및 base64 이미지)            // 입력 파라미터 추출 주석입니다.
  const { text = "", image = null } = req.body || {}; // 요청 바디에서 text와 image(DataURL base64)를 분리 추출합니다.
  const trimmedText = String(text || "").trim(); // 텍스트 앞뒤 공백을 제거합니다.

  if (!trimmedText && !image) { // 텍스트와 이미지 둘 다 없는 경우입니다.
    return res.status(200).json({ // 200 상태코드로 폴백을 유도합니다.
      success: false, // 실패 플래그입니다.
      message: "분석할 메시지 텍스트 또는 캡처 이미지를 제공해주세요.", // 안내 메시지입니다.
      fallbackRequired: true // 폴백 플래그입니다.
    }); // 응답 전송을 마칩니다.
  } // 조건문 블록을 닫습니다.

  // 4. 시스템 프롬프트 구성 (추론 토큰 절약 및 엄격한 JSON 강제) // 프롬프트 구성 주석입니다.
  const systemPrompt = `당신은 대한민국 최고 수준의 사이버 범죄 분석관이자 스미싱/보이스피싱 전문 탐지 AI입니다.
불필요한 생각 과정(reasoning)을 길게 쓰지 마시고, 즉시 유효한 JSON 형식으로만 응답해야 합니다.

[분석 요구사항]
1. 원문 텍스트 내에서 아래 3가지 카테고리에 해당하는 요소를 정확히 탐지하고, 원문에 실제로 등장하는 '정확한 부분 문자열(exact substring)'과 구체적인 위험 근거(reason)를 작성하십시오.
   - "org" (사칭 기관 의심): 문맥상 사칭하고 있는 공공기관, 금융기관, 수사기관, 공기업, 택배사 등 (예: 서울중앙지검, 대검찰청, 금융감독원, 국민건강보험공단, 우체국, 국민은행 등)
   - "link" (위험 링크/IP 의심): 단축 URL, 피싱 도메인, IP 주소 또는 공백/특수문자로 교묘히 변형된 웹 링크
   - "pattern" (범죄 수법 패턴): 긴급성 조장(계좌동결, 구속영장 등), 금전/개인정보 요구, 악성 앱 설치 유도, 저금리 대환대출, 부고장/청첩장 사칭 등 범죄 수법 문구

2. 이미지(Vision)가 제공된 경우:
   - 이미지 속의 모든 텍스트를 읽어 "extracted_text"에 담으십시오.
   - 위조된 공문 직인, 경찰/검찰 마크 도용, 가짜 알림창 UI 등 시각적인 사기 요소가 있는지 분석하여 "visual_analysis"에 한국어로 요약하십시오.
   - 텍스트만 제공된 경우 "extracted_text"는 원문 텍스트, "visual_analysis"는 null로 설정하십시오.

3. 종합 위험도 판정:
   - "risk_level": "critical"(사칭기관과 위험링크 동시 존재 등 최고위험), "danger"(사칭기관 또는 위험링크 중 하나 이상 존재), "warning"(의심 수법 패턴 위주), "safe"(정상 메시지)
   - "confidence": 0.0 ~ 1.0 사이의 수치
   - "threat_type": 가장 대표적인 범죄 수법 명칭 (예: "기관사칭형 보이스피싱", "스미싱 (정보탈취 연계형)", "대출사기형 보이스피싱", "메신저피싱", "정상 안내")
   - "summary": 일반인이 이해하기 쉬운 1~2문장의 구체적인 위험 사유 및 대처 요령

[출력 형식 제한]
반드시 유효한 순수 JSON만 출력하십시오.
{
  "extracted_text": "원문 또는 이미지에서 추출된 전체 텍스트",
  "visual_analysis": "시각적 사기 요소 설명 또는 null",
  "items": [
    {
      "category": "org" | "link" | "pattern",
      "target_text": "원문 내 정확한 일치 단어 (exact substring)",
      "reason": "해당 단어가 위험한 구체적 문맥적 근거"
    }
  ],
  "ai_verdict": {
    "risk_level": "critical" | "danger" | "warning" | "safe",
    "confidence": 0.95,
    "threat_type": "기관사칭형 보이스피싱",
    "summary": "종합 위험 분석 요약"
  }
}`; // 시스템 프롬프트 정의를 마칩니다.

  // 5. 멀티모달(Vision) 및 텍스트 메시지 페이로드 구성         // 메시지 페이로드 주석입니다.
  const userContent = []; // OpenAI / OpenRouter 호환 content 배열을 선언합니다.

  if (trimmedText) { // 사용자가 입력한 텍스트가 있는 경우입니다.
    userContent.push({ // 텍스트 객체를 content 배열에 추가합니다.
      type: "text", // 텍스트 타입입니다.
      text: `[분석 대상 텍스트]\n${trimmedText}` // 분석할 본문 텍스트입니다.
    }); // 텍스트 추가를 닫습니다.
  } // 조건문을 닫습니다.

  if (image) { // 이미지 데이터가 있는 경우입니다.
    userContent.push({ // 이미지 객체를 content 배열에 추가합니다.
      type: "image_url", // 이미지 URL 타입입니다.
      image_url: { // 세부 이미지 URL 객체입니다.
        url: image // data:image/...;base64,... 형식의 Data URL입니다.
      } // 객체 설정을 닫습니다.
    }); // 이미지 추가를 닫습니다.
    if (!trimmedText) { // 텍스트 없이 이미지만 전달된 경우 안내 문구를 추가합니다.
      userContent.push({ // 지시문 텍스트를 추가합니다.
        type: "text", // 텍스트 타입입니다.
        text: "첨부된 캡처 이미지 속의 텍스트를 정확히 추출하고, 시각적 요소와 문맥을 분석하여 피싱/스미싱 여부를 정밀 판별해주세요." // 분석 지시문입니다.
      }); // 지시문 추가를 닫습니다.
    } // 조건문을 닫습니다.
  } // 조건문을 닫습니다.

  // 6. OpenRouter API 비동기 호출                               // OpenRouter 통신 주석입니다.
  const controller = new AbortController(); // 타임아웃 제어를 위한 컨트롤러를 생성합니다.
  const timeoutId = setTimeout(() => controller.abort(), 28000); // 28초 타임아웃을 설정합니다.

  try { // 비동기 API 요청 시도 블록입니다.
    // [통합 수정] 수법 DNA API와 똑같이 OPENROUTER_BASE_URL 환경변수로 주소를 바꿀 수 있게 했습니다 (자동 테스트 때 가짜 AI 서버로 연결하는 용도).
    const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"; // 기본값은 진짜 OpenRouter 주소입니다.
    const openRouterResponse = await fetch(`${openRouterBaseUrl}/chat/completions`, { // OpenRouter 엔드포인트로 요청을 보냅니다.
      method: "POST", // POST 전송 방식을 사용합니다.
      headers: { // 요청 헤더 목록입니다.
        "Authorization": `Bearer ${apiKey}`, // Bearer 인증 헤더에 API 키를 전달합니다.
        "Content-Type": "application/json", // JSON 전송 형식 헤더입니다.
        "HTTP-Referer": req.headers.origin || "https://smishing-xray.vercel.app", // 리퍼러 헤더입니다.
        "X-Title": "Smishing X-ray Scanner" // 서비스 타이틀입니다.
      }, // 헤더 설정을 마칩니다.
      body: JSON.stringify({ // 본문 데이터를 JSON 문자열로 직렬화합니다.
        model: model, // 환경변수 또는 기본 설정된 AI 모델입니다.
        messages: [ // 대화 메시지 목록입니다.
          { role: "system", content: systemPrompt }, // 시스템 프롬프트입니다.
          { role: "user", content: userContent } // 멀티모달 사용자 입력 내용입니다.
        ], // 메시지 배열을 마칩니다.
        temperature: 0.1, // 정밀하고 일관된 출력을 위해 낮은 온도를 적용합니다.
        max_tokens: 4000 // Nemotron의 reasoning_tokens(약 1000~1300개) 소모 후에도 JSON이 잘리지 않도록 4000으로 충분히 설정합니다.
      }), // 바디 구성을 마칩니다.
      signal: controller.signal // 타임아웃 시그널을 연동합니다.
    }); // fetch 호출을 마칩니다.

    clearTimeout(timeoutId); // 타임아웃 타이머를 해제합니다.

    if (!openRouterResponse.ok) { // OpenRouter API에서 에러 응답(429, 500 등)을 반환한 경우입니다.
      const errorText = await openRouterResponse.text().catch(() => ""); // 에러 본문을 읽어옵니다.
      let parsedErr = {}; // 파싱된 에러 객체 변수입니다.
      try { parsedErr = JSON.parse(errorText); } catch (_) {} // JSON 파싱을 시도합니다.
      const errorMsg = parsedErr?.error?.message || errorText || `OpenRouter API 오류 (상태코드: ${openRouterResponse.status})`; // 에러 메시지입니다.

      return res.status(200).json({ // 프론트엔드가 멈추지 않고 로컬 규칙 분석으로 전환할 수 있게 200으로 반환합니다.
        success: false, // 실패 플래그입니다.
        errorCode: "OPENROUTER_API_ERROR", // 오류 식별자입니다.
        statusCode: openRouterResponse.status, // 상태코드입니다.
        message: errorMsg, // 에러 설명 메시지입니다.
        fallbackRequired: true // 자동 폴백 지시 플래그입니다.
      }); // 응답 전송을 마칩니다.
    } // 조건문 블록을 닫습니다.

    const completionData = await openRouterResponse.json(); // 응답 본문을 JSON 객체로 파싱합니다.
    const rawContent = completionData?.choices?.[0]?.message?.content || ""; // 모델이 반환한 답변 텍스트를 추출합니다.

    // 7. AI 응답에서 순수 JSON 부분 추출 및 안전 파싱            // JSON 파싱 주석입니다.
    let parsedJson = null; // 파싱된 JSON 결과를 담을 변수입니다.
    try { // 직접 JSON 파싱을 시도합니다.
      parsedJson = JSON.parse(rawContent.trim()); // 공백 제거 후 파싱합니다.
    } catch (e1) { // 마크다운 코드블록 등으로 인해 직접 파싱에 실패한 경우 정규식으로 추출합니다.
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i); // 마크다운 ```json ... ``` 블록을 찾습니다.
      if (jsonMatch && jsonMatch[1]) { // 매칭된 내부 문자열이 있는 경우입니다.
        try { // 내부 문자열 파싱 시도 블록입니다.
          parsedJson = JSON.parse(jsonMatch[1].trim()); // 코드블록 내부 내용을 JSON으로 파싱합니다.
        } catch (e2) { // 여전히 실패한 경우 중괄호 구간 추출을 시도합니다.
          const firstBrace = rawContent.indexOf("{"); // 첫 중괄호 인덱스입니다.
          const lastBrace = rawContent.lastIndexOf("}"); // 마지막 중괄호 인덱스입니다.
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) { // 유효한 중괄호 쌍이 있는 경우입니다.
            parsedJson = JSON.parse(rawContent.substring(firstBrace, lastBrace + 1)); // 중괄호 구간만 잘라 파싱합니다.
          } // 조건문을 닫습니다.
        } // 내부 catch를 닫습니다.
      } else { // 코드블록조차 없는 경우 중괄호 구간 탐색을 시도합니다.
        const firstBrace = rawContent.indexOf("{"); // 첫 중괄호 위치입니다.
        const lastBrace = rawContent.lastIndexOf("}"); // 마지막 중괄호 위치입니다.
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) { // 중괄호가 존재하는 경우입니다.
          parsedJson = JSON.parse(rawContent.substring(firstBrace, lastBrace + 1)); // 중괄호 영역을 파싱합니다.
        } // 조건문을 닫습니다.
      } // 조건 분기를 마칩니다.
    } // 최외곽 catch를 닫습니다.

    if (!parsedJson) { // JSON 추출에 실패한 경우입니다.
      return res.status(200).json({ // 200 상태코드로 실패 플래그와 원문 텍스트를 반환해 폴백을 유도합니다.
        success: false, // 실패 플래그입니다.
        errorCode: "JSON_PARSE_FAILED", // 파싱 실패 코드입니다.
        message: "AI 모델 응답을 JSON 형식으로 변환하지 못했습니다.", // 안내 메시지입니다.
        rawOutput: rawContent, // 원본 응답 내용입니다.
        fallbackRequired: true // 폴백 필요 플래그입니다.
      }); // 응답을 마칩니다.
    } // 조건문을 닫습니다.

    // 8. 파싱된 데이터 규격 정규화 및 방어적 보정                 // 데이터 보정 주석입니다.
    const normalizedResult = { // 정규화된 결과 객체를 구성합니다.
      extracted_text: parsedJson.extracted_text || trimmedText || "", // 추출된 텍스트 또는 입력 원문입니다.
      visual_analysis: parsedJson.visual_analysis || null, // 시각적 분석 내용입니다.
      items: Array.isArray(parsedJson.items) ? parsedJson.items.map(item => ({ // 탐지 항목 배열을 안전하게 매핑합니다.
        category: (item.category === "org" || item.category === "link" || item.category === "pattern") ? item.category : "pattern", // 카테고리를 표준화합니다.
        target_text: String(item.target_text || "").trim(), // 추출된 정확한 부분 문자열입니다.
        reason: String(item.reason || "문맥상 의심 요소가 감지되었습니다.").trim() // 구체적 사유입니다.
      })).filter(it => it.target_text.length > 0) : [], // 빈 텍스트 항목은 제외합니다.
      ai_verdict: { // 종합 위험도 객체입니다.
        risk_level: ["critical", "danger", "warning", "safe"].includes(parsedJson.ai_verdict?.risk_level) ? parsedJson.ai_verdict.risk_level : "warning", // 유효 등급입니다.
        confidence: typeof parsedJson.ai_verdict?.confidence === "number" ? parsedJson.ai_verdict.confidence : 0.9, // 신뢰도 수치입니다.
        threat_type: parsedJson.ai_verdict?.threat_type || "피싱 의심 수법", // 위협 유형 명칭입니다.
        summary: parsedJson.ai_verdict?.summary || "문맥 분석 결과 주의가 필요한 메시지입니다." // 요약문입니다.
      } // 위험도 객체를 닫습니다.
    }; // 정규화 객체 구성을 마칩니다.

    return res.status(200).json({ // 200 성공 상태코드와 함께 클라이언트로 응답을 전송합니다.
      success: true, // 성공 상태 플래그입니다.
      modelUsed: model, // 사용된 AI 모델 명칭입니다.
      data: normalizedResult // 정규화된 최종 분석 데이터입니다.
    }); // 응답 전송을 마칩니다.

  } catch (error) { // 네트워크 단절 또는 타임아웃 등 예외 발생 시 포착합니다.
    clearTimeout(timeoutId); // 타임아웃 타이머를 정리합니다.
    const isTimeout = error.name === "AbortError"; // 타임아웃 여부를 판별합니다.
    return res.status(200).json({ // 프론트엔드가 중단 없이 로컬 분석으로 계속 진행하도록 200 상태코드로 반환합니다.
      success: false, // 실패 상태 플래그입니다.
      errorCode: isTimeout ? "AI_TIMEOUT" : "SERVER_ERROR", // 오류 코드입니다.
      message: isTimeout ? "AI 모델 응답 시간이 초과되었습니다 (28초 제한)." : `AI 분석 요청 실패: ${error.message}`, // 상세 에러 메시지입니다.
      fallbackRequired: true // 폴백 필요 플래그를 전달합니다.
    }); // 응답 전송을 마칩니다.
  } // try-catch 블록을 마칩니다.
} // handler 함수를 종료합니다.
