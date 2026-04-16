import argparse
import re
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import pdfplumber
    import pandas as pd
except ModuleNotFoundError as exc:
    missing = exc.name or "unknown package"
    print(f"Missing Python package: {missing}")
    print("Run with local venv:")
    print("  .\\.venv\\Scripts\\python.exe .\\parser.py")
    print("or use:")
    print("  .\\run_parser.ps1")
    sys.exit(1)

DASH_CHARS = r'\-‐‑‒–—−'
ROOM_RE = re.compile(
    rf'(?<!\d)(\d{{1,2}}\s*[{DASH_CHARS}]\s*\d{{3}}(?:\s*[а-яёa-z])?(?:\s*/\s*\d{{1,3}})?)_?'
)
TEACHER_RE = re.compile(r'([А-ЯЁA-Z][а-яёa-z]+(?:-[А-ЯЁA-Z][а-яёa-z]+)?\s+[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.)')
SUBGROUP_RE = re.compile(r'(\d{2}\s*подгруппа)', re.IGNORECASE)
GROUP_CODE_RE = re.compile(r'\b[А-Яа-яЁёA-Za-z]{1,8}[БбBb6]?-?\d{4}-\d{2}-\d{2}\b')
PLAIN_GROUP_CODE_RE = re.compile(r'\b\d{4}-\d{2}-\d{2}\b')
DATE_RE = re.compile(r'\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b')
DAY_RE = re.compile(
    r'\b(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\b',
    re.IGNORECASE,
)
INTERVAL_RE = re.compile(r'\b(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})\b')
NEW_ENTRY_RE = re.compile(r'^(?:[А-ЯЁA-Z0-9-]+,\s*)?\d{2}\s*подгруппа\b', re.IGNORECASE)
INLINE_SUBGROUP_START_RE = re.compile(r'(?=(?:[А-ЯЁA-Z]{2,8}[бБ6]?-?\d{4}-\d{2}-\d{2},\s*\d{2}\s*подгруппа))')
LESSON_KEYWORDS_RE = re.compile(r'(лекц|практическ|лаборатор|дисциплин|семинар|экзамен|зачет)', re.IGNORECASE)
LESSON_TYPE_PATTERNS = [
    ("Лабораторная работа", re.compile(r'лабораторн\w*\s+работ\w*', re.IGNORECASE)),
    ("Практическое занятие", re.compile(r'практическ\w*\s+заняти\w*', re.IGNORECASE)),
    ("Лекция", re.compile(r'\bлекц(?:ия|ии|ионн(?:ое|ая|ые|ой)?)?\b', re.IGNORECASE)),
]
INITIALS_ONLY_RE = re.compile(r'^[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.?$')
ROOM_VALUE_RE = re.compile(r'^\d{1,2}-\d{3}(?:[а-яёa-z])?(?:/\d{1,3})?$', re.IGNORECASE)
DAYS = [
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "суббота",
    "воскресенье",
]


def parse_cli_date(raw):
    raw_text = str(raw or "").strip()

    try:
        return datetime.strptime(raw_text, "%Y-%m-%d").date()
    except ValueError:
        pass

    normalized = raw_text.replace("_", ".").replace("-", ".").replace("/", ".")
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue

    raise argparse.ArgumentTypeError("Некорректный формат --date. Используйте YYYY-MM-DD или DD.MM.YYYY")


def build_arg_parser(default_pdf_dir: Path, default_output_dir: Path):
    parser = argparse.ArgumentParser(
        description=(
            "Единый пайплайн расписания: скачать PDF на выбранную дату и распарсить их в CSV."
        )
    )
    parser.add_argument(
        "--date",
        type=parse_cli_date,
        default=date.today(),
        help="Дата для выбора актуальных PDF: YYYY-MM-DD или DD.MM.YYYY (по умолчанию сегодня)",
    )
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        default=default_pdf_dir,
        help="Папка для загружаемых PDF",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir,
        help="Корень папки для итоговых CSV",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Не скачивать новые PDF, а парсить уже существующие в --pdf-dir",
    )
    parser.add_argument("--min-delay", type=float, default=1.0, help="Минимальная задержка между запросами (сек)")
    parser.add_argument("--max-delay", type=float, default=2.0, help="Максимальная задержка между запросами (сек)")
    return parser


