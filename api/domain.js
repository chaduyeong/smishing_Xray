// ======================================================== // Vercel 서버리스 함수 설정 영역 구분선입니다.
// 한국인터넷진흥원(KISA) WHOIS 인터넷주소 오픈API 프록시    // 핸들러 역할 설명 주석입니다.
// ======================================================== // 구분선입니다.

export default async function handler(req, res) { // Vercel 서버리스 요청 핸들러 함수를 정의합니다.
  const query = req.query.query || "kisa.or.kr"; // 주소 쿼리로 전달된 도메인/IP를 가져오며 없으면 기본값 'kisa.or.kr'을 지정합니다.
  const kisaKey = process.env.KISA_KEY; // 환경변수에서 KISA WHOIS API 디코딩 인증키를 읽어옵니다.

  if (!kisaKey) { // 서버 환경변수에 KISA_KEY가 설정되어 있지 않은 경우 실행합니다.
    return res.status(500).json({ // 500 내부 서버 오류 상태코드와 함께 응답합니다.
      success: false, // 실패 상태 플래그입니다.
      status: "config_error", // 설정 오류 식별자입니다.
      errorCode: "KEY_MISSING", // 오류 코드입니다.
      errorReason: "KISA_KEY 환경변수 미설정", // 오류 사유입니다.
      message: "서버 환경변수(KISA_KEY)가 설정되지 않았습니다. Vercel 또는 .env.local 설정을 확인해주세요." // 에러 안내 메시지입니다.
    }); // 응답 전송을 마칩니다.
  } // 조건문 블록을 닫습니다.

  // 1. 순수 도메인(호스트명) 추출 정제 (스킴, 경로, 쿼리스트링, 포트번호 제거) // 도메인 정제 주석입니다.
  let cleanTarget = String(query).trim(); // 입력값을 문자열로 변환하고 양끝 공백을 제거합니다.
  cleanTarget = cleanTarget.replace(/^[a-zA-Z]+:\/\//i, ""); // http://, https:// 등 프로토콜 스킴을 제거합니다.
  cleanTarget = cleanTarget.split(/[\/?#]/)[0]; // 하위 경로(/...), 쿼리(?...), 해시(#...)를 분리 제거합니다.
  cleanTarget = cleanTarget.split(":")[0]; // 포트번호(:8080 등)가 붙어 있을 경우 제거합니다.
  cleanTarget = cleanTarget.replace(/^\.+|\.+$/g, ""); // 앞뒤에 붙은 불필요한 마침표를 제거합니다.
  cleanTarget = cleanTarget.toLowerCase(); // 소문자로 통일하여 정규화합니다.
  if (!cleanTarget) cleanTarget = "kisa.or.kr"; // 정제 후 빈 문자열이면 기본 도메인으로 복원합니다.

  const encodedKey = encodeURIComponent(kisaKey); // 디코딩 인증키를 안전하게 URL 인코딩합니다.
  const encodedQuery = encodeURIComponent(cleanTarget); // 정제된 순수 도메인을 URL 인코딩합니다.
  const targetUrl = `https://apis.data.go.kr/B551505/whois?serviceKey=${encodedKey}&query=${encodedQuery}&answer=json`; // KISA WHOIS 공식 API 주소를 조합합니다.

  try { // 외부 공공데이터 API 통신 및 파싱 시도 블록입니다.
    const apiResponse = await fetch(targetUrl); // KISA 공공데이터 서버로 비동기 HTTP 요청을 전송합니다.
    const textData = await apiResponse.text(); // XML 에러 응답 수신에 대비하여 원문 텍스트로 먼저 수신합니다.

    let jsonData; // 파싱된 JSON 데이터를 보관할 변수입니다.
    try { // JSON 변환 시도 블록입니다.
      jsonData = JSON.parse(textData); // 원문 텍스트를 JSON 객체로 파싱합니다.
    } catch (parseError) { // JSON 파싱 실패(공공데이터포털 XML 에러 등) 시 실행합니다.
      const returnReasonCodeMatch = textData.match(/<returnReasonCode>(.*?)<\/returnReasonCode>/i); // XML 내부 오류코드를 정규식으로 추출합니다.
      const returnAuthMsgMatch = textData.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/i); // XML 내부 인증메시지를 추출합니다.
      const errMsgMatch = textData.match(/<errMsg>(.*?)<\/errMsg>/i); // XML 내부 에러메시지를 추출합니다.
      const xmlErrorCode = returnReasonCodeMatch ? returnReasonCodeMatch[1].trim() : (returnAuthMsgMatch ? returnAuthMsgMatch[1].trim() : "XML_ERROR"); // 추출된 에러코드입니다.
      const xmlErrorReason = errMsgMatch ? errMsgMatch[1].trim() : (returnAuthMsgMatch ? returnAuthMsgMatch[1].trim() : "공공데이터포털 인증/요청 에러"); // 추출된 상세 사유입니다.

      return res.status(400).json({ // 400 클라이언트/인증 오류 상태코드로 응답합니다.
        success: false, // 실패 플래그입니다.
        status: "api_error", // API 에러 상태입니다.
        errorCode: xmlErrorCode, // 구체적인 API 에러 코드입니다.
        errorReason: xmlErrorReason, // 구체적인 API 에러 사유입니다.
        message: `도메인 조회 인증키 또는 요청값을 확인해주세요 (오류코드: ${xmlErrorCode}, 사유: ${xmlErrorReason})`, // 상세 에러 메시지입니다.
        raw: textData // 수신된 원본 텍스트를 디버깅용으로 첨부합니다.
      }); // 응답 블록을 닫습니다.
    } // 파싱 예외 처리 블록을 닫습니다.

    const responseRoot = jsonData?.response || jsonData?.whois; // 응답 본문 루트 객체를 안전하게 참조합니다.
    const resultCode = responseRoot?.header?.resultCode || jsonData?.resultCode; // 결과 코드를 추출합니다.
    const resultMsg = responseRoot?.header?.resultMsg || jsonData?.resultMsg || "정상 응답 아님"; // 결과 메시지를 추출합니다.
    const whoisInfo = responseRoot?.whois || jsonData?.whois || responseRoot; // WHOIS 상세 정보 객체를 추출합니다.

    if (resultCode && resultCode !== "00" && resultCode !== "INFO-0") { // 응답 본문 내 결과 코드가 정상이 아닌 경우입니다.
      return res.status(200).json({ // 200 상태코드와 함께 실패 사유를 상세히 반환합니다.
        success: false, // 실패 플래그입니다.
        status: "api_error", // API 에러 상태입니다.
        errorCode: resultCode, // KISA 반환 결과 코드입니다.
        errorReason: resultMsg, // KISA 반환 결과 사유입니다.
        message: `KISA 조회 오류 [코드: ${resultCode}] - ${resultMsg}` // 상세 한국어 안내 문구입니다.
      }); // 응답 블록을 닫습니다.
    } // 조건문을 닫습니다.

    const koreanInfo = whoisInfo?.korean || {}; // 한국어 등록 정보 객체입니다.
    const englishInfo = whoisInfo?.english || {}; // 영어 등록 정보 객체입니다.
    const regName = koreanInfo.regName || whoisInfo.regName || englishInfo.regName || whoisInfo.agency || ""; // 등록인 명칭을 추출합니다.
    const regDate = koreanInfo.regDate || whoisInfo.regDate || whoisInfo.reg_date || englishInfo.regDate || ""; // 등록일자 정보를 추출합니다.
    const agency = koreanInfo.agency || whoisInfo.agency || englishInfo.agency || ""; // 등록대행자 명칭을 추출합니다.

    if (!whoisInfo || whoisInfo.registry === "NONE" || whoisInfo.error_code || (!regName && !regDate)) { // 조회 결과가 없거나 미등록/에러 상태인 경우입니다.
      return res.status(200).json({ // 정상 응답 안에 미등록 상태를 담아 전달합니다.
        success: false, // 미등록 상태를 알리는 플래그입니다.
        status: "not_found", // 미등록 식별자입니다.
        errorCode: "NOT_REGISTERED", // 미등록 코드입니다.
        errorReason: "KISA WHOIS 미등록 도메인", // 미등록 사유입니다.
        message: "조회 결과 없음(미등록 의심 인터넷 주소)", // 요구사항에 맞춘 한국어 안내 메시지입니다.
        data: null // 빈 데이터를 반환합니다.
      }); // 응답을 마칩니다.
    } // 조건문을 닫습니다.

    return res.status(200).json({ // 정상적으로 도메인/IP 등록 정보가 확인된 경우 실행합니다.
      success: true, // 성공 상태 플래그입니다.
      status: "verified", // 검증 완료 식별자입니다.
      message: `인터넷 등록 주소 확인 (${cleanTarget})`, // 성공 확인 메시지입니다.
      data: { // WHOIS 핵심 등록 상세 데이터 객체입니다.
        domain: cleanTarget, // 조회된 순수 도메인입니다.
        regName: regName || "등록인 확인됨", // 등록인 명칭입니다.
        regDate: regDate || "등록일 확인됨", // 등록일자입니다.
        agency: agency || "대행자 확인됨" // 등록대행자입니다.
      } // 객체 대입을 닫습니다.
    }); // 응답을 마칩니다.
  } catch (error) { // 네트워크 단절 등 예외 발생 시 포착합니다.
    return res.status(500).json({ // 500 내부 서버 오류를 반환합니다.
      success: false, // 실패 플래그입니다.
      status: "server_error", // 서버 에러 식별자입니다.
      errorCode: "NET_ERROR", // 네트워크 에러 코드입니다.
      errorReason: error.message, // 상세 원인입니다.
      message: "KISA 도메인 검색 서버와의 통신 중 문제가 발생했습니다.", // 에러 안내 메시지입니다.
      error: error.message // 에러 메시지입니다.
    }); // 응답을 마칩니다.
  } // try-catch 블록을 마칩니다.
} // handler 함수를 종료합니다.

