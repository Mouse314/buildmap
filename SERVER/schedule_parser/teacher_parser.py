import argparse
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import pandas as pd
except ModuleNotFoundError as exc:
    missing = exc.name or "unknown package"
    print(f"Missing Python package: {missing}")
    print("Run with local venv:")
    print("  .\\.venv\\Scripts\\python.exe .\\teacher_parser.py")
    print("or use:")
    print("  .\\run_teacher_parser.ps1")
    sys.exit(1)

from parser import (
    analyze_schedule_anomalies,
    get_first_schedule_date_label,
    save_csv_with_fallback,
    sanitize_filename_component,
    to_display_path,
)
from teacher_html_parser import parse_teacher_schedule_html_to_group_frames

CSV_COLUMNS = [
    "Файл",
    "Дата",
    "День недели",
    "Время",
    "Подгруппа",
    "Дисциплина",
    "Тип занятия",
    "Преподаватель",
    "Кабинет",
]


def normalize_schedule_columns(schedule_df: pd.DataFrame) -> pd.DataFrame:
    frame = schedule_df.copy()
    for column in CSV_COLUMNS:
        if column not in frame.columns:
            frame[column] = ""
    return frame[CSV_COLUMNS]


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


def default_target_date() -> date:
    return date.today() + timedelta(days=1)


def build_arg_parser(default_html_dir: Path, default_output_dir: Path):
    parser = argparse.ArgumentParser(
        description=(
            "Пайплайн расписания преподавателей: скачать HTML-таблицы с teacher.html "
            "и распарсить их в CSV по группам."
        )
    )
    parser.add_argument(
        "--date",
        type=parse_cli_date,
        default=default_target_date(),
        help="Дата для выбора актуальных HTML: YYYY-MM-DD или DD.MM.YYYY (по умолчанию следующий день)",
    )
    parser.add_argument(
        "--html-dir",
        type=Path,
        default=default_html_dir,
        help="Папка для загружаемых HTML",
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
        help="Не скачивать новые HTML, а парсить уже существующие в --html-dir",
    )
    parser.add_argument("--min-delay", type=float, default=1.0, help="Минимальная задержка между запросами (сек)")
    parser.add_argument("--max-delay", type=float, default=2.0, help="Максимальная задержка между запросами (сек)")
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Ограничить число HTML-файлов для парсинга (0 = без ограничения, удобно для теста)",
    )
    return parser


