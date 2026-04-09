import pdfplumber
import re
import pandas as pd

def parse_schedule_pdf(pdf_path):
    # Регулярные выражения для поиска сущностей в строке
    # Кабинет: формат "16-403", "14-234"
    room_regex = re.compile(r'\b(\d{2}-\d{3})\b') 
    
    # Преподаватель: Фамилия И.О. (например, "Здоровенко М.Ю.", "Подлевских М.Н.")
    teacher_regex = re.compile(r'([А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.)')
    
    # Подгруппа: например, "01 подгруппа"
    subgroup_regex = re.compile(r'(\d{2}\s+подгруппа)')

    parsed_data = []

    # Открываем PDF файл
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Извлекаем таблицы с текущей страницы
            tables = page.extract_tables()
            
            for table in tables:
                current_date = None
                current_day = None
                
                for row in table:
                    # Пропускаем пустые строки или заголовки
                    if not row or len(row) < 3:
                        continue
                        
                    # В вашей таблице первый столбец иногда содержит День и Дату, 
                    # второй - время, третий - саму пару.
                    # pdfplumber может объединять их по-разному, ориентируемся на структуру.
                    
                    date_col = str(row[0]).strip() if row[0] else ""
                    time_col = str(row[1]).strip() if row[1] else ""
                    lesson_col = str(row[2]).strip() if len(row) > 2 and row[2] else ""

                    # Если в колонке с датой есть текст, обновляем текущую дату (например, "22.12.25 понедельник")
                    if date_col and len(date_col) > 5:
                        # Разделяем дату и день недели, если они склеились
                        date_parts = date_col.split()
                        if len(date_parts) >= 2:
                            current_date = date_parts[0]
                            current_day = date_parts[1]
                        else:
                            current_date = date_col

                    # Если нет времени или названия пары, идем дальше
                    if not time_col or not lesson_col or lesson_col == 'None':
                        continue

                    # Если пар несколько в одно время (например, для разных подгрупп), 
                    # они могут быть разделены переносом строки \n
                    lessons = lesson_col.split('\n')
                    
                    for lesson in lessons:
                        lesson = lesson.strip()
                        if not lesson:
                            continue

                        # Ищем кабинет
                        room_match = room_regex.search(lesson)
                        room = room_match.group(1) if room_match else "Не указан"

                        # Ищем преподавателя
                        teacher_match = teacher_regex.search(lesson)
                        teacher = teacher_match.group(1) if teacher_match else "Не указан"

                        # Ищем подгруппу
                        subgroup_match = subgroup_regex.search(lesson)
                        subgroup = subgroup_match.group(1) if subgroup_match else "Общая группа"

                        # Очищаем название дисциплины от кабинета, преподавателя и подгруппы
                        discipline = lesson
                        if room != "Не указан":
                            discipline = discipline.replace(room, "")
                        if teacher != "Не указан":
                            discipline = discipline.replace(teacher, "")
                        if subgroup != "Общая группа":
                            # Убираем упоминание группы и подгруппы (ПМИб-2301-52-00, 01 подгруппа)
                            discipline = re.sub(r'ПМИ[б6]-2301-52-00,\s*' + subgroup, "", discipline)

                        # Убираем лишние пробелы
                        discipline = " ".join(discipline.split())

                        # Сохраняем результат
                        parsed_data.append({
                            "Дата": current_date,
                            "День недели": current_day,
                            "Время": time_col,
                            "Подгруппа": subgroup,
                            "Дисциплина": discipline,
                            "Преподаватель": teacher,
                            "Кабинет": room
                        })

    # Преобразуем список словарей в DataFrame для удобства
    df = pd.DataFrame(parsed_data)
    return df

# Использование скрипта:
if __name__ == "__main__":
    file_path = "schedule.pdf" # Укажите здесь путь к вашему PDF файлу
    try:
        schedule_df = parse_schedule_pdf(file_path)
        print(schedule_df.head(10)) # Выводим первые 10 строк для проверки
        
        # Сохраняем в CSV для удобного просмотра в Excel
        schedule_df.to_csv("parsed_schedule.csv", index=False, encoding="utf-8-sig")
        print("\nРасписание успешно сохранено в файл parsed_schedule.csv")
    except Exception as e:
        print(f"Произошла ошибка при обработке: {e}")