def ensure_empty_directory(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    for child in directory.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def download_current_schedule_pdfs(target_date: date, output_dir: Path, min_delay: float, max_delay: float):
    try:
        import requests
        from web_worm.download_current_schedule_pdfs import collect_links_for_date, download_links
    except ModuleNotFoundError as exc:
        missing = exc.name or "unknown package"
        print(f"Missing Python package for downloader: {missing}")
        print("Install dependencies in local venv:")
        print("  .\\.venv\\Scripts\\pip.exe install -r .\\requirements.txt")
        return 0, 1

    print(f"\nПодготовка папки PDF: {output_dir}")
    ensure_empty_directory(output_dir)
    print("Папка PDF очищена перед скачиванием.")

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

    try:
        links = collect_links_for_date(session, target_date)
    except requests.RequestException as exc:
        print(f"Не удалось загрузить страницу расписания: {exc}")
        return 0, 1

    if not links:
        print("Подходящие PDF для выбранной даты не найдены.")
        return 0, 0

    downloaded, failed = download_links(
        session=session,
        links=links,
        output_dir=output_dir,
        min_delay=min_delay,
        max_delay=max_delay,
        overwrite=False,
    )
    return downloaded, failed


def normalize_cell(value):
    if value is None:
        return ""
    text = str(value).replace("\xa0", " ").strip()
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r'[ \t\f\v]+', ' ', text)
    text = re.sub(r'\n+', '\n', text)
    return text


def reverse_compact(text):
    compact = re.sub(r'\s+', '', text)
    return compact[::-1]


def parse_valid_date(raw):
    match = re.fullmatch(r'(\d{1,2})[./](\d{1,2})[./](\d{2,4})', raw)
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))
    year = int(match.group(3))

    if not (1 <= day <= 31 and 1 <= month <= 12):
        return None

    return f"{day:02d}.{month:02d}.{year % 100:02d}"


def find_date_in_digits(raw_digits, prefer_last=False):
    if len(raw_digits) < 6:
        return None

    valid_dates = []
    for idx in range(0, len(raw_digits) - 5):
        candidate = raw_digits[idx: idx + 6]
        day = int(candidate[0:2])
        month = int(candidate[2:4])
        year = int(candidate[4:6])
        if not (1 <= day <= 31 and 1 <= month <= 12):
            continue
        valid_dates.append(f"{day:02d}.{month:02d}.{year:02d}")

    if not valid_dates:
        return None

    return valid_dates[-1] if prefer_last else valid_dates[0]


def remove_spaced_token(text, token):
    pattern = r'\b' + r'\s*'.join(re.escape(ch) for ch in token) + r'\b'
    return re.sub(pattern, ' ', text, flags=re.IGNORECASE)


def extract_day_from_noisy_text(text):
    letters_only = re.sub(r'[^а-яё]', '', text.lower())
    if not letters_only:
        return None

    for day in DAYS:
        if day in letters_only or day[::-1] in letters_only:
            return day
    return None


def extract_date_from_noisy_prefix(text):
    prefix_match = re.match(r'^\s*(?:\d\s*){1,4}\.\s*(?:\d\s*){1,2}\.\s*(?:\d\s*){1,4}', text)
    if not prefix_match:
        return None

    prefix = prefix_match.group(0)
    digits = ''.join(ch for ch in prefix if ch.isdigit())
    if len(digits) < 6:
        return None

    direct = find_date_in_digits(digits, prefer_last=True)
    if direct:
        return direct

    reverse = find_date_in_digits(digits[::-1], prefer_last=True)
    return reverse


def weekday_from_date_ru(date_str):
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%d.%m.%y")
    except ValueError:
        return None

    names = [
        "понедельник",
        "вторник",
        "среда",
        "четверг",
        "пятница",
        "суббота",
        "воскресенье",
    ]
    return names[dt.weekday()]


def normalize_interval(text):
    match = INTERVAL_RE.search(text)
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}"


def normalize_room_value(raw_room):
    text = str(raw_room or "").strip().replace("_", "")
    text = re.sub(rf'[{DASH_CHARS}]', '-', text)
    text = re.sub(r'\s*-\s*', '-', text)
    text = re.sub(r'\s*/\s*', '/', text)
    text = re.sub(r'\s+', '', text)
    return text


def canonicalize_room_value(raw_room):
    text = str(raw_room or "").strip()
    if not text:
        return "Не указан"

    lowered = text.lower()
    if lowered in {"не указан", "не указано", "nan", "none"}:
        return "Не указан"

    normalized = normalize_room_value(text)
    return normalized if normalized else "Не указан"


def is_valid_room_value(raw_room):
    value = canonicalize_room_value(raw_room)
    if value == "Не указан":
        return False
    return bool(ROOM_VALUE_RE.fullmatch(value))


def build_mode_map(df, key_cols):
    if df.empty:
        return {}

    grouped = (
        df.groupby(key_cols, dropna=False)["Кабинет"]
        .agg(lambda series: series.value_counts().index[0])
        .reset_index(name="mode_room")
    )
    return {
        tuple(row[col] for col in key_cols): row["mode_room"]
        for _, row in grouped.iterrows()
    }


