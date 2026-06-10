import argparse
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ModuleNotFoundError as exc:
    missing = exc.name or "unknown package"
    print(f"Missing Python package: {missing}")
    print("Install dependencies in local venv:")
    print("  .\\.venv\\Scripts\\pip.exe install -r .\\requirements.txt")
    sys.exit(1)


PAGE_URL = "https://www.vyatsu.ru/studentu-1/spravochnaya-informatsiya/teacher.html"
DEFAULT_TIMEOUT = 60
HREF_INTERVAL_RE = re.compile(r"_(\d{8})_(\d{8})\.html(?:$|[?#])", re.IGNORECASE)
TEXT_DATE_RE = re.compile(r"(\d{1,2}[._\-/]\d{1,2}[._\-/]\d{2,4})")
SPACED_INTERVAL_RE = re.compile(
    r"с\s*(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\s+по\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TeacherScheduleHtmlLink:
    url: str
    file_name: str
    period_start: date
    period_end: date
    label: str


def parse_compact_date8(raw: str) -> date | None:
    for fmt in ("%d%m%Y", "%Y%m%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def parse_human_date(raw: str) -> date | None:
    normalized = raw.replace("_", ".").replace("-", ".").replace("/", ".")
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    return None


def parse_spaced_date(day_raw: str, month_raw: str, year_raw: str) -> date | None:
    try:
        day = int(day_raw)
        month = int(month_raw)
        year = int(year_raw)
        if year < 100:
            year += 2000
        return date(year, month, day)
    except ValueError:
        return None


def parse_cli_date(raw: str) -> date:
    parsed = parse_human_date(raw)
    if parsed is not None:
        return parsed

    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Invalid --date format. Use YYYY-MM-DD or DD.MM.YYYY"
        ) from exc


def default_target_date() -> date:
    return date.today() + timedelta(days=1)


def extract_interval(href: str, text_sources: list[str]) -> tuple[date, date] | None:
    href_match = HREF_INTERVAL_RE.search(href)
    if href_match:
        start = parse_compact_date8(href_match.group(1))
        end = parse_compact_date8(href_match.group(2))
        if start and end and start <= end:
            return start, end

    for source in text_sources:
        spaced_match = SPACED_INTERVAL_RE.search(source)
        if spaced_match:
            start = parse_spaced_date(
                spaced_match.group(1), spaced_match.group(2), spaced_match.group(3)
            )
            end = parse_spaced_date(
                spaced_match.group(4), spaced_match.group(5), spaced_match.group(6)
            )
            if start and end and start <= end:
                return start, end

        raw_dates = TEXT_DATE_RE.findall(source)
        if len(raw_dates) < 2:
            continue

        parsed_dates = [parse_human_date(raw_date) for raw_date in raw_dates]
        for idx in range(len(parsed_dates) - 1):
            start = parsed_dates[idx]
            end = parsed_dates[idx + 1]
            if start and end and start <= end:
                return start, end

    return None


def is_teacher_schedule_href(href: str) -> bool:
    lowered = href.lower()
    return lowered.endswith(".html") and "/reports/schedule/prepod/" in lowered


def safe_html_name(url: str, fallback_index: int) -> str:
    basename = Path(urlparse(url).path).name
    if not basename.lower().endswith(".html"):
        basename = f"schedule_{fallback_index:04d}.html"

    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", basename).strip("._")
    if not cleaned.lower().endswith(".html"):
        cleaned = f"{cleaned}.html" if cleaned else f"schedule_{fallback_index:04d}.html"

    return cleaned


def unique_destination(path: Path, overwrite: bool) -> Path:
    if overwrite or not path.exists():
        return path

    counter = 1
    while True:
        candidate = path.with_name(f"{path.stem}_{counter}{path.suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            )
        }
    )
    return session


