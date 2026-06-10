import re
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

from parser import (
    GROUP_CODE_RE,
    INTERVAL_RE,
    ROOM_RE,
    canonicalize_room_value,
    clean_discipline,
    extract_lesson_type,
    normalize_cell,
    normalize_interval,
    postprocess_schedule_df,
    weekday_from_date_ru,
)

DAY_DATE_RE = re.compile(
    r"\b(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\s+(\d{1,2}\.\d{1,2}\.\d{2})\b",
    re.IGNORECASE,
)
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
GROUP_SUBGROUP_RE = re.compile(
    rf"({GROUP_CODE_RE.pattern})(?:\s*,\s*(\d{{2}})\s*подгруппа)?",
    re.IGNORECASE,
)
LESSON_TYPE_TOKEN_RE = re.compile(
    r"(?:зачет(?:\s+по\s+практике)?|экзамен|кандидатский\s+экзамен|консультация|"
    r"лекци\w*|практическ\w*\s+заняти\w*|лабораторн\w*\s+работ\w*)",
    re.IGNORECASE,
)


def decode_html_text(raw_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace")


def normalize_teacher_name(raw: str) -> str:
    text = normalize_cell(raw).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text if text else "Не указан"


def extract_room_prefix(cell_text: str) -> tuple[str, str]:
    text = normalize_cell(cell_text)
    match = ROOM_RE.search(text)
    if not match:
        return "Не указан", text

    room = canonicalize_room_value(match.group(1))
    remainder = text[match.end():].strip()
    return room, remainder


def parse_group_subgroup_pairs(cell_text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for match in GROUP_SUBGROUP_RE.finditer(cell_text):
        group = match.group(1)
        subgroup_no = match.group(2)
        subgroup = f"{subgroup_no} подгруппа" if subgroup_no else "Общая группа"
        key = (group, subgroup)
        if key in seen:
            continue
        seen.add(key)
        pairs.append(key)

    if pairs:
        return pairs

    for group in GROUP_CODE_RE.findall(cell_text):
        key = (group, "Общая группа")
        if key not in seen:
            seen.add(key)
            pairs.append(key)

    return pairs


def strip_lesson_type_tokens(text: str) -> str:
    return LESSON_TYPE_TOKEN_RE.sub(" ", text)


def parse_teacher_cell(
    cell_text: str,
    teacher_name: str,
    current_date: str | None,
    current_day: str | None,
    interval: str,
) -> list[dict]:
    text = normalize_cell(cell_text)
    if not text:
        return []

    text = URL_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []

    room, remainder = extract_room_prefix(text)
    group_pairs = parse_group_subgroup_pairs(remainder)
    if not group_pairs:
        return []

    lesson_type = extract_lesson_type(remainder)
    discipline_source = strip_lesson_type_tokens(remainder)
    for group, subgroup in group_pairs:
        discipline_source = discipline_source.replace(group, " ")
        if subgroup != "Общая группа":
            discipline_source = discipline_source.replace(subgroup, " ")

    discipline = clean_discipline(discipline_source, teacher_name, room)
    if discipline in {"", "Не указано"}:
        discipline = clean_discipline(remainder, teacher_name, room)

    rows = []
    for group, subgroup in group_pairs:
        rows.append(
            {
                "Дата": current_date,
                "День недели": current_day or weekday_from_date_ru(current_date),
                "Время": interval,
                "Подгруппа": subgroup,
                "Дисциплина": discipline,
                "Тип занятия": lesson_type,
                "Преподаватель": teacher_name,
                "Кабинет": room,
                "_group_code": group,
            }
        )

    return rows


def extract_teacher_headers(header_cells: list[str]) -> list[str]:
    if len(header_cells) < 3:
        return []

    teachers = []
    for raw in header_cells[2:]:
        text = normalize_teacher_name(raw)
        lowered = text.lower()
        if lowered in {"", "день", "интервал"}:
            continue
        teachers.append(text)
    return teachers


def parse_teacher_schedule_html(html_path: Path, source_name: str | None = None) -> pd.DataFrame:
    raw_bytes = html_path.read_bytes()
    html_text = decode_html_text(raw_bytes)
    soup = BeautifulSoup(html_text, "html.parser")
    table = soup.find("table")
    if table is None:
        return pd.DataFrame()

    rows = table.find_all("tr")
    if len(rows) < 3:
        return pd.DataFrame()

    header_cells = [normalize_cell(cell.get_text(" ", strip=True)) for cell in rows[1].find_all("td")]
    teachers = extract_teacher_headers(header_cells)
    if not teachers:
        return pd.DataFrame()

    parsed_rows: list[dict] = []
    current_date: str | None = None
    current_day: str | None = None
    source_label = source_name or html_path.name

    for row in rows[2:]:
        cells = [normalize_cell(cell.get_text(" ", strip=True)) for cell in row.find_all("td")]
        if not any(cells):
            continue

        joined = " ".join(cells)
        day_match = DAY_DATE_RE.search(joined)
        if day_match:
            current_day = day_match.group(1).lower()
            current_date = day_match.group(2)

        interval = None
        for cell in cells:
            maybe_interval = normalize_interval(cell)
            if maybe_interval:
                interval = maybe_interval
                break

        if not interval:
            continue

        day_in_first_cell = bool(DAY_DATE_RE.search(cells[0])) if cells else False
        lesson_offset = 2 if day_in_first_cell else 1
        lesson_cells = cells[lesson_offset + 1 : lesson_offset + 1 + len(teachers)]

        for teacher_name, cell_text in zip(teachers, lesson_cells):
            for item in parse_teacher_cell(
                cell_text=cell_text,
                teacher_name=teacher_name,
                current_date=current_date,
                current_day=current_day,
                interval=interval,
            ):
                item["Файл"] = source_label
                parsed_rows.append(item)

    if not parsed_rows:
        return pd.DataFrame()

    df = pd.DataFrame(parsed_rows)
    if "_group_code" in df.columns:
        df = df.drop(columns=["_group_code"], errors="ignore")

    return postprocess_schedule_df(df)


def parse_teacher_schedule_html_to_group_frames(
    html_path: Path,
    source_name: str | None = None,
) -> dict[str, pd.DataFrame]:
    raw_bytes = html_path.read_bytes()
    html_text = decode_html_text(raw_bytes)
    soup = BeautifulSoup(html_text, "html.parser")
    table = soup.find("table")
    if table is None:
        return {}

    rows = table.find_all("tr")
    if len(rows) < 3:
        return {}

    header_cells = [normalize_cell(cell.get_text(" ", strip=True)) for cell in rows[1].find_all("td")]
    teachers = extract_teacher_headers(header_cells)
    if not teachers:
        return {}

    parsed_rows: list[dict] = []
    current_date: str | None = None
    current_day: str | None = None
    source_label = source_name or html_path.name

    for row in rows[2:]:
        cells = [normalize_cell(cell.get_text(" ", strip=True)) for cell in row.find_all("td")]
        if not any(cells):
            continue

        joined = " ".join(cells)
        day_match = DAY_DATE_RE.search(joined)
        if day_match:
            current_day = day_match.group(1).lower()
            current_date = day_match.group(2)

        interval = None
        for cell in cells:
            maybe_interval = normalize_interval(cell)
            if maybe_interval:
                interval = maybe_interval
                break

        if not interval:
            continue

        day_in_first_cell = bool(DAY_DATE_RE.search(cells[0])) if cells else False
        lesson_offset = 2 if day_in_first_cell else 1
        lesson_cells = cells[lesson_offset + 1 : lesson_offset + 1 + len(teachers)]

        for teacher_name, cell_text in zip(teachers, lesson_cells):
            for item in parse_teacher_cell(
                cell_text=cell_text,
                teacher_name=teacher_name,
                current_date=current_date,
                current_day=current_day,
                interval=interval,
            ):
                item["Файл"] = source_label
                parsed_rows.append(item)

    if not parsed_rows:
        return {}

    df = pd.DataFrame(parsed_rows)
    group_frames: dict[str, pd.DataFrame] = {}

    for group_code, group_df in df.groupby("_group_code", dropna=False):
        cleaned = group_df.drop(columns=["_group_code"], errors="ignore").copy()
        cleaned = postprocess_schedule_df(cleaned)
        if cleaned.empty:
            continue
        group_frames[str(group_code)] = cleaned

    return group_frames