def fill_rooms_by_key_sets(cleaned, key_sets):
    room_series = cleaned["Кабинет"].fillna("").astype(str).str.strip()
    unknown_or_invalid_mask = room_series.apply(lambda value: not is_valid_room_value(value))

    for key_cols in key_sets:
        if not unknown_or_invalid_mask.any():
            break

        known_df = cleaned.loc[
            ~unknown_or_invalid_mask,
            key_cols + ["Кабинет"],
        ].drop_duplicates()
        mode_map = build_mode_map(known_df, key_cols)
        if not mode_map:
            continue

        for idx in cleaned.index[unknown_or_invalid_mask]:
            key = tuple(cleaned.at[idx, col] for col in key_cols)
            room_value = mode_map.get(key)
            if room_value and is_valid_room_value(room_value):
                cleaned.at[idx, "Кабинет"] = canonicalize_room_value(room_value)

        room_series = cleaned["Кабинет"].fillna("").astype(str).str.strip()
        unknown_or_invalid_mask = room_series.apply(lambda value: not is_valid_room_value(value))

    # Last resort: force-fill remaining missing rooms with most frequent valid room in this PDF file.
    if unknown_or_invalid_mask.any():
        valid_rooms = cleaned.loc[~unknown_or_invalid_mask, "Кабинет"]
        if not valid_rooms.empty:
            fallback_room = valid_rooms.value_counts().index[0]
            cleaned.loc[unknown_or_invalid_mask, "Кабинет"] = fallback_room


def apply_mode_maps_to_rooms(cleaned, key_sets, mode_maps, fallback_room=None):
    room_series = cleaned["Кабинет"].fillna("").astype(str).str.strip()
    unknown_or_invalid_mask = room_series.apply(lambda value: not is_valid_room_value(value))

    for key_cols in key_sets:
        if not unknown_or_invalid_mask.any():
            break

        mode_map = mode_maps.get(tuple(key_cols), {})
        if not mode_map:
            continue

        for idx in cleaned.index[unknown_or_invalid_mask]:
            key = tuple(cleaned.at[idx, col] for col in key_cols)
            room_value = mode_map.get(key)
            if room_value and is_valid_room_value(room_value):
                cleaned.at[idx, "Кабинет"] = canonicalize_room_value(room_value)

        room_series = cleaned["Кабинет"].fillna("").astype(str).str.strip()
        unknown_or_invalid_mask = room_series.apply(lambda value: not is_valid_room_value(value))

    if unknown_or_invalid_mask.any() and fallback_room and is_valid_room_value(fallback_room):
        cleaned.loc[unknown_or_invalid_mask, "Кабинет"] = canonicalize_room_value(fallback_room)


def extract_lesson_type(text):
    source = str(text or "")
    for lesson_type, pattern in LESSON_TYPE_PATTERNS:
        if pattern.search(source):
            return lesson_type
    return "Не указан"


def remove_lesson_type_tokens(text):
    cleaned = str(text or "")
    for _, pattern in LESSON_TYPE_PATTERNS:
        cleaned = pattern.sub(" ", cleaned)
    return cleaned


def extract_date_day(cells, current_date, current_day):
    joined = " ".join(cells)
    reversed_candidates = [reverse_compact(cell) for cell in cells]
    candidates = [joined, *reversed_candidates]

    for candidate in candidates:
        day_match = DAY_RE.search(candidate)
        if day_match:
            current_day = day_match.group(1).lower()
            break

    for candidate in candidates:
        date_match = DATE_RE.search(candidate)
        if date_match:
            parsed = parse_valid_date(date_match.group(1).replace('/', '.'))
            if parsed:
                current_date = parsed
                break

    # Некоторые даты в вертикальной колонке приходят как поток символов; пробуем восстановить по цифрам.
    if current_date is None:
        for candidate in reversed_candidates:
            if not DAY_RE.search(candidate):
                continue
            digits = ''.join(ch for ch in candidate if ch.isdigit())
            recovered = find_date_in_digits(digits)
            if recovered:
                current_date = recovered
            break

    return current_date, current_day


def is_metadata_cell(cell):
    lowered = cell.lower()
    if lowered in {"день", "интервал"}:
        return True
    if DAY_RE.fullmatch(lowered):
        return True
    if DATE_RE.fullmatch(cell):
        return True
    if INTERVAL_RE.fullmatch(cell):
        return True
    if GROUP_CODE_RE.fullmatch(cell):
        return True
    return False