def collect_links_for_date(session: requests.Session, target_date: date) -> list[TeacherScheduleHtmlLink]:
    print(f"Loading page: {PAGE_URL}")
    response = session.get(PAGE_URL, timeout=DEFAULT_TIMEOUT)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    anchors = soup.select("a[href]")
    print(f"Found anchors: {len(anchors)}")

    links_by_url: dict[str, TeacherScheduleHtmlLink] = {}
    total_anchors = len(anchors)

    for idx, anchor in enumerate(anchors, start=1):
        href = (anchor.get("href") or "").strip()
        if not is_teacher_schedule_href(href):
            continue

        absolute_url = urljoin(PAGE_URL, href)
        interval = extract_interval(
            href=href,
            text_sources=[
                anchor.get_text(" ", strip=True),
                str(anchor.get("title") or ""),
                str(anchor.get("alt") or ""),
            ],
        )
        if interval is None:
            continue

        period_start, period_end = interval
        if not (period_start <= target_date <= period_end):
            continue

        if absolute_url in links_by_url:
            continue

        file_name = safe_html_name(absolute_url, len(links_by_url) + 1)
        label = anchor.get_text(" ", strip=True) or file_name
        links_by_url[absolute_url] = TeacherScheduleHtmlLink(
            url=absolute_url,
            file_name=file_name,
            period_start=period_start,
            period_end=period_end,
            label=label,
        )

        if idx % 500 == 0 or idx == total_anchors:
            print(f"Scanned anchors: {idx}/{total_anchors}")

    links = sorted(links_by_url.values(), key=lambda item: item.file_name)
    print(f"Matching teacher HTML links for {target_date.isoformat()}: {len(links)}")
    return links


def download_links(
    session: requests.Session,
    links: list[TeacherScheduleHtmlLink],
    output_dir: Path,
    min_delay: float,
    max_delay: float,
    overwrite: bool,
) -> tuple[int, int]:
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    failed = 0
    total = len(links)

    for index, link in enumerate(links, start=1):
        destination = unique_destination(output_dir / link.file_name, overwrite=overwrite)
        print(
            f"[{index}/{total}] Downloading {destination.name} "
            f"({link.period_start.isoformat()}..{link.period_end.isoformat()})"
        )

        try:
            with session.get(link.url, timeout=DEFAULT_TIMEOUT, stream=True) as response:
                response.raise_for_status()
                with destination.open("wb") as fh:
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            fh.write(chunk)
            file_size_kb = destination.stat().st_size / 1024
            print(f"    saved -> {destination} ({file_size_kb:.1f} KB)")
            downloaded += 1
        except requests.RequestException as exc:
            failed += 1
            print(f"    failed -> {link.url}")
            print(f"    reason: {exc}")

        if index < total:
            delay = random.uniform(min_delay, max_delay)
            print(f"    waiting {delay:.2f}s before next request")
            time.sleep(delay)

    return downloaded, failed


def build_arg_parser(default_output_dir: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Download teacher schedule HTML tables from VyatSU where target date "
            "falls into the link interval."
        )
    )
    parser.add_argument(
        "--date",
        type=parse_cli_date,
        default=default_target_date(),
        help="Target date: YYYY-MM-DD or DD.MM.YYYY (default: next day)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir,
        help="Directory for downloaded HTML files",
    )
    parser.add_argument("--min-delay", type=float, default=1.0, help="Minimum delay between requests")
    parser.add_argument("--max-delay", type=float, default=2.0, help="Maximum delay between requests")
    parser.add_argument("--dry-run", action="store_true", help="Only print matching files, do not download")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite files if they already exist")
    return parser


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    default_output_dir = script_dir.parent / "schedule_teacher"
    parser = build_arg_parser(default_output_dir)
    args = parser.parse_args()

    if args.min_delay < 1.0:
        parser.error("--min-delay must be >= 1.0 second")
    if args.max_delay < args.min_delay:
        parser.error("--max-delay must be >= --min-delay")

    print(f"Target date: {args.date.isoformat()}")
    print(f"Output directory: {args.output_dir}")
    print(f"Delay between requests: {args.min_delay:.1f}..{args.max_delay:.1f} sec")

    session = build_session()

    try:
        links = collect_links_for_date(session, args.date)
    except requests.RequestException as exc:
        print(f"Failed to load teacher schedule page: {exc}")
        return 1

    if not links:
        print("No teacher schedule HTML links found for target date.")
        return 0

    if args.dry_run:
        print("Dry run: matching links")
        for idx, link in enumerate(links, start=1):
            print(
                f"{idx:04d}. {link.file_name} "
                f"({link.period_start.isoformat()}..{link.period_end.isoformat()}) -> {link.url}"
            )
        return 0

    downloaded, failed = download_links(
        session=session,
        links=links,
        output_dir=args.output_dir,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        overwrite=args.overwrite,
    )
    print("Done.")
    print(f"Downloaded: {downloaded}")
    print(f"Failed: {failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