def ensure_empty_directory(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    for child in directory.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def download_teacher_schedule_html(
    target_date: date,
    output_dir: Path,
    min_delay: float,
    max_delay: float,
) -> tuple[int, int]:
    try:
        from web_worm.download_teacher_schedule_html import build_session, collect_links_for_date, download_links
    except ModuleNotFoundError as exc:
        missing = exc.name or "unknown package"
        print(f"Missing Python package for downloader: {missing}")
        print("Install dependencies in local venv:")
        print("  .\\.venv\\Scripts\\pip.exe install -r .\\requirements.txt")
        return 0, 1

    print(f"\nПодготовка папки HTML: {output_dir}")
    ensure_empty_directory(output_dir)
    print("Папка HTML очищена перед скачиванием.")

    session = build_session()

    try:
        links = collect_links_for_date(session, target_date)
    except Exception as exc:
        print(f"Не удалось загрузить страницу занятости преподавателей: {exc}")
        return 0, 1

    if not links:
        print("Подходящие HTML для выбранной даты не найдены.")
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


def find_teacher_html_files(search_root: Path, preferred_dir: Path | None = None):
    search_root = search_root.resolve()

    if preferred_dir is not None:
        candidate_dirs = [preferred_dir.resolve()]
    else:
        candidate_dirs = [
            search_root / "schedule_teacher",
            search_root.parent / "schedule_teacher",
        ]

    found_files = []
    seen = set()

    for folder in candidate_dirs:
        if not folder.exists() or not folder.is_dir():
            continue

        for html_file in sorted(folder.glob("*.html")):
            resolved = html_file.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            found_files.append(resolved)

    return found_files


def merge_group_frames(group_frames_by_file: list[dict[str, pd.DataFrame]]) -> dict[tuple[str, str], pd.DataFrame]:
    merged: dict[tuple[str, str], list[pd.DataFrame]] = {}

    for file_frames in group_frames_by_file:
        for group_name, frame in file_frames.items():
            if frame.empty:
                continue

            if "Дата" not in frame.columns:
                date_label = sanitize_filename_component(get_first_schedule_date_label(frame), "unknown-date")
                merged.setdefault((date_label, group_name), []).append(frame)
                continue

            for date_value, date_df in frame.groupby("Дата", dropna=False):
                date_label = sanitize_filename_component(str(date_value), "unknown-date")
                key = (date_label, group_name)
                merged.setdefault(key, []).append(date_df.copy())

    result: dict[tuple[str, str], pd.DataFrame] = {}
    for key, frames in merged.items():
        combined = pd.concat(frames, ignore_index=True)
        combined = combined.drop_duplicates().reset_index(drop=True)
        result[key] = combined

    return result


def parse_teacher_html_files_to_csv(html_files, output_root: Path, script_dir: Path, limit: int = 0):
    if limit > 0:
        html_files = html_files[:limit]

    group_frames_by_file: list[dict[str, pd.DataFrame]] = []
    parsed_files = 0

    for html_path in html_files:
        try:
            group_frames = parse_teacher_schedule_html_to_group_frames(html_path)
        except Exception as exc:
            print(f"Ошибка при обработке файла {html_path.name}: {exc}")
            continue

        if not group_frames:
            print(f"Файл {html_path.name} обработан, но данных не найдено.")
            continue

        parsed_files += 1
        group_frames_by_file.append(group_frames)
        print(f"Файл {html_path.name}: извлечено групп {len(group_frames)}")

    if not group_frames_by_file:
        print("Не удалось получить данные из найденных HTML-файлов.")
        return 0

    merged_groups = merge_group_frames(group_frames_by_file)
    exported_files = []
    anomaly_reports = []
    total_rows = 0
    total_anomalous_rows = 0
    total_reason_counts = {}

    for (date_label, group_name), schedule_df in sorted(merged_groups.items()):
        safe_group_name = sanitize_filename_component(group_name, "unknown-group")
        target_csv = output_root / date_label / f"{safe_group_name}.csv"
        saved_csv = save_csv_with_fallback(normalize_schedule_columns(schedule_df), target_csv)
        exported_files.append(saved_csv)
        rel_saved = to_display_path(saved_csv, script_dir)
        print(f"Сохранён файл: {rel_saved} ({len(schedule_df)} строк)")

        anomaly_info = analyze_schedule_anomalies(schedule_df)
        total_rows += int(anomaly_info["total_rows"])
        total_anomalous_rows += int(anomaly_info["anomalous_rows"])
        for reason, count in anomaly_info["reason_counts"].items():
            total_reason_counts[reason] = total_reason_counts.get(reason, 0) + int(count)

        anomaly_reports.append(
            {
                "group_name": safe_group_name,
                "csv_path": rel_saved,
                "total_rows": anomaly_info["total_rows"],
                "anomalous_rows": anomaly_info["anomalous_rows"],
                "reason_counts": anomaly_info["reason_counts"],
            }
        )

    output_display = to_display_path(output_root, script_dir)
    print(f"\nОбработано HTML: {parsed_files}")
    print(f"Экспорт завершён: {len(exported_files)} файл(ов) в папке {output_display}")
    print(f"Итого аномалий: {total_anomalous_rows} из {total_rows} строк")
    if total_reason_counts:
        total_reasons_line = "; ".join(
            f"{reason}: {count}" for reason, count in sorted(total_reason_counts.items())
        )
        print(f"Итог по причинам: {total_reasons_line}")

    print("\nАнализ аномальных строк по результирующим CSV:")
    for report in anomaly_reports[:20]:
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

    if len(anomaly_reports) > 20:
        print(f"... и ещё {len(anomaly_reports) - 20} файл(ов)")

    return len(exported_files)


def main():
    script_dir = Path(__file__).resolve().parent
    parser = build_arg_parser(
        default_html_dir=script_dir / "schedule_teacher",
        default_output_dir=script_dir / "parsed_schedule_teacher",
    )
    args = parser.parse_args()

    if args.min_delay < 1.0:
        parser.error("--min-delay должен быть >= 1.0")
    if args.max_delay < args.min_delay:
        parser.error("--max-delay должен быть >= --min-delay")

    html_dir = args.html_dir.resolve()
    output_root = args.output_dir.resolve()

    download_failed = 0
    if args.skip_download:
        print(f"Пропуск скачивания HTML. Будет использована папка: {html_dir}")
    else:
        print(f"Дата для скачивания HTML: {args.date.isoformat()}")
        downloaded, failed = download_teacher_schedule_html(
            target_date=args.date,
            output_dir=html_dir,
            min_delay=args.min_delay,
            max_delay=args.max_delay,
        )
        print(f"Скачано HTML: {downloaded}")
        print(f"Ошибок скачивания: {failed}")
        download_failed = failed

        if downloaded == 0 and failed > 0:
            print("Скачивание полностью завершилось с ошибками. Парсинг не будет запущен.")
            return 2

    html_files = find_teacher_html_files(script_dir, preferred_dir=html_dir)
    if not html_files:
        print(f"HTML-файлы не найдены в папке: {html_dir}")
        return 0 if download_failed == 0 else 2

    exported_count = parse_teacher_html_files_to_csv(
        html_files=html_files,
        output_root=output_root,
        script_dir=script_dir,
        limit=args.limit,
    )
    if exported_count == 0:
        return 1
    return 0 if download_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