def split_lessons_block(lesson_text):
    lines = [normalize_cell(line) for line in str(lesson_text).splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return []

    chunks = []
    current = ""

    for line in lines:
        starts_new = bool(NEW_ENTRY_RE.search(line))

        if not current:
            current = line
        elif starts_new and (TEACHER_RE.search(current) or ROOM_RE.search(current)):
            chunks.append(current)
            current = line
        else:
            current = f"{current} {line}"

        if TEACHER_RE.search(current) and ROOM_RE.search(current):
            chunks.append(current)
            current = ""

    if current:
        chunks.append(current)

    return [re.sub(r'\s+', ' ', chunk).strip() for chunk in chunks if chunk.strip()]


def split_inline_subgroup_entries(text):
    starts = [match.start() for match in INLINE_SUBGROUP_START_RE.finditer(text)]
    if len(starts) <= 1:
        return [text]

    if starts[0] != 0:
        starts = [0, *starts]
    starts.append(len(text))

    parts = []
    for idx in range(0, len(starts) - 1):
        part = text[starts[idx]:starts[idx + 1]].strip(' ,')
        if part:
            parts.append(part)
    return parts if parts else [text]


def clean_discipline(raw_text, teacher, room):
    text = raw_text

    text = GROUP_CODE_RE.sub(" ", text)
    text = PLAIN_GROUP_CODE_RE.sub(" ", text)
    text = ROOM_RE.sub(" ", text)
    if teacher != "Не указан":
        text = text.replace(teacher, " ")

    text = SUBGROUP_RE.sub(" ", text)
    text = remove_lesson_type_tokens(text)

    for day in DAYS:
        text = remove_spaced_token(text, day)
        text = remove_spaced_token(text, day[::-1])

    text = re.sub(r'^\s*(?:\d\s*){1,4}\.\s*(?:\d\s*){1,2}\.\s*(?:\d\s*){1,4}\s*', ' ', text)
    text = re.sub(r'\b(?:\d\s*){1,2}\.\s*(?:\d\s*){1,2}\.\s*(?:\d\s*){2,4}\b', ' ', text)
    text = text.replace('_', ' ')

    text = re.sub(r'\s+', ' ', text).strip(" ,;:-")

    return text if text else "Не указано"


def postprocess_schedule_df(df):
    if df.empty:
        return df

    cleaned = df.drop_duplicates().copy()

    # Recover missing date/day values for fragmented table rows.
    date_text = cleaned["Дата"].fillna("").astype(str).str.strip()
    date_text = date_text.replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})
    date_text = date_text.ffill().bfill()
    cleaned["Дата"] = date_text.fillna("")

    parsed_dates = pd.to_datetime(cleaned["Дата"], format="%d.%m.%y", errors="coerce")
    weekday_names = parsed_dates.dt.dayofweek.map(
        {
            0: "понедельник",
            1: "вторник",
            2: "среда",
            3: "четверг",
            4: "пятница",
            5: "суббота",
            6: "воскресенье",
        }
    )

    day_text = cleaned["День недели"].fillna("").astype(str).str.strip().str.lower()
    day_text = day_text.replace({"": pd.NA, "nan": pd.NA, "none": pd.NA})
    missing_day_mask = day_text.isna() & parsed_dates.notna()
    day_text.loc[missing_day_mask] = weekday_names.loc[missing_day_mask]
    cleaned["День недели"] = day_text.fillna("")

    # Drop known parser artifacts: split initials and empty-discipline rows with unknown teacher.
    discipline_text = cleaned["Дисциплина"].fillna("").astype(str).str.strip()
    discipline_compact = discipline_text.str.replace(r"\s+", "", regex=True)
    teacher_unknown_mask = cleaned["Преподаватель"].fillna("").astype(str).str.strip().str.lower().eq("не указан")
    discipline_placeholder_mask = discipline_text.str.lower().isin({"", "не указано", "не указан"})
    discipline_initials_mask = discipline_compact.apply(lambda value: bool(INITIALS_ONLY_RE.fullmatch(value)))

    artifact_mask = teacher_unknown_mask & (discipline_placeholder_mask | discipline_initials_mask)
    if artifact_mask.any():
        cleaned = cleaned.loc[~artifact_mask].copy()

    teacher_series = cleaned["Преподаватель"].fillna("").astype(str).str.strip()
    cleaned["Кабинет"] = cleaned["Кабинет"].apply(canonicalize_room_value)
    room_series = cleaned["Кабинет"].fillna("").astype(str).str.strip()

    # Some rows contain teacher initials in room column due PDF column shifts.
    shifted_teacher_mask = teacher_series.str.lower().eq("не указан") & room_series.apply(
        lambda value: bool(TEACHER_RE.fullmatch(value))
    )
    if shifted_teacher_mask.any():
        cleaned.loc[shifted_teacher_mask, "Преподаватель"] = room_series.loc[shifted_teacher_mask]
        cleaned.loc[shifted_teacher_mask, "Кабинет"] = "Не указан"

    teacher_unknown_mask = cleaned["Преподаватель"].fillna("").astype(str).str.strip().str.lower().eq("не указан")
    known_teacher_df = cleaned.loc[
        ~teacher_unknown_mask,
        ["Дата", "День недели", "Время", "Дисциплина", "Подгруппа", "Преподаватель"],
    ].drop_duplicates()
    if not known_teacher_df.empty:
        teacher_map = {
            (row["Дата"], row["День недели"], row["Время"], row["Дисциплина"], row["Подгруппа"]): row["Преподаватель"]
            for _, row in known_teacher_df.iterrows()
        }
        for idx in cleaned.index[teacher_unknown_mask]:
            key = (
                cleaned.at[idx, "Дата"],
                cleaned.at[idx, "День недели"],
                cleaned.at[idx, "Время"],
                cleaned.at[idx, "Дисциплина"],
                cleaned.at[idx, "Подгруппа"],
            )
            teacher_value = teacher_map.get(key)
            if teacher_value:
                cleaned.at[idx, "Преподаватель"] = teacher_value

    room_unknown_mask = cleaned["Кабинет"].fillna("").astype(str).str.strip().str.lower().eq("не указан")
    known_room_df = cleaned.loc[
        ~room_unknown_mask,
        ["Дата", "День недели", "Время", "Дисциплина", "Подгруппа", "Преподаватель", "Кабинет"],
    ].drop_duplicates()
    if not known_room_df.empty:
        room_map = {
            (
                row["Дата"],
                row["День недели"],
                row["Время"],
                row["Дисциплина"],
                row["Подгруппа"],
                row["Преподаватель"],
            ): row["Кабинет"]
            for _, row in known_room_df.iterrows()
        }
        for idx in cleaned.index[room_unknown_mask]:
            key = (
                cleaned.at[idx, "Дата"],
                cleaned.at[idx, "День недели"],
                cleaned.at[idx, "Время"],
                cleaned.at[idx, "Дисциплина"],
                cleaned.at[idx, "Подгруппа"],
                cleaned.at[idx, "Преподаватель"],
            )
            room_value = room_map.get(key)
            if room_value:
                cleaned.at[idx, "Кабинет"] = canonicalize_room_value(room_value)

    # Prioritize room completeness: infer cabinet values with progressively broader matching keys.
    fill_rooms_by_key_sets(
        cleaned,
        key_sets=[
            ["Дата", "День недели", "Время", "Дисциплина", "Подгруппа", "Преподаватель"],
            ["Дата", "День недели", "Время", "Дисциплина", "Подгруппа"],
            ["Дата", "День недели", "Время", "Дисциплина", "Преподаватель"],
            ["Дата", "День недели", "Время", "Дисциплина"],
            ["Дисциплина", "Подгруппа", "Преподаватель"],
            ["Дисциплина", "Преподаватель"],
            ["Преподаватель"],
            ["Дисциплина"],
        ],
    )

    continuation_mask = cleaned["Дисциплина"].str.lower().str.startswith("физической культуре и спорту", na=False)
    idx_to_drop = []

    for idx, row in cleaned[continuation_mask].iterrows():
        same_slot = (
            (cleaned["Дата"] == row["Дата"]) &
            (cleaned["Время"] == row["Время"]) &
            (cleaned["Преподаватель"] == row["Преподаватель"]) &
            (cleaned["Кабинет"] == row["Кабинет"]) &
            cleaned["Дисциплина"].str.contains(
                "Элективные дисциплины (модули) по физической культуре и спорту",
                case=False,
                regex=False,
                na=False,
            )
        )
        if same_slot.any():
            idx_to_drop.append(idx)

    if idx_to_drop:
        cleaned = cleaned.drop(index=idx_to_drop)

    # Fix occasional noisy Monday date recovery and empty Monday date.
    # If Monday is followed by Tuesday in the same file block, align Monday to one day before Tuesday.
    date_series = pd.to_datetime(cleaned["Дата"], format="%d.%m.%y", errors="coerce")
    file_series = cleaned["Файл"] if "Файл" in cleaned.columns else pd.Series(["__single__"] * len(cleaned), index=cleaned.index)
    for idx, row in cleaned.iterrows():
        if str(row.get("День недели", "")).strip().lower() != "понедельник":
            continue

        monday_dt = date_series.get(idx)
        same_file_future = cleaned.loc[idx + 1:]
        same_file_future = same_file_future[
            (file_series.loc[same_file_future.index] == file_series.loc[idx]) &
            (same_file_future["День недели"].str.lower() == "вторник")
        ]
        if same_file_future.empty:
            continue

        next_tuesday_idx = same_file_future.index[0]
        tuesday_dt = date_series.get(next_tuesday_idx)
        if pd.isna(tuesday_dt):
            continue

        if pd.isna(monday_dt):
            inferred_monday = tuesday_dt - pd.Timedelta(days=1)
            cleaned.at[idx, "Дата"] = inferred_monday.strftime("%d.%m.%y")
            continue

        day_diff = int((tuesday_dt - monday_dt).days)
        if 2 <= day_diff <= 3:
            corrected_monday = tuesday_dt - pd.Timedelta(days=1)
            cleaned.at[idx, "Дата"] = corrected_monday.strftime("%d.%m.%y")

    return cleaned.reset_index(drop=True)


