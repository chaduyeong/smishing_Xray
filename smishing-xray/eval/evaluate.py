# -*- coding: utf-8 -*-
"""
evaluate.py — 수법 DNA 정확도 테스트 (4단계)
-------------------------------------------------------------------------
Hugging Face 'kor-smishing-message' 데이터셋(CSV)으로
  1) 키워드 규칙 분류기 → 데이터셋 전체로 정확도 측정 (빠르고 무료)
  2) AI 분석 API       → 샘플 일부로 정확도 측정 (무료 모델 사용량 제한 때문)
결과는 results 폴더에 저장한다.
  - results/report.md       : 정확도 요약 + 보고서(5-2)에 붙여넣을 테스트표
  - results/predictions.csv : 문자별 예측 결과 (엑셀로 열림)

실행 예시 (프로젝트 폴더에서):
  python eval/evaluate.py --csv 데이터파일.csv            ← AI 30개 + 규칙 전체
  python eval/evaluate.py --csv 데이터파일.csv --no-ai    ← 규칙만 (서버 필요 없음)
  python eval/evaluate.py --csv 데이터파일.csv --n 50     ← AI 샘플 50개
AI 테스트를 할 때는 다른 터미널에서 'npm run dev'로 서버를 켜두어야 한다.

외부 라이브러리 없이 파이썬 기본 기능만 사용한다 (pip 설치 필요 없음).
"""

import argparse
import csv
import hashlib
import json
import os
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

# ----- 경로 설정 -----
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 프로젝트 폴더
RESULTS_DIR = os.path.join(ROOT, "results")                         # 결과 저장 폴더
CACHE_FILE = os.path.join(RESULTS_DIR, "ai_cache.json")             # AI 결과 임시 저장 (이어하기용)
RULE_SCRIPT = os.path.join(ROOT, "eval", "rule_batch.js")           # 규칙 분류 도우미

# ----- 수법 DNA 사전에서 계열 이름 불러오기 (결과 표에 이름으로 보여주려고) -----
with open(os.path.join(ROOT, "data", "dna_families.json"), encoding="utf-8") as f:
    _dict = json.load(f)
FAMILY_NAMES = {fam["id"]: fam["emoji"] + " " + fam["name"] for fam in _dict["families"]}
FAMILY_NAMES["none"] = "❔ 해당 계열 없음"


def setup_console():
    """윈도우 터미널에서 한글이 깨지지 않게 출력 인코딩을 UTF-8로 설정"""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # 오래된 파이썬이면 그냥 넘어감


def parse_label(value):
    """데이터셋 라벨을 숫자로 통일: 스미싱 = 1, 정상 = 0, 모르는 값 = None"""
    v = str(value).strip().lower()
    if v in ("스미싱", "smishing", "1", "1.0", "spam", "phishing"):
        return 1
    if v in ("정상", "normal", "0", "0.0", "ham"):
        return 0
    return None


def read_dataset(path, text_col, label_col, type_col):
    """CSV 읽기 → [{text, label, type}] 목록 (빈 문자·라벨 이상·중복 문자는 제외)"""
    csv.field_size_limit(10 ** 7)  # 긴 칸이 있어도 오류 안 나게 한도 늘림

    rows = None
    # 대부분 UTF-8이지만, 엑셀로 저장한 파일은 CP949일 수 있어서 둘 다 시도
    for encoding in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=encoding, newline="") as f:
                reader = csv.DictReader(f)
                columns = reader.fieldnames or []
                rows = list(reader)
            break
        except UnicodeDecodeError:
            continue
    if rows is None:
        sys.exit("[오류] CSV 파일 인코딩을 읽을 수 없어요 (UTF-8 / CP949 아님).")

    # 필요한 칸이 있는지 확인
    for col in (text_col, label_col):
        if col not in columns:
            sys.exit("[오류] CSV에 '%s' 칸이 없어요. 있는 칸: %s\n"
                     "       --text-col / --label-col 옵션으로 칸 이름을 지정하세요." % (col, ", ".join(columns)))

    data, seen = [], set()
    skipped = Counter()
    for row in rows:
        text = (row.get(text_col) or "").strip()
        label = parse_label(row.get(label_col, ""))
        if not text:
            skipped["빈 문자"] += 1
            continue
        if label is None:
            skipped["라벨 이상"] += 1
            continue
        if text in seen:
            skipped["중복 문자"] += 1
            continue
        seen.add(text)
        data.append({"text": text, "label": label, "type": (row.get(type_col) or "").strip()})
    return data, skipped


