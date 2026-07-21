"""공고 원문(summary_html 등) 정제용 공용 헬퍼. indexing.py·hybrid_search.py가 공유한다."""
import re


def strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def truncate(text: str, max_len: int = 400) -> str:
    """공고 요약을 프롬프트에 그대로 넣으면 토큰비가 크다(이슈 #61) — 앞부분(대상·지원분야 핵심이
    몰려있는 구간)만 남기고 자른다. 뒤쪽 서류·문의처 텍스트는 truncate로 잃어도 손해가 적다."""
    text = text.strip()
    return text if len(text) <= max_len else text[:max_len].rstrip() + "…"