def is_noise_row(discipline, teacher, room):
    if teacher != "Не указан" or room != "Не указан":
        return False
    if LESSON_KEYWORDS_RE.search(discipline):
        return False

    compact = re.sub(r'\s+', '', discipline.lower())
    if not compact:
        return True

    for day in DAYS:
        if day in compact or day[::-1] in compact:
            return True

    letters = re.findall(r'[а-яёa-z]', compact, flags=re.IGNORECASE)
    digits = re.findall(r'\d', compact)
    if len(letters) <= 3 and len(digits) >= 4:
        return True

    return False

def parse_schedule_pdf(pdf_path):
    parsed_data = []

    # Открываем PDF файл
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Извлекаем таблицы с текущей страницы
            tables = page.extract_tables()
            
            for table in tables:
                current_date = None
                current_day = None
                current_interval = None
                
                for row in table:
                    if not row:
                        continue

                    cells = [normalize_cell(cell) for cell in row if normalize_cell(cell)]
                    if not cells:
                        continue

                    current_date, current_day = extract_date_day(cells, current_date, current_day)

                    interval = None
                    for cell in cells:
                        maybe_interval = normalize_interval(cell)
                        if maybe_interval:
                            interval = maybe_interval
                            break

                    if interval:
                        current_interval = interval
                    elif current_interval:
                        interval = current_interval

                    if not interval:
                        continue

                    lesson_parts = [cell for cell in cells if not is_metadata_cell(cell)]
                    lesson_col = " ".join(lesson_parts).strip()
                    if not lesson_col:
                        continue

                    inferred_day = extract_day_from_noisy_text(lesson_col)
                    if inferred_day:
                        current_day = inferred_day

                    inferred_date = extract_date_from_noisy_prefix(lesson_col)
                    if inferred_date:
                        current_date = inferred_date

                    if lesson_col.lower() in {"расписание учебных занятий", "пмиб-2301-52-00"}:
                        continue

                    lessons = split_lessons_block(lesson_col)
                    if not lessons:
                        lessons = [lesson_col]
                    
                    for lesson in lessons:
                        inline_parts = split_inline_subgroup_entries(lesson)

                        for lesson_part in inline_parts:
                            lesson_part = lesson_part.strip()
                            if not lesson_part:
                                continue

                            room_match = ROOM_RE.search(lesson_part)
                            room = normalize_room_value(room_match.group(1)) if room_match else "Не указан"

                            teacher_match = TEACHER_RE.search(lesson_part)
                            teacher = teacher_match.group(1) if teacher_match else "Не указан"

                            subgroup_match = SUBGROUP_RE.search(lesson_part)
                            subgroup = subgroup_match.group(1).replace("  ", " ") if subgroup_match else "Общая группа"

                            lesson_type = extract_lesson_type(lesson_part)
                            discipline = clean_discipline(lesson_part, teacher, room)
                            if teacher == "Не указан" and room == "Не указан":
                                continue
                            if is_noise_row(discipline, teacher, room):
                                continue

                            # If day name is read directly from the schedule text, it is more reliable
                            # than a noisy recovered date and must have priority.
                            normalized_day = current_day or weekday_from_date_ru(current_date)

                            parsed_data.append({
                                "Дата": current_date,
                                "День недели": normalized_day,
                                "Время": interval,
                                "Подгруппа": subgroup,
                                "Дисциплина": discipline,
                                "Тип занятия": lesson_type,
                                "Преподаватель": teacher,
                                "Кабинет": room
                            })

    # Преобразуем список словарей в DataFrame для удобства
    df = pd.DataFrame(parsed_data)
    df = postprocess_schedule_df(df)
    return df


