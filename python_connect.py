from flask import Flask, request, jsonify
import pandas as pd
from itertools import product

app = Flask(__name__, static_folder=".", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

MAX_CLASSES_PER_SEARCH = 8
MAX_SCHEDULE_CHECKS = 50000
MAX_SCHEDULE_RESULTS = 5

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


@app.route("/")
def home():
    return app.send_static_file("homepage.html")


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


def check_course(user_text):
    class_code = user_text.strip().upper()
    
    if not class_code:
        return None, "empty", None

    if class_code in class_codes:
        return class_code, None, None

    if class_code.isdigit():
        matching_codes = []
        for saved_code in class_codes:
            if saved_code.endswith(class_code):
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
            return None, jsonify({"error": "Each course must be a string."}), 400

        found_code, problem_type, matching_codes = check_course(typed_code)

        if problem_type == "empty":
            return None, jsonify({"error": "Course values cannot be empty."}), 400

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
        return None, jsonify({
            "error": "Some course inputs are ambiguous. Use full course codes.",
            "ambiguous_inputs": unclear_codes
        }), 400

    if missing_codes:
        return None, jsonify({
            "error": "Some course inputs were not found.",
            "missing_inputs": missing_codes
        }), 400

    return remove_duplicate_codes(good_codes), None, None


def group_sections_by_code(code_list):
    sections_for_each_code = {}
    missing_codes = []

    for class_code in code_list:
        class_sections = merged_rows[merged_rows['course_number'] == class_code].to_dict('records')
        sections_for_each_code[class_code] = class_sections

        if len(class_sections) == 0:
            missing_codes.append(class_code)

    return sections_for_each_code, missing_codes


def build_valid_schedules(sections_for_each_code):
    valid_schedules = []
    checked_schedule_count = 0

    for possible_schedule in product(*sections_for_each_code.values()):
        checked_schedule_count += 1

        if checked_schedule_count > MAX_SCHEDULE_CHECKS:
            break

        if not has_conflict(possible_schedule):
            valid_schedules.append(possible_schedule)

        if len(valid_schedules) >= MAX_SCHEDULE_RESULTS:
            break

    return valid_schedules


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

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid JSON body."}), 400

    requested_codes = body.get("courses")
    if not isinstance(requested_codes, list) or not requested_codes:
        return jsonify({"error": "'courses' must be a non-empty list."}), 400

    if len(requested_codes) > MAX_CLASSES_PER_SEARCH:
        return jsonify({
            "error": f"A maximum of {MAX_CLASSES_PER_SEARCH} courses is allowed per request."
        }), 400

    good_codes, error_body, error_code = check_requested_codes(requested_codes)
    if error_body:
        return error_body, error_code

    sections_for_each_code, missing_codes = group_sections_by_code(good_codes)
    if missing_codes:
        return jsonify({"error": "Courses not found.", "missing_courses": missing_codes}), 400

    valid_schedules = build_valid_schedules(sections_for_each_code)
    ready_schedules = format_schedules(valid_schedules[:MAX_SCHEDULE_RESULTS])
    first_schedule = ready_schedules[0] if ready_schedules else []

    return jsonify({
        "valid_schedules": ready_schedules,
        "selected_sections": first_schedule
    })


if __name__ == "__main__":
    app.run(debug=True)