def sample_balanced(data, n, seed):
    """스미싱·정상을 반반씩 무작위로 n개 뽑기 (seed가 같으면 매번 같은 샘플)"""
    rng = random.Random(seed)
    smishing = [d for d in data if d["label"] == 1]
    normal = [d for d in data if d["label"] == 0]
    half = n // 2
    picked = rng.sample(smishing, min(half, len(smishing))) + rng.sample(normal, min(n - half, len(normal)))
    rng.shuffle(picked)
    return picked


# =====================================================================
# 1) 규칙 분류기 실행
# =====================================================================

def run_rule(texts):
    """node로 eval/rule_batch.js를 실행해서 모든 문자를 한 번에 규칙 분류"""
    try:
        proc = subprocess.run(
            ["node", RULE_SCRIPT],
            input=json.dumps(texts).encode("utf-8"),  # 파이썬 → node로 문자 목록 전달
            capture_output=True,
            check=True,
        )
    except FileNotFoundError:
        sys.exit("[오류] node를 찾을 수 없어요. Node.js가 설치돼 있는지 확인하세요 (node -v).")
    except subprocess.CalledProcessError as e:
        sys.exit("[오류] 규칙 분류 실패:\n" + e.stderr.decode("utf-8", "replace"))
    return json.loads(proc.stdout.decode("utf-8"))


def rule_says_smishing(confidence):
    """규칙 분류기 판정 기준: 신뢰도 높음·보통이면 스미싱으로 봄"""
    return 1 if confidence in ("높음", "보통") else 0


# =====================================================================
# 2) AI 분석 API 호출
# =====================================================================

def text_key(text):
    """문자 내용으로 고유 키 만들기 (이미 분석한 문자는 다시 안 부르려고)"""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)


def check_server(api_url):
    """개발 서버가 켜져 있는지 확인 (GET 요청에 405가 오면 켜져 있는 것)"""
    try:
        urllib.request.urlopen(api_url, timeout=5)
    except urllib.error.HTTPError:
        return True   # 405 등 HTTP 응답이 왔다 = 서버는 켜져 있음
    except (urllib.error.URLError, OSError):
        return False  # 연결 자체가 안 됨 = 서버 꺼짐
    return True


