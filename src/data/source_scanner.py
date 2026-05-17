from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import requests

DEFAULT_RSS_BY_DOMAIN: dict[str, list[str]] = {
    "www.cnn.com": [
        "https://rss.cnn.com/rss/edition.rss",
        "https://rss.cnn.com/rss/money_latest.rss",
    ],
    "cnn.com": [
        "https://rss.cnn.com/rss/edition.rss",
        "https://rss.cnn.com/rss/money_latest.rss",
    ],
}


def load_sources(path: str = "sources.txt") -> list[str]:
    with open(path, "r", encoding="utf-8") as file:
        lines = [line.strip() for line in file.readlines()]
    return [line for line in lines if line and not line.startswith("#")]


def _normalize_domain(source: str) -> str:
    value = source.strip()
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    return parsed.netloc or source


def _extract_rss_items(xml_text: str) -> list[dict[str, str]]:
    root = ET.fromstring(xml_text)
    items: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        if title:
            items.append({"title": title, "url": link, "published_at": pub_date})
    return items


def gather_source_headlines(
    sources: list[str],
    timeout_seconds: int = 10,
    max_headlines: int = 30,
) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    for source in sources:
        domain = _normalize_domain(source)
        rss_urls = DEFAULT_RSS_BY_DOMAIN.get(domain, [])
        for rss_url in rss_urls:
            try:
                response = requests.get(rss_url, timeout=timeout_seconds)
                response.raise_for_status()
                items = _extract_rss_items(response.text)
            except Exception:
                continue

            for item in items:
                title_key = item["title"].strip().lower()
                if not title_key or title_key in seen_titles:
                    continue
                seen_titles.add(title_key)
                collected.append(
                    {
                        "source": domain,
                        "title": item["title"],
                        "url": item["url"],
                        "published_at": item["published_at"] or datetime.utcnow().isoformat(),
                    }
                )

    collected.sort(key=lambda row: row["published_at"], reverse=True)
    return collected[:max_headlines]
