from flask import Flask, request, jsonify
import pandas as pd
from itertools import product
import re

app = Flask(__name__, static_folder=".", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

MAX_CLASSES_PER_SEARCH = 8
MAX_SCHEDULE_CHECKS = 50000
MAX_SCHEDULE_RESULTS = 5
MAX_SCHEDULE_PAGE_SIZE = 25

sections = pd.read_csv("section.csv")
courses = pd.read_csv("course.csv")
teachers = pd.read_csv("teacher.csv")

sections.columns = sections.columns.str.strip()
courses.columns = courses.columns.str.strip()
teachers.columns = teachers.columns.str.strip()

merged_rows = sections.merge(courses, on='course_id')
merged_rows = merged_rows.merge(teachers, on='teacher_id')

class_codes = []
for course_number in courses['course_number']:
    upper_code = str(course_number).upper()
    if upper_code not in class_codes:
        class_codes.append(upper_code)


def normalize_code(code_text):
    return re.sub(r"[^A-Z0-9]", "", str(code_text).upper())


normalized_code_map = {}
for saved_code in class_codes:
    normalized = normalize_code(saved_code)
    if normalized not in normalized_code_map:
        normalized_code_map[normalized] = []
    normalized_code_map[normalized].append(saved_code)


@app.route("/")
def home():
    return app.send_static_file("homepage.html")


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


def bad_request(message, **extra_fields):
    payload = {"error": message}
    payload.update(extra_fields)
    return jsonify(payload), 400


def get_json_body(default_empty=False):
    body = request.get_json(silent=True)

    if body is None and default_empty:
        return {}

    if not isinstance(body, dict):
        return None

    return body


def time_to_minutes(time_text):
    parts = str(time_text).split(':')
    return int(parts[0]) * 60 + int(parts[1])


def make_time_label(time_text):
    if pd.isna(time_text):
        return None

    parts = str(time_text).split(':')
    hour = int(parts[0])
    minute = int(parts[1])

    period = "AM"
    if hour >= 12:
        period = "PM"
        if hour > 12:
            hour = hour - 12
    if hour == 0:
        hour = 12

    return str(hour) + ":" + str(minute).zfill(2) + " " + period


def clean_value(value):
    if pd.isna(value):
        return None
    return value


def times_overlap(first_day, first_start, first_end, second_day, second_start, second_end):
    if pd.isna(first_day) or pd.isna(second_day):
        return False

    first_day = str(first_day).strip().upper()
    second_day = str(second_day).strip().upper()

    if first_day == 'ONLINE' or second_day == 'ONLINE':
        return False

    if pd.isna(first_start) or pd.isna(first_end) or pd.isna(second_start) or pd.isna(second_end):
        return False

    same_day_found = False
    for day_letter in first_day:
        if day_letter in second_day:
            same_day_found = True
            break
    
    if not same_day_found:
        return False

    first_class_start = time_to_minutes(first_start)
    first_class_end = time_to_minutes(first_end)
    second_class_start = time_to_minutes(second_start)
    second_class_end = time_to_minutes(second_end)

    classes_do_not_overlap = (first_class_end <= second_class_start) or (second_class_end <= first_class_start)
    return not classes_do_not_overlap


def has_conflict(schedule_list):
    for i in range(len(schedule_list)):
        for j in range(i+1, len(schedule_list)):
            first_class = schedule_list[i]
            second_class = schedule_list[j]
            if times_overlap(
                first_class['day'], first_class['start_time'], first_class['end_time'],
                second_class['day'], second_class['start_time'], second_class['end_time']
            ):
                return True
    return False


def clean_section(section):
    return {
        "course_number": clean_value(section["course_number"]),
        "course_name": clean_value(section["course_name"]),
        "section_number": clean_value(section["section_number"]),
        "day": clean_value(section["day"]),
        "start_time": clean_value(section["start_time"]),
        "end_time": clean_value(section["end_time"]),
        "start_label": make_time_label(section["start_time"]),
        "end_label": make_time_label(section["end_time"]),
        "teacher_name": clean_value(section["teacher_name"])
    }


def clean_course(course):
    return {
        "course_number": clean_value(course["course_number"]),
        "course_name": clean_value(course["course_name"]),
        "credits": clean_value(course["credits"])
    }


def get_term_number(raw_term):
    if raw_term is None or raw_term == "":
        return None, None

    try:
        return int(raw_term), None
    except (TypeError, ValueError):
        return None, "'term' must be a whole number."


def get_paging_values(raw_start_index, raw_page_size):
    try:
        start_index = int(raw_start_index if raw_start_index is not None else 0)
    except (TypeError, ValueError):
        return None, None, "'start_index' must be a whole number."

    try:
        page_size = int(raw_page_size if raw_page_size is not None else MAX_SCHEDULE_RESULTS)
    except (TypeError, ValueError):
        return None, None, "'page_size' must be a whole number."

    if start_index < 0:
        return None, None, "'start_index' must be 0 or greater."

    if page_size <= 0:
        return None, None, "'page_size' must be greater than 0."

    if page_size > MAX_SCHEDULE_PAGE_SIZE:
        return None, None, f"'page_size' cannot be greater than {MAX_SCHEDULE_PAGE_SIZE}."

    return start_index, page_size, None


def get_locked_sections_map(raw_locked_sections):
    if raw_locked_sections is None:
        return {}, None

    if not isinstance(raw_locked_sections, list):
        return None, "'locked_sections' must be a list."

    locked_map = {}

    for locked_item in raw_locked_sections:
        if not isinstance(locked_item, dict):
            return None, "Each locked section must be an object."

        raw_course_code = locked_item.get("course_number")
        raw_section_code = locked_item.get("section_number")

        if not isinstance(raw_course_code, str) or not raw_course_code.strip():
            return None, "Locked section course_number must be a non-empty string."

        if not isinstance(raw_section_code, str) or not raw_section_code.strip():
            return None, "Locked section section_number must be a non-empty string."

        found_code, problem_type, _ = check_course(raw_course_code)
        if problem_type:
            return None, f"Locked course '{raw_course_code}' was not found."

        locked_map[found_code] = raw_section_code.strip().upper()

    return locked_map, None


def format_teacher_class(section):
    day_text = clean_value(section["day"])
    start_time = clean_value(section["start_time"])
    end_time = clean_value(section["end_time"])

    if day_text == "ONLINE":
        meeting_text = "ONLINE"
    else:
        start_label = make_time_label(start_time)
        end_label = make_time_label(end_time)
        meeting_text = f"{day_text} {start_label} - {end_label}"

    return {
        "course_number": clean_value(section["course_number"]),
        "course_name": clean_value(section["course_name"]),
        "section_number": clean_value(section["section_number"]),
        "term": clean_value(section["term"]),
        "meeting": meeting_text,
        "day": day_text,
        "start_label": make_time_label(start_time),
        "end_label": make_time_label(end_time),
        "tricky_scale": clean_value(section["tricky_scale"])
    }


def build_teacher_items(query_text, term_filter):
    teacher_table = merged_rows.copy()

    if term_filter is not None:
        teacher_table = teacher_table[teacher_table["term"] == term_filter]

    if query_text:
        lowered_query = query_text.strip().lower()
        teacher_table = teacher_table[
            teacher_table["teacher_name"].astype(str).str.lower().str.contains(lowered_query, na=False)
        ]

    teacher_items = []

    for teacher_name, group in teacher_table.groupby("teacher_name", sort=True):
        first_row = group.iloc[0]
        class_rows = []

        for _, one_class in group.sort_values(
            ["course_number", "term", "day", "start_time", "section_number"],
            na_position="last"
        ).iterrows():
            class_rows.append(format_teacher_class(one_class))

        teacher_items.append({
            "teacher_name": teacher_name,
            "rmp_score": clean_value(first_row["rmp_score"]),
            "difficulty": clean_value(first_row["difficulty"]),
            "ideal": clean_value(first_row["ideal"]),
            "classes": class_rows
        })

    return teacher_items


def check_course(user_text):
    class_code = user_text.strip().upper()
    normalized_input = normalize_code(class_code)
    
    if not normalized_input:
        return None, "empty", None

    if normalized_input in normalized_code_map:
        matches = normalized_code_map[normalized_input]
        if len(matches) == 1:
            return matches[0], None, None
        return None, "ambiguous", matches

    if normalized_input.isdigit():
        matching_codes = []
        for saved_code in class_codes:
            if normalize_code(saved_code).endswith(normalized_input):
                matching_codes.append(saved_code)
        
        if len(matching_codes) == 1:
            return matching_codes[0], None, None
        
        if len(matching_codes) > 1:
            return None, "ambiguous", matching_codes

    return None, "missing", None


def remove_duplicate_codes(code_list):
    unique_codes = []

    for class_code in code_list:
        if class_code not in unique_codes:
            unique_codes.append(class_code)

    return unique_codes


def check_requested_codes(requested_codes):
    good_codes = []
    unclear_codes = []
    missing_codes = []

    for typed_code in requested_codes:
        if not isinstance(typed_code, str):
            return None, bad_request("Each course must be a string.")

        found_code, problem_type, matching_codes = check_course(typed_code)

        if problem_type == "empty":
            return None, bad_request("Course values cannot be empty.")

        if problem_type == "ambiguous":
            unclear_codes.append({
                "type": "ambiguous",
                "input": typed_code.strip().upper(),
                "matches": matching_codes
            })
            continue

        if problem_type == "missing":
            missing_codes.append(typed_code.strip().upper())
            continue

        good_codes.append(found_code)

    if unclear_codes:
        return None, bad_request(
            "Some course inputs are ambiguous. Use full course codes.",
            ambiguous_inputs=unclear_codes
        )

    if missing_codes:
        return None, bad_request(
            "Some course inputs were not found.",
            missing_inputs=missing_codes
        )

    return remove_duplicate_codes(good_codes), None


def group_sections_by_code(code_list, term_filter, locked_sections):
    sections_for_each_code = {}
    missing_codes = []

    filtered_rows = merged_rows
    if term_filter is not None:
        filtered_rows = filtered_rows[filtered_rows['term'] == term_filter]

    for class_code in code_list:
        class_sections = filtered_rows[filtered_rows['course_number'] == class_code].to_dict('records')

        locked_section_number = locked_sections.get(class_code)
        if locked_section_number:
            class_sections = [
                section
                for section in class_sections
                if str(section.get('section_number', '')).strip().upper() == locked_section_number
            ]

        sections_for_each_code[class_code] = class_sections

        if len(class_sections) == 0:
            missing_codes.append(class_code)

    return sections_for_each_code, missing_codes


def build_valid_schedules(sections_for_each_code, start_index, page_size):
    valid_schedules_page = []
    checked_schedule_count = 0
    seen_valid_count = 0
    reached_max_checks = False

    for possible_schedule in product(*sections_for_each_code.values()):
        checked_schedule_count += 1

        if checked_schedule_count > MAX_SCHEDULE_CHECKS:
            reached_max_checks = True
            break

        if has_conflict(possible_schedule):
            continue

        if seen_valid_count < start_index:
            seen_valid_count += 1
            continue

        valid_schedules_page.append(possible_schedule)
        seen_valid_count += 1

        if len(valid_schedules_page) > page_size:
            break

    has_more = len(valid_schedules_page) > page_size
    if has_more:
        valid_schedules_page = valid_schedules_page[:page_size]

    if reached_max_checks and len(valid_schedules_page) == page_size:
        has_more = True

    return valid_schedules_page, has_more


def format_schedules(schedule_list):
    ready_schedules = []

    for one_schedule in schedule_list:
        ready_schedule = []
        for class_section in one_schedule:
            ready_schedule.append(clean_section(class_section))
        ready_schedules.append(ready_schedule)

    return ready_schedules


@app.route("/courses", methods=["GET"])
def get_courses():
    course_items = []

    for _, course in courses.iterrows():
        course_items.append(clean_course(course))

    course_items.sort(key=sort_course_item)
    return jsonify({"courses": course_items})


def sort_course_item(course_item):
    return str(course_item["course_number"])


@app.route("/schedule", methods=["POST", "OPTIONS"])
def make_schedule():
    if request.method == "OPTIONS":
        return ("", 204)

    body = get_json_body()
    if body is None:
        return bad_request("Invalid JSON body.")

    requested_codes = body.get("courses")
    if not isinstance(requested_codes, list) or not requested_codes:
        return bad_request("'courses' must be a non-empty list.")

    if len(requested_codes) > MAX_CLASSES_PER_SEARCH:
        return bad_request(f"A maximum of {MAX_CLASSES_PER_SEARCH} courses is allowed per request.")

    term_filter, term_error = get_term_number(body.get("term"))
    if term_error:
        return bad_request(term_error)

    start_index, page_size, paging_error = get_paging_values(
        body.get("start_index"),
        body.get("page_size")
    )
    if paging_error:
        return bad_request(paging_error)

    locked_sections, locked_error = get_locked_sections_map(body.get("locked_sections"))
    if locked_error:
        return bad_request(locked_error)

    good_codes, error_response = check_requested_codes(requested_codes)
    if error_response:
        return error_response

    sections_for_each_code, missing_codes = group_sections_by_code(good_codes, term_filter, locked_sections)
    if missing_codes:
        return bad_request(
            "Courses not found for the selected term." if term_filter is not None else "Courses not found.",
            missing_courses=missing_codes,
            term=term_filter
        )

    valid_schedules, has_more = build_valid_schedules(sections_for_each_code, start_index, page_size)
    ready_schedules = format_schedules(valid_schedules)
    first_schedule = ready_schedules[0] if ready_schedules else []
    next_start_index = start_index + len(ready_schedules)

    return jsonify({
        "valid_schedules": ready_schedules,
        "selected_sections": first_schedule,
        "term": term_filter,
        "start_index": start_index,
        "page_size": page_size,
        "next_start_index": next_start_index,
        "has_more": has_more,
        "locked_sections": [
            {"course_number": course_number, "section_number": section_number}
            for course_number, section_number in locked_sections.items()
        ]
    })


@app.route("/teachers/search", methods=["POST", "OPTIONS"])
def search_teachers():
    if request.method == "OPTIONS":
        return ("", 204)

    body = get_json_body(default_empty=True)
    if body is None:
        return bad_request("Invalid JSON body.")

    query_text = body.get("query", "")
    if not isinstance(query_text, str):
        return bad_request("'query' must be a string.")

    term_filter, term_error = get_term_number(body.get("term"))
    if term_error:
        return bad_request(term_error)

    teacher_items = build_teacher_items(query_text, term_filter)

    return jsonify({
        "teachers": teacher_items,
        "count": len(teacher_items),
        "term": term_filter
    })


if __name__ == "__main__":
    app.run(debug=True)