def find_schedule_files(search_root: Path, preferred_dir: Path | None = None):
    search_root = search_root.resolve()

    if preferred_dir is not None:
        candidate_dirs = [preferred_dir.resolve()]
    else:
        candidate_dirs = [
            search_root / "schedule",
            search_root / "schedules",
            search_root.parent / "schedule",
            search_root.parent / "schedules",
        ]

    found_files = []
    seen = set()

    for folder in candidate_dirs:
        if not folder.exists() or not folder.is_dir():
            continue

        for pdf_file in sorted(folder.glob("*.pdf")):
            resolved = pdf_file.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            found_files.append(resolved)

    return found_files


def save_csv_with_fallback(df, target_path: Path):
    target_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        df.to_csv(target_path, index=False, encoding="utf-8-sig")
        return target_path
    except PermissionError:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        fallback = target_path.with_name(f"{target_path.stem}_{ts}{target_path.suffix}")
        df.to_csv(fallback, index=False, encoding="utf-8-sig")
        return fallback


def sanitize_filename_component(value, fallback):
    text = str(value or "").strip()
    text = re.sub(r'[<>:"/\\|?*]+', '_', text)
    text = text.strip(' .')
    return text if text else fallback


def detect_group_name_from_pdf(pdf_path: Path):
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            max_pages = min(2, len(pdf.pages))
            for idx in range(max_pages):
                page_text = pdf.pages[idx].extract_text() or ""
                match = GROUP_CODE_RE.search(page_text)
                if match:
                    return match.group(0)
    except Exception:
        return pdf_path.stem

    return pdf_path.stem