def call_ai(api_url, text):
    """우리 API(/api/analyze-dna)에 문자 하나를 보내 분석 결과 받기"""
    req = urllib.request.Request(
        api_url,
        data=json.dumps({"text": text}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # API가 돌려준 오류 메시지를 꺼내서 다시 던짐
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error", "")
        except Exception:
            msg = ""
        raise RuntimeError("HTTP %d %s" % (e.code, msg))


def run_ai(samples, api_url, delay, retries=3):
    """샘플을 하나씩 AI로 분석 (이미 분석한 건 건너뜀, 사용량 초과면 기다렸다 재시도)"""
    cache = load_cache()
    total = len(samples)
    for i, s in enumerate(samples, 1):
        key = text_key(s["text"])
        if key in cache and "error" not in cache[key]:
            print("  [%d/%d] 이미 분석함 → 건너뜀" % (i, total))
            continue

        for attempt in range(1, retries + 1):
            try:
                result = call_ai(api_url, s["text"])
                cache[key] = result
                print("  [%d/%d] %s → %s / %s" % (
                    i, total, "스미싱" if s["label"] else "정상",
                    result.get("risk"), FAMILY_NAMES.get(result.get("family_id"), "?")))
                break
            except Exception as e:
                msg = str(e)
                if "429" in msg and attempt < retries:
                    wait = 20 * attempt  # 사용량 초과: 20초, 40초 기다렸다 재시도
                    print("  [%d/%d] 사용량 초과 → %d초 기다렸다 다시 시도" % (i, total, wait))
                    time.sleep(wait)
                    continue
                cache[key] = {"error": msg}
                print("  [%d/%d] 실패: %s" % (i, total, msg[:80]))
                break

        save_cache(cache)  # 한 건마다 저장 → 중간에 꺼져도 다음에 이어서 가능
        if i < total:
            time.sleep(delay)  # 무료 모델 사용량 제한을 피하려고 잠깐 쉼
    return cache


def ai_says_smishing(result):
    """AI 판정 기준: 위험도가 '안전'이 아니면(위험·주의) 스미싱으로 봄"""
    return 0 if result.get("risk") == "안전" else 1


# =====================================================================
# 3) 정확도 계산
# =====================================================================

def metrics(pairs):
    """(정답, 예측) 목록으로 정확도·정밀도·재현율·F1 계산"""
    tp = sum(1 for y, p in pairs if y == 1 and p == 1)  # 스미싱을 스미싱으로 (정답)
    tn = sum(1 for y, p in pairs if y == 0 and p == 0)  # 정상을 정상으로 (정답)
    fp = sum(1 for y, p in pairs if y == 0 and p == 1)  # 정상을 스미싱으로 (오탐)
    fn = sum(1 for y, p in pairs if y == 1 and p == 0)  # 스미싱을 정상으로 (놓침, 가장 위험)
    n = len(pairs)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"n": n, "tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "accuracy": (tp + tn) / n if n else 0.0,
            "precision": precision, "recall": recall, "f1": f1}


def pct(x):
    return "%.1f%%" % (x * 100)


# =====================================================================
# 4) 결과 파일 만들기
# =====================================================================

def md_escape(text, limit=None):
    """마크다운 표 안에 넣을 수 있게 정리 (줄바꿈·| 제거, 길면 자르기)"""
    t = " ".join(str(text).split()).replace("|", "/")
    if limit and len(t) > limit:
        t = t[:limit] + "…"
    return t


def md_table(headers, rows):
    """마크다운 표 만들기 (노션에 붙여넣으면 표로 바뀜)"""
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for r in rows:
        lines.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(lines)


def metric_rows(m):
    return [["정확도 (전체 중 맞힌 비율)", pct(m["accuracy"])],
            ["정밀도 (스미싱이라고 한 것 중 진짜 스미싱)", pct(m["precision"])],
            ["재현율 (진짜 스미싱 중 잡아낸 비율)", pct(m["recall"])],
            ["F1 점수 (정밀도·재현율 종합)", pct(m["f1"])]]


def confusion_rows(m):
    return [["실제 스미싱", m["tp"], "%d (놓침)" % m["fn"]],
            ["실제 정상", "%d (오탐)" % m["fp"], m["tn"]]]


def pick_test_cases(rows, limit=10):
    """보고서 테스트표용 대표 사례 고르기: 스미싱 맞힘, 정상 맞힘, 틀린 사례를 골고루"""
    groups = {
        "smishing_ok": [r for r in rows if r["label"] == 1 and r["pass"]],
        "normal_ok": [r for r in rows if r["label"] == 0 and r["pass"]],
        "fail": [r for r in rows if not r["pass"]],
    }
    quota = {"smishing_ok": 4, "normal_ok": 3, "fail": 3}  # 틀린 사례도 숨기지 않고 넣음
    picked = []
    for name, want in quota.items():
        picked += groups[name][:want]
    # 모자라면 남은 것으로 채우기
    for r in rows:
        if len(picked) >= limit:
            break
        if r not in picked:
            picked.append(r)
    return picked[:limit]


def write_outputs(data, rule_results, ai_samples, ai_cache, args):
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # ----- 규칙 분류기: 전체 데이터 -----
    rule_pairs = [(d["label"], rule_says_smishing(r["confidence"])) for d, r in zip(data, rule_results)]
    rule_m = metrics(rule_pairs)

    # ----- AI: 샘플 (실패한 건 계산에서 제외) -----
    rule_by_text = {d["text"]: r for d, r in zip(data, rule_results)}
    ai_rows, ai_errors, model_names = [], 0, Counter()
    for s in ai_samples:
        res = ai_cache.get(text_key(s["text"]))
        if not res or "error" in res:
            ai_errors += 1
            continue
        model_names[res.get("model", "?")] += 1
        pred = ai_says_smishing(res)
        ai_rows.append({
            "text": s["text"], "label": s["label"], "type": s["type"],
            "risk": res.get("risk"), "family_id": res.get("family_id"), "confidence": res.get("confidence"),
            "pred": pred, "pass": pred == s["label"],
        })
    ai_m = metrics([(r["label"], r["pred"]) for r in ai_rows]) if ai_rows else None

    # 같은 샘플에 대한 규칙 분류기 성적 (AI와 공정하게 비교하려고)
    same_sample_rule_m = metrics([(r["label"], rule_says_smishing(rule_by_text[r["text"]]["confidence"]))
                                  for r in ai_rows]) if ai_rows else None

    # ----- predictions.csv (엑셀에서 한글 안 깨지게 BOM 포함 UTF-8) -----
    csv_path = os.path.join(RESULTS_DIR, "predictions.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["문자", "정답", "데이터셋_유형", "규칙_계열", "규칙_신뢰도", "규칙_판정", "규칙_통과",
                    "AI_위험도", "AI_계열", "AI_확신도", "AI_판정", "AI_통과"])
        ai_by_text = {r["text"]: r for r in ai_rows}
        for d, r in zip(data, rule_results):
            rp = rule_says_smishing(r["confidence"])
            a = ai_by_text.get(d["text"])
            w.writerow([
                d["text"], "스미싱" if d["label"] else "정상", d["type"],
                FAMILY_NAMES.get(r["family_id"], r["family_id"]), r["confidence"],
                "스미싱" if rp else "정상", "O" if rp == d["label"] else "X",
                a["risk"] if a else "", FAMILY_NAMES.get(a["family_id"], "") if a else "",
                a["confidence"] if a else "", ("스미싱" if a["pred"] else "정상") if a else "",
                ("O" if a["pass"] else "X") if a else "",
            ])

    # ----- report.md -----
    total_s = sum(1 for d in data if d["label"] == 1)
    lines = [
        "# 🧬 수법 DNA 정확도 테스트 결과",
        "",
        "- 데이터셋: Hugging Face `jmjmjm3/kor-smishing-message` (CC BY-NC-SA 4.0)",
        "- 테스트 일시: %s" % time.strftime("%Y-%m-%d %H:%M"),
        "- 전체 문자: %d건 (스미싱 %d건 · 정상 %d건, 중복 제거 후)" % (len(data), total_s, len(data) - total_s),
        "- 판정 기준: AI는 위험도가 '위험·주의'면 스미싱, 규칙 분류기는 신뢰도 '높음·보통'이면 스미싱",
        "",
    ]

    if ai_m:
        lines += [
            "## 1. AI 분석 (무작위 샘플 %d건)" % ai_m["n"],
            "",
            "- 모델: %s" % ", ".join(model_names.keys()),
            "- 샘플 추출: 스미싱·정상 반반, 무작위 (seed=%d)%s" % (
                args.seed, " · API 실패 %d건은 제외" % ai_errors if ai_errors else ""),
            "",
            md_table(["지표", "AI 분석", "규칙 분류기 (같은 샘플)"],
                     [[a[0], a[1], b[1]] for a, b in zip(metric_rows(ai_m), metric_rows(same_sample_rule_m))]),
            "",
            "**AI 혼동행렬**",
            "",
            md_table(["", "스미싱이라고 판정", "정상이라고 판정"], confusion_rows(ai_m)),
            "",
        ]

    lines += [
        "## %d. 키워드 규칙 분류기 (전체 %d건)" % (2 if ai_m else 1, rule_m["n"]),
        "",
        md_table(["지표", "값"], metric_rows(rule_m)),
        "",
        md_table(["", "스미싱이라고 판정", "정상이라고 판정"], confusion_rows(rule_m)),
        "",
    ]

    # 스미싱 문자의 수법 계열 분포 (AI 우선, 없으면 규칙)
    if ai_rows:
        fam_counts = Counter(r["family_id"] for r in ai_rows if r["label"] == 1)
        fam_title = "AI 기준, 샘플 속 스미싱 %d건" % sum(fam_counts.values())
    else:
        fam_counts = Counter(r["family_id"] for d, r in zip(data, rule_results) if d["label"] == 1)
        fam_title = "규칙 분류기 기준, 스미싱 %d건" % sum(fam_counts.values())
    total_f = sum(fam_counts.values()) or 1
    lines += [
        "## %d. 스미싱 문자의 수법 계열 분포 (%s)" % (3 if ai_m else 2, fam_title),
        "",
        md_table(["수법 계열", "건수", "비율"],
                 [[FAMILY_NAMES.get(k, k), v, pct(v / total_f)] for k, v in fam_counts.most_common()]),
        "",
    ]

    # 보고서 5-2 테스트표 (AI 결과 우선)
    if ai_rows:
        case_rows = ai_rows
        def actual(r):
            return "%s · %s (위험도 %s)" % ("스미싱" if r["pred"] else "정상",
                                          FAMILY_NAMES.get(r["family_id"], r["family_id"]), r["risk"])
    else:
        case_rows = []
        for d, r in zip(data, rule_results):
            p = rule_says_smishing(r["confidence"])
            case_rows.append({"text": d["text"], "label": d["label"], "pred": p, "pass": p == d["label"],
                              "family_id": r["family_id"], "confidence": r["confidence"]})
        def actual(r):
            return "%s · %s (신뢰도 %s)" % ("스미싱" if r["pred"] else "정상",
                                          FAMILY_NAMES.get(r["family_id"], r["family_id"]), r["confidence"])

    cases = pick_test_cases(case_rows)
    lines += [
        "## 📋 보고서 5-2 테스트표 (노션에 그대로 붙여넣기)",
        "",
        md_table(["테스트 항목", "입력", "기대 결과", "실제 결과", "통과"],
                 [["%s 판별 #%d" % ("스미싱" if r["label"] else "정상 문자", i), md_escape(r["text"], 45),
                   "스미싱" if r["label"] else "정상", md_escape(actual(r)), "✅" if r["pass"] else "❌"]
                  for i, r in enumerate(cases, 1)]),
        "",
    ]

    # 틀린 사례 목록 (보고서 6-2 한계점 쓸 때 참고)
    wrong = [r for r in case_rows if not r["pass"]][:10]
    if wrong:
        lines += [
            "## ❌ 틀린 사례 (한계점·개선 방향 작성용)",
            "",
            md_table(["정답", "판정", "문자"],
                     [["스미싱" if r["label"] else "정상", "스미싱" if r["pred"] else "정상", md_escape(r["text"], 70)]
                      for r in wrong]),
            "",
        ]

    report_path = os.path.join(RESULTS_DIR, "report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return rule_m, ai_m, same_sample_rule_m, ai_errors, report_path, csv_path


# =====================================================================
# 메인
# =====================================================================

def main():
    setup_console()

    parser = argparse.ArgumentParser(description="수법 DNA 정확도 테스트")
    parser.add_argument("--csv", required=True, help="Hugging Face에서 받은 CSV 파일 경로")
    parser.add_argument("--n", type=int, default=30, help="AI로 테스트할 샘플 수 (기본 30)")
    parser.add_argument("--no-ai", action="store_true", help="AI 테스트 없이 규칙 분류기만")
    parser.add_argument("--api", default="http://127.0.0.1:3000/api/analyze-dna", help="AI 분석 API 주소 (통합 서버는 127.0.0.1에서만 열림)")
    parser.add_argument("--delay", type=float, default=4.0, help="AI 요청 사이 대기 시간(초)")
    parser.add_argument("--seed", type=int, default=42, help="샘플 뽑기 고정값 (같으면 매번 같은 샘플)")
    parser.add_argument("--text-col", default="content", help="문자 내용 칸 이름")
    parser.add_argument("--label-col", default="label", help="정답 라벨 칸 이름")
    parser.add_argument("--type-col", default="type", help="유형 칸 이름")
    args = parser.parse_args()

    # 1) 데이터 읽기
    print("[1/3] 데이터셋 읽는 중: %s" % args.csv)
    data, skipped = read_dataset(args.csv, args.text_col, args.label_col, args.type_col)
    n_s = sum(1 for d in data if d["label"] == 1)
    print("      사용할 문자 %d건 (스미싱 %d / 정상 %d)" % (len(data), n_s, len(data) - n_s))
    if skipped:
        print("      제외: " + ", ".join("%s %d건" % (k, v) for k, v in skipped.items()))
    if not data:
        sys.exit("[오류] 사용할 수 있는 문자가 없어요.")

    # 2) 규칙 분류기 (전체)
    print("[2/3] 키워드 규칙 분류기로 전체 %d건 분석 중..." % len(data))
    rule_results = run_rule([d["text"] for d in data])

    # 3) AI (샘플)
    ai_samples, ai_cache = [], {}
    if args.no_ai:
        print("[3/3] AI 테스트 건너뜀 (--no-ai)")
    else:
        if not check_server(args.api):
            sys.exit("[오류] 개발 서버에 연결할 수 없어요: %s\n"
                     "       다른 터미널에서 'npm run dev'로 서버를 켜고 다시 실행하세요.\n"
                     "       (규칙 분류기만 테스트하려면 --no-ai 옵션을 붙이세요.)" % args.api)
        ai_samples = sample_balanced(data, args.n, args.seed)
        os.makedirs(RESULTS_DIR, exist_ok=True)
        print("[3/3] AI로 샘플 %d건 분석 중 (한 건당 약 %.0f초 대기)..." % (len(ai_samples), args.delay))
        ai_cache = run_ai(ai_samples, args.api, args.delay)

    # 4) 결과 저장
    rule_m, ai_m, same_rule_m, ai_errors, report_path, csv_path = write_outputs(
        data, rule_results, ai_samples, ai_cache, args)

    # 5) 요약 출력
    print("\n===== 결과 요약 =====")
    print("규칙 분류기 (전체 %d건): 정확도 %s, 재현율 %s" % (rule_m["n"], pct(rule_m["accuracy"]), pct(rule_m["recall"])))
    if ai_m:
        print("AI 분석   (샘플 %d건): 정확도 %s, 재현율 %s" % (ai_m["n"], pct(ai_m["accuracy"]), pct(ai_m["recall"])))
        print("규칙 분류기 (같은 샘플): 정확도 %s" % pct(same_rule_m["accuracy"]))
    if ai_errors:
        print("AI 실패 %d건 → 다시 실행하면 실패한 것만 이어서 분석해요." % ai_errors)
    print("\n리포트: %s" % report_path)
    print("문자별 결과: %s" % csv_path)


if __name__ == "__main__":
    main()
