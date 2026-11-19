// ======================================================== // Vercel 서버리스 함수 설정 영역 구분선입니다.
// 행정안전부 기관코드 오픈API 프록시 핸들러                  // 핸들러 역할 설명 주석입니다.
// ======================================================== // 구분선입니다.

export default async function handler(req, res) { // Vercel 서버리스 요청 핸들러 함수를 정의합니다.
  const full_nm = req.query.full_nm || "행정안전부"; // 주소 쿼리로 전달된 기관명을 가져오며 없으면 기본값 '행정안전부'를 적용합니다.
  const moisKey = process.env.MOIS_KEY; // 환경변수에서 행정안전부 API 디코딩 인증키를 읽어옵니다.

  if (!moisKey) { // 서버 환경변수에 MOIS_KEY가 설정되어 있지 않은 경우 실행합니다.
    return res.status(500).json({ // 500 내부 서버 오류 상태코드와 함께 응답을 전송합니다.
      success: false, // 실패 상태 플래그입니다.
      message: "서버 환경변수(MOIS_KEY)가 설정되지 않았습니다. Vercel 또는 .env.local 설정을 확인해주세요." // 에러 안내 메시지입니다.
    }); // 응답 전송을 마칩니다.
  } // 조건문 블록을 닫습니다.

  const encodedKey = encodeURIComponent(moisKey); // 디코딩 키를 URL 쿼리용으로 안전하게 인코딩합니다.
  const encodedOrgName = encodeURIComponent(full_nm); // 검색할 기관명을 안전하게 URL 인코딩합니다.
  const targetUrl = `https://apis.data.go.kr/1741000/StanOrgCd2?serviceKey=${encodedKey}&type=json&pageNo=1&numOfRows=3&stop_selt=0&full_nm=${encodedOrgName}`; // 공공데이터포털 행안부 기관코드 API 주소를 조합합니다.

  try { // 외부 API 통신 및 데이터 파싱 시도 블록입니다.
    const apiResponse = await fetch(targetUrl); // 행안부 공공데이터 API 서버로 비동기 HTTP 요청을 전송합니다.
    const textData = await apiResponse.text(); // XML 에러 응답 가능성에 대비해 먼저 원문 텍스트로 수신합니다.

    let jsonData; // 파싱된 JSON 데이터를 담을 변수입니다.
    try { // JSON 변환 시도 블록입니다.
      jsonData = JSON.parse(textData); // 원문 텍스트를 JSON 객체로 파싱합니다.
    } catch (parseError) { // XML 응답이거나 올바른 JSON 형식이 아닐 때 에러를 포착합니다.
      return res.status(400).json({ // 400 클라이언트/인증 오류 상태코드와 함께 응답합니다.
        success: false, // 실패 플래그입니다.
        message: "기관 조회 인증키 또는 요청값을 확인해주세요", // 요구사항에 명시된 필수 한국어 에러 메시지입니다.
        raw: textData // 디버깅을 위해 수신된 원본 텍스트를 함께 제공합니다.
      }); // 응답 블록을 닫습니다.
    } // 파싱 예외 처리 블록을 닫습니다.

    const headerResult = jsonData?.StanOrgCd?.[0]?.head?.[3]?.RESULT || jsonData?.RESULT; // 응답 헤더 내 결과 객체를 안전하게 추출합니다.
    const resultCode = headerResult?.["RESULT.CODE"] || headerResult?.code || jsonData?.resultCode; // 결과 코드 문자열을 취득합니다.
    const rows = jsonData?.StanOrgCd?.[1]?.row || jsonData?.row || []; // 기관 데이터 행 배열을 추출합니다.

    if (resultCode && resultCode !== "INFO-0" && resultCode !== "00") { // 결과 코드가 정상이 아닌 경우 실행합니다.
      return res.status(200).json({ // 200 상태코드와 함께 실패 사유를 반환합니다.
        success: false, // 실패 상태 플래그입니다.
        message: `공공데이터포털 응답 오류: ${headerResult?.["RESULT.MESSAGE"] || "인증키 또는 요청값이 올바르지 않습니다."}`, // 오류 상세 메시지입니다.
        resultCode: resultCode // 확인된 결과 코드입니다.
      }); // 응답 블록을 닫습니다.
    } // 조건문을 닫습니다.

    if (!Array.isArray(rows) || rows.length === 0) { // 검색된 기관 목록이 비어 있거나 없는 경우입니다.
      return res.status(200).json({ // 정상 응답 안에 결과 없음을 담아 전달합니다.
        success: false, // 미등록 상태를 알리는 플래그입니다.
        message: "조회 결과 없음(미등록 의심 기관)", // 요구사항에 맞춘 한국어 안내 메시지입니다.
        data: [] // 빈 배열 데이터를 반환합니다.
      }); // 응답을 마칩니다.
    } // 조건문을 닫습니다.

    return res.status(200).json({ // 유효한 기관 정보가 정상 조회된 경우 실행합니다.
      success: true, // 성공 상태 플래그입니다.
      message: `정식 등록 기관 확인 (${rows[0].full_nm || full_nm})`, // 성공 확인 메시지입니다.
      data: rows // 조회된 기관 상세 정보 목록입니다.
    }); // 응답을 마칩니다.
  } catch (error) { // 네트워크 오류 등 예외 발생 시 포착합니다.
    return res.status(500).json({ // 500 내부 에러로 클라이언트에 전달합니다.
      success: false, // 실패 플래그입니다.
      message: "기관코드 API 서버와의 통신 중 문제가 발생했습니다.", // 에러 안내 메시지입니다.
      error: error.message // 에러 원인 메시지입니다.
    }); // 응답을 마칩니다.
  } // try-catch 블록을 닫습니다.
} // handler 함수를 종료합니다.