def get_first_schedule_date_label(df):
    if df.empty or "Дата" not in df.columns:
        return "unknown-date"

    parsed_dates = pd.to_datetime(df["Дата"], format="%d.%m.%y", errors="coerce")
    parsed_dates = parsed_dates.dropna()
    if parsed_dates.empty:
        return "unknown-date"

    first_date = parsed_dates.min()
    return first_date.strftime("%d.%m.%y")


def analyze_schedule_anomalies(df):
    total_rows = len(df)
    if total_rows == 0:
        return {
            "total_rows": 0,
            "anomalous_rows": 0,
            "reason_counts": {},
        }

    idx = df.index

    date_series = pd.to_datetime(df.get("Дата", pd.Series(index=idx, dtype="object")), format="%d.%m.%y", errors="coerce")
    time_series = df.get("Время", pd.Series(index=idx, dtype="object")).fillna("").astype(str).str.strip()
    day_series = df.get("День недели", pd.Series(index=idx, dtype="object")).fillna("").astype(str).str.strip().str.lower()
    room_series = df.get("Кабинет", pd.Series(index=idx, dtype="object")).fillna("").astype(str).str.strip()
    teacher_series = df.get("Преподаватель", pd.Series(index=idx, dtype="object")).fillna("").astype(str).str.strip()
    discipline_series = df.get("Дисциплина", pd.Series(index=idx, dtype="object")).fillna("").astype(str).str.strip()

    normalized_room_series = room_series.apply(normalize_room_value)
    room_is_valid = normalized_room_series.apply(
        lambda value: bool(re.fullmatch(r'\d{1,2}-\d{3}(?:[а-яёa-z])?(?:/\d{1,3})?', value, flags=re.IGNORECASE))
    )

    reason_masks = {
        "пустая или некорректная дата": date_series.isna(),
        "пустое или некорректное время": ~time_series.str.fullmatch(r'\d{2}:\d{2}-\d{2}:\d{2}'),
        "пустой или некорректный день недели": ~day_series.isin(DAYS),
        "пустой или некорректный кабинет": room_series.eq("") | room_series.str.lower().eq("не указан") | ~room_is_valid,
        "не указан преподаватель": teacher_series.eq("") | teacher_series.str.lower().eq("не указан"),
        "пустая дисциплина": discipline_series.eq("") | discipline_series.str.lower().eq("не указано"),
    }

    anomaly_mask = pd.Series(False, index=idx)
    reason_counts = {}
    for reason, mask in reason_masks.items():
        mask = mask.fillna(True)
        anomaly_mask = anomaly_mask | mask
        count = int(mask.sum())
        if count > 0:
            reason_counts[reason] = count

    return {
        "total_rows": total_rows,
        "anomalous_rows": int(anomaly_mask.sum()),
        "reason_counts": reason_counts,
    }


def to_display_path(path: Path, base_dir: Path):
    resolved_path = path.resolve()
    try:
        return resolved_path.relative_to(base_dir.resolve())
    except ValueError:
        return resolved_path


