// ========================================================
// 신고패키지 자바스크립트 로직 (report.js, [통합] 원래 이름 script.js)
// --------------------------------------------------------
// 흐름: 캡처 이미지 업로드 → Tesseract OCR로 글자 읽기 → 수신 시각·발신 번호·URL 자동 추출
//       → 사용자가 확인·수정 → 신고용 증거 PDF(A4 한 장) 다운로드
// [통합] 추가한 것:
//   1) X-ray·수법 DNA 화면에서 넘겨받은 문자(와 캡처)를 자동으로 채움
//   2) 캡처 이미지가 없어도 문자 본문만 있으면 PDF를 만들 수 있게 함
// ========================================================

document.addEventListener("DOMContentLoaded", () => { // 화면(HTML)이 다 준비되면 실행
  // ----- 화면 요소 가져오기 -----
  const dropZone = document.getElementById("dropZone"); // 이미지 끌어다 놓는 상자
  const imageInput = document.getElementById("imageInput"); // 숨겨진 파일 선택 입력
  const dropPrompt = document.getElementById("dropPrompt"); // 업로드 전 안내 문구
  const previewWrapper = document.getElementById("previewWrapper"); // 미리보기 영역
  const imagePreview = document.getElementById("imagePreview"); // 미리보기 이미지
  const changeImageBtn = document.getElementById("changeImageBtn"); // '이미지 변경' 버튼

  const progressBox = document.getElementById("progressBox"); // OCR 진행 상황 상자
  const progressStatus = document.getElementById("progressStatus"); // 진행 상태 문구
  const progressPercent = document.getElementById("progressPercent"); // 진행 퍼센트 숫자
  const progressFill = document.getElementById("progressFill"); // 진행 막대

  const receivedTimeInput = document.getElementById("receivedTime"); // 수신 일시 입력칸
  const senderNumberInput = document.getElementById("senderNumber"); // 발신 번호 입력칸
  const suspectUrlInput = document.getElementById("suspectUrl"); // 의심 링크 입력칸
  const messageBodyInput = document.getElementById("messageBody"); // 문자 본문 입력칸
  const victimNotesInput = document.getElementById("victimNotes"); // 추가 메모 입력칸
  const generatePdfBtn = document.getElementById("generatePdfBtn"); // PDF 만들기 버튼

  // ----- PDF 서식 템플릿 요소 (화면에는 안 보이고 PDF 만들 때만 사용) -----
  const pdfPrintArea = document.getElementById("pdfPrintArea"); // PDF로 찍을 영역 전체
  const pdfDocDate = document.getElementById("pdfDocDate"); // 문서 생성 일시
  const pdfReceivedTime = document.getElementById("pdfReceivedTime"); // 문자 수신 시각
  const pdfSenderNumber = document.getElementById("pdfSenderNumber"); // 발신 번호
  const pdfSuspectUrl = document.getElementById("pdfSuspectUrl"); // 의심 URL
  const pdfVictimNotes = document.getElementById("pdfVictimNotes"); // 추가 메모
  const pdfMessageBody = document.getElementById("pdfMessageBody"); // 문자 본문
  const pdfEvidenceImage = document.getElementById("pdfEvidenceImage"); // 캡처 이미지
  const pdfNoImage = document.getElementById("pdfNoImage"); // [통합] 이미지 없을 때 안내 문구

  let currentImageDataUrl = null; // 지금 올라온 캡처 이미지 (data:image/... 글자 형태)

  // 1. 드롭존 클릭 시 파일 탐색기 열기
  dropZone.addEventListener("click", (e) => {
    // '이미지 변경' 버튼을 누른 게 아닐 때만 파일 선택창 열기
    if (e.target !== changeImageBtn) {
      imageInput.click(); // 숨겨진 파일 입력을 대신 눌러줌
    }
  });

  // '이미지 변경' 버튼: 드롭존 클릭과 겹치지 않게 막고 파일 선택창 열기
  changeImageBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // 드롭존 클릭 이벤트로 번지지 않게 함
    imageInput.click(); // 파일 선택창 열기
  });

  // 2. 드래그 앤 드롭 이벤트: 파일을 끌고 들어오면 상자 강조
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault(); // 브라우저가 파일을 그냥 열어버리는 기본 동작 막기
      e.stopPropagation(); // 이벤트 번짐 막기
      dropZone.classList.add("dragover"); // 강조 표시
    });
  });

  // 파일이 상자 밖으로 나가거나 놓이면 강조 해제
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault(); // 기본 동작 막기
      e.stopPropagation(); // 이벤트 번짐 막기
      dropZone.classList.remove("dragover"); // 강조 해제
    });
  });

  // 파일을 놓으면 첫 번째 파일 처리
  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files; // 놓은 파일 목록
    if (files && files.length > 0) {
      handleImageFile(files[0]); // 첫 번째 파일만 처리
    }
  });

  // 파일 선택창에서 파일을 고르면 처리
  imageInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFile(e.target.files[0]); // 고른 파일 처리
    }
  });

  // 3. 이미지 파일 처리 및 미리보기
  function handleImageFile(file) {
    if (!file.type.startsWith("image/")) { // 이미지가 아니면 거절
      alert("이미지 파일(JPG, PNG, WEBP 등)만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader(); // 파일을 읽는 브라우저 기능
    reader.onload = (e) => { // 다 읽으면 실행
      showImage(e.target.result); // [통합] 미리보기 표시를 함수로 분리 (넘겨받은 이미지에도 재사용)

      // OCR 분석 시작
      runOcrAnalysis(currentImageDataUrl);
    };
    reader.readAsDataURL(file); // 이미지를 data:image/... 글자로 읽기
  }

  // [통합] 이미지를 저장하고 미리보기에 보여주는 함수
  function showImage(dataUrl) {
    currentImageDataUrl = dataUrl; // 현재 이미지로 저장
    imagePreview.src = dataUrl; // 미리보기에 표시
    dropPrompt.style.display = "none"; // 업로드 안내 숨김
    previewWrapper.style.display = "flex"; // 미리보기 보이기
  }

  // 4. Tesseract.js 브라우저 OCR 실행 (인터넷에서 글자 인식 엔진을 받아와 내 브라우저에서 실행)
  async function runOcrAnalysis(imageSource) {
    // 프로그레스 바 표시
    progressBox.style.display = "block";
    updateProgress("AI OCR 분석 엔진을 불러오는 중...", 10);
    generatePdfBtn.disabled = true; // 분석 중에는 PDF 버튼 잠금

    try {
      // Tesseract v5 worker 생성 및 실행 (한국어 + 영어)
      const worker = await Tesseract.createWorker("kor+eng", 1, {
        logger: (m) => { // 진행 상황이 바뀔 때마다 호출됨
          if (m.status === "recognizing text") { // 글자 읽는 중
            const percent = Math.round(m.progress * 100);
            updateProgress(`문자 및 수신시각 분석 중... (${percent}%)`, percent);
          } else if (m.status === "loading tesseract core") { // 엔진 받는 중
            updateProgress("OCR 코어 모듈 로드 중...", 20);
          } else if (m.status === "loading language traineddata") { // 한글 데이터 받는 중
            updateProgress("한글/영문 인식 데이터셋 로드 중...", 40);
          } else if (m.status === "initializing api") { // 엔진 준비 중
            updateProgress("인식 엔진 초기화 중...", 60);
          }
        },
      });

      const { data: { text } } = await worker.recognize(imageSource); // 이미지에서 글자 읽기
      await worker.terminate(); // 다 쓴 엔진 정리

      updateProgress("분석 완료!", 100);
      setTimeout(() => {
        progressBox.style.display = "none"; // 1초 뒤 진행 상자 숨김
      }, 1000);

      // 5. 텍스트 파싱 및 폼 필드 자동 입력
      parseAndPopulateData(text);

      // PDF 다운로드 버튼 활성화
      generatePdfBtn.disabled = false;

    } catch (error) {
      console.error("OCR 분석 에러:", error);
      updateProgress("분석 중 오류가 발생했습니다. 직접 입력해주세요.", 0);
      alert("이미지 분석 중 오류가 발생했습니다. 직접 입력란에 작성하실 수 있습니다.");
      generatePdfBtn.disabled = false; // 직접 입력해서 PDF를 만들 수 있게 버튼은 열어둠
    }
  }

  // 진행률 업데이트 함수 (문구, 숫자, 막대 길이를 한 번에 바꿈)
  function updateProgress(statusText, percent) {
    progressStatus.textContent = statusText;
    progressPercent.textContent = `${percent}%`;
    progressFill.style.width = `${percent}%`;
  }

  // 5. 추출된 텍스트에서 시각, 전화번호, URL 등 정규표현식으로 추출
  function parseAndPopulateData(rawText) {
    messageBodyInput.value = rawText.trim(); // 본문 전체를 그대로 입력

    // (1) 수신 시각 및 날짜 탐색 패턴
    // 예: "2026-11-23 14:30", "11월 23일 오후 2:30", "14:25", "오후 3:12"
    const timeRegex = /(?:(\d{4}[.\-\/]\s*\d{1,2}[.\-\/]\s*\d{1,2}|\d{1,2}월\s*\d{1,2}일)\s*)?(?:(오전|오후|AM|PM)\s*)?(\d{1,2}[:시]\s*\d{1,2}(?:분)?)/i;
    const timeMatch = rawText.match(timeRegex);

    if (timeMatch) {
      receivedTimeInput.value = timeMatch[0].trim(); // 찾은 시각 입력
    } else {
      // 캡처에서 못 찾은 경우 현재 시각을 추천 값으로 설정
      const now = new Date();
      const currentFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      receivedTimeInput.value = `${currentFormatted} (캡처 시각 확인 필요)`;
    }

    // (2) 발신 전화번호 탐색 패턴
    // 예: 010-1234-5678, 1588-1234, 02-123-4567 등
    const phoneRegex = /(01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|15\d{2}[-.\s]?\d{4}|16\d{2}[-.\s]?\d{4}|18\d{2}[-.\s]?\d{4}|0[2-6]\d{1}[-.\s]?\d{3,4}[-.\s]?\d{4})/g;
    const phoneMatches = rawText.match(phoneRegex);
    if (phoneMatches && phoneMatches.length > 0) {
      senderNumberInput.value = phoneMatches[0].trim(); // 첫 번째 번호 입력
    }

    // (3) 피싱 의심 URL / 웹주소 탐색 패턴
    // http://..., https://..., bit.ly, me2.do, kisa, 각종 단축 도메인
    const urlRegex = /(https?:\/\/[^\s]+|(?:[a-zA-Z0-9-]+\.)+(?:kr|com|net|xyz|top|site|vip|cc|link|live|fun|me|info|biz|icu|shop|ru)(?:\/[^\s]*)?)/gi;
    const urlMatches = rawText.match(urlRegex);
    if (urlMatches && urlMatches.length > 0) {
      suspectUrlInput.value = urlMatches[0].trim(); // 첫 번째 링크 입력
    } else {
      suspectUrlInput.value = "감지된 링크 없음 (필요 시 직접 기재)";
    }

    // 추가 메모 기본 안내
    victimNotesInput.value = "의심 문자 수신 후 즉시 캡처하여 증거를 보존함.";
  }

  // [통합] 문자 본문을 직접 입력하면 이미지가 없어도 PDF 버튼을 쓸 수 있게 함
  messageBodyInput.addEventListener("input", () => {
    if (messageBodyInput.value.trim()) generatePdfBtn.disabled = false;
  });

  // 6. PDF 생성 및 다운로드 이벤트
  generatePdfBtn.addEventListener("click", () => {
    // [통합] 원래는 캡처 이미지가 꼭 있어야 했지만, 이제 이미지나 본문 중 하나만 있으면 됨
    if (!currentImageDataUrl && !messageBodyInput.value.trim()) {
      alert("먼저 캡처 이미지를 업로드하거나 문자 본문을 입력해주세요.");
      return;
    }

    // PDF 생성 중 버튼 상태 표시
    const originalBtnText = generatePdfBtn.innerHTML;
    generatePdfBtn.innerHTML = "⏳ PDF 문서를 생성하는 중입니다...";
    generatePdfBtn.disabled = true;

    // 현재 폼에 입력된 최종 데이터로 PDF 서식 템플릿 채우기
    const now = new Date();
    const formattedDate = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${now.getHours()}시 ${now.getMinutes()}분`;

    pdfDocDate.textContent = formattedDate;
    pdfReceivedTime.textContent = receivedTimeInput.value || "미기재";
    pdfSenderNumber.textContent = senderNumberInput.value || "미기재";
    pdfSuspectUrl.textContent = suspectUrlInput.value || "없음";
    pdfVictimNotes.textContent = victimNotesInput.value || "없음";
    pdfMessageBody.textContent = messageBodyInput.value || "본문 내용 없음";

    // [통합] 이미지가 있으면 이미지를, 없으면 '캡처 이미지 없음' 문구를 보여줌
    if (currentImageDataUrl) {
      pdfEvidenceImage.src = currentImageDataUrl;
      pdfEvidenceImage.style.display = "";
      pdfNoImage.style.display = "none";
    } else {
      pdfEvidenceImage.removeAttribute("src");
      pdfEvidenceImage.style.display = "none";
      pdfNoImage.style.display = "block";
    }

    // 화면 밖의 템플릿을 잠시 렌더링 가능하게 만듦
    pdfPrintArea.style.display = "block";

    // A4 픽셀 크기를 고정하고 이미지 디코딩 후 한 장의 PDF로 캡처
    const waitForPdfImage = currentImageDataUrl && pdfEvidenceImage.decode
      ? pdfEvidenceImage.decode().catch(() => undefined) // 이미지가 다 그려질 때까지 기다림
      : Promise.resolve(); // 이미지가 없으면 바로 진행

    waitForPdfImage
      .then(() => html2canvas(pdfPrintArea, { // 서식 영역을 그림으로 찍기
        scale: 2, // 2배 해상도로 선명하게
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: 794, // A4 가로 픽셀
        height: 1123, // A4 세로 픽셀
        windowWidth: 794,
        windowHeight: 1123,
        scrollX: 0,
        scrollY: 0
      }))
      .then((canvas) => {
        const { jsPDF } = window.jspdf; // PDF 만드는 라이브러리
        const pdf = new jsPDF({
          orientation: "portrait", // 세로 방향
          unit: "mm",
          format: "a4",
          compress: true
        });

        const imageData = canvas.toDataURL("image/jpeg", 0.98); // 찍은 그림을 JPEG로
        pdf.addImage(imageData, "JPEG", 0, 0, 210, 297); // A4(210×297mm) 한 장에 꽉 채움
        pdf.save(`신고패키지_증거자료_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.pdf`); // 다운로드
      })
      .then(() => {
        pdfPrintArea.style.display = "none"; // 서식 다시 숨김
        generatePdfBtn.innerHTML = originalBtnText; // 버튼 글자 원래대로
        generatePdfBtn.disabled = false;
        alert("✅ 신고용 증거 PDF가 성공적으로 다운로드되었습니다!\n우측 118(KISA) 또는 112(경찰청) 신고 시 해당 파일을 증거 자료로 첨부하세요.");
      })
      .catch((err) => {
        console.error("PDF 생성 실패:", err);
        pdfPrintArea.style.display = "none";
        generatePdfBtn.innerHTML = originalBtnText;
        generatePdfBtn.disabled = false;
        alert("PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
      });
  });

  // 7. [통합] X-ray 스캔·수법 DNA 화면에서 넘겨받은 문자(와 캡처) 자동 입력
  //    글자는 이미 읽혀 있으므로 OCR을 다시 돌리지 않고 바로 칸을 채움
  const handoff = window.Handoff ? window.Handoff.take() : null;
  if (handoff) {
    if (handoff.image) showImage(handoff.image); // 캡처도 같이 왔으면 미리보기에 표시
    parseAndPopulateData(handoff.text); // 수신 시각·번호·링크 자동 추출
    generatePdfBtn.disabled = false; // 바로 PDF를 만들 수 있게 버튼 열기
    window.Handoff.showNotice(
      document.getElementById("handoffNoticeArea"),
      handoff.from,
      handoff.image ? "캡처 이미지도 함께 가져왔어요." : "캡처 이미지는 없지만 PDF는 만들 수 있어요."
    );
  }
});