def parse_schedule_files_to_csv(schedule_files, output_root: Path, script_dir: Path):
    exported_files = []
    anomaly_reports = []
    total_rows = 0
    total_anomalous_rows = 0
    total_reason_counts = {}
    prepared_items = []

    for pdf_path in schedule_files:
        try:
            schedule_df = parse_schedule_pdf(str(pdf_path))
        except Exception as e:
            print(f"Ошибка при обработке файла {pdf_path.name}: {e}")
            continue

        if schedule_df.empty:
            print(f"Файл {pdf_path.name} обработан, но данных не найдено.")
            continue

        group_name_raw = detect_group_name_from_pdf(pdf_path)
        group_name = sanitize_filename_component(group_name_raw, pdf_path.stem)
        first_date_label = sanitize_filename_component(get_first_schedule_date_label(schedule_df), "unknown-date")

        schedule_df.insert(0, "Файл", pdf_path.name)

        prepared_items.append(
            {
                "group_name": group_name,
                "first_date_label": first_date_label,
                "schedule_df": schedule_df,
            }
        )

    if not prepared_items:
        print("Не удалось получить данные из найденных PDF-файлов.")
        return 0

    combined_df = pd.concat([item["schedule_df"] for item in prepared_items], ignore_index=True)
    global_room_key_sets = [
        ["Дисциплина", "Подгруппа", "Преподаватель"],
        ["Дисциплина", "Преподаватель"],
        ["Преподаватель"],
        ["Дисциплина"],
    ]
    global_mode_maps = {}
    valid_global_df = combined_df.loc[combined_df["Кабинет"].apply(is_valid_room_value)].copy()
    global_fallback_room = None
    if not valid_global_df.empty:
        global_fallback_room = valid_global_df["Кабинет"].value_counts().index[0]

    for key_cols in global_room_key_sets:
        known_df = valid_global_df[key_cols + ["Кабинет"]].drop_duplicates()
        global_mode_maps[tuple(key_cols)] = build_mode_map(known_df, key_cols)

    for item in prepared_items:
        schedule_df = item["schedule_df"].copy()
        apply_mode_maps_to_rooms(
            schedule_df,
            global_room_key_sets,
            global_mode_maps,
            fallback_room=global_fallback_room,
        )

        per_file_csv = output_root / item["first_date_label"] / f"{item['group_name']}.csv"
        saved_per_file_csv = save_csv_with_fallback(schedule_df, per_file_csv)
        exported_files.append(saved_per_file_csv)
        rel_saved = to_display_path(saved_per_file_csv, script_dir)
        print(f"Сохранён файл: {rel_saved} ({len(schedule_df)} строк)")

        anomaly_info = analyze_schedule_anomalies(schedule_df)
        total_rows += int(anomaly_info["total_rows"])
        total_anomalous_rows += int(anomaly_info["anomalous_rows"])
        for reason, count in anomaly_info["reason_counts"].items():
            total_reason_counts[reason] = total_reason_counts.get(reason, 0) + int(count)

        anomaly_reports.append(
            {
                "group_name": item["group_name"],
                "csv_path": rel_saved,
                "total_rows": anomaly_info["total_rows"],
                "anomalous_rows": anomaly_info["anomalous_rows"],
                "reason_counts": anomaly_info["reason_counts"],
            }
        )

    output_display = to_display_path(output_root, script_dir)
    print(f"\nЭкспорт завершён: {len(exported_files)} файл(ов) в папке {output_display}")
    print(f"Итого аномалий: {total_anomalous_rows} из {total_rows} строк")
    if total_reason_counts:
        total_reasons_line = "; ".join(
            f"{reason}: {count}" for reason, count in sorted(total_reason_counts.items())
        )
        print(f"Итог по причинам: {total_reasons_line}")
    print("\nАнализ аномальных строк по результирующим CSV:")
    for report in anomaly_reports:
        print(
            f"- {report['group_name']}: {report['anomalous_rows']} из {report['total_rows']} аномальных строк"
            f" ({report['csv_path']})"
        )
        if report["reason_counts"]:
            reasons_line = "; ".join(
                f"{reason}: {count}" for reason, count in report["reason_counts"].items()
            )
            print(f"  Причины: {reasons_line}")
        else:
            print("  Причины: не обнаружены")

    return len(exported_files)


def main():
    script_dir = Path(__file__).resolve().parent
    parser = build_arg_parser(
        default_pdf_dir=script_dir / "schedule",
        default_output_dir=script_dir / "parsed_schedule",
    )
    args = parser.parse_args()

    if args.min_delay < 1.0:
        parser.error("--min-delay должен быть >= 1.0")
    if args.max_delay < args.min_delay:
        parser.error("--max-delay должен быть >= --min-delay")

    pdf_dir = args.pdf_dir.resolve()
    output_root = args.output_dir.resolve()

    download_failed = 0
    if args.skip_download:
        print(f"Пропуск скачивания PDF. Будет использована папка: {pdf_dir}")
    else:
        print(f"Дата для скачивания PDF: {args.date.isoformat()}")
        downloaded, failed = download_current_schedule_pdfs(
            target_date=args.date,
            output_dir=pdf_dir,
            min_delay=args.min_delay,
            max_delay=args.max_delay,
        )
        print(f"Скачано PDF: {downloaded}")
        print(f"Ошибок скачивания: {failed}")
        download_failed = failed

        if downloaded == 0 and failed > 0:
            print("Скачивание полностью завершилось с ошибками. Парсинг не будет запущен.")
            return 2

    schedule_files = find_schedule_files(script_dir, preferred_dir=pdf_dir)
    if not schedule_files:
        print(f"Файлы PDF не найдены в папке: {pdf_dir}")
        return 0 if download_failed == 0 else 2

    exported_count = parse_schedule_files_to_csv(schedule_files, output_root=output_root, script_dir=script_dir)
    if exported_count == 0:
        return 1
    return 0 if download_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())