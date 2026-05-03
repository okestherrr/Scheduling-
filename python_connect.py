from flask import Flask, request, jsonify
import pandas as pd
from itertools import product

app = Flask(__name__, static_folder="userface", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

MAX_REQUESTED_COURSES = 8
MAX_COMBINATIONS_CHECKED = 50000
MAX_SCHEDULES_RETURNED = 5


sections = pd.read_csv("section.csv")
courses = pd.read_csv("Course.csv")
teachers = pd.read_csv("Teacher.csv")

sections.columns = sections.columns.str.strip()
courses.columns = courses.columns.str.strip()
teachers.columns = teachers.columns.str.strip()

df = sections.merge(courses, on='course_id').merge(teachers, on='teacher_id')
available_course_numbers = courses['course_number'].astype(str).str.upper().tolist()


@app.route("/")
def home():
    return app.send_static_file("index.html")


def times_overlap(day1, start1, end1, day2, start2, end2):
    if pd.isna(day1) or pd.isna(day2):
        return False

    day1 = str(day1).strip().upper()
    day2 = str(day2).strip().upper()

    if day1 == 'ONLINE' or day2 == 'ONLINE':
        return False

    if pd.isna(start1) or pd.isna(end1) or pd.isna(start2) or pd.isna(end2):
        return False

    if not set(day1).intersection(set(day2)):
        return False

    def to_min(t):
        h, m, _ = t.split(':')
        return int(h) * 60 + int(m)

    return not (to_min(end1) <= to_min(start2) or to_min(end2) <= to_min(start1))


def has_conflict(schedule):
    for i in range(len(schedule)):
        for j in range(i+1, len(schedule)):
            s1, s2 = schedule[i], schedule[j]
            if times_overlap(
                s1['day'], s1['start_time'], s1['end_time'],
                s2['day'], s2['start_time'], s2['end_time']
            ):
                return True
    return False


def format_time_label(value):
    if pd.isna(value):
        return None
    parsed = pd.to_datetime(str(value), format="%H:%M:%S")
    if pd.isna(parsed):
        return str(value)
    return parsed.strftime("%I:%M %p").lstrip("0")


def serialize_section(section):
    def clean_value(value):
        if pd.isna(value):
            return None
        return value

    return {
        "course_number": clean_value(section["course_number"]),
        "course_name": clean_value(section["course_name"]),
        "section_number": clean_value(section["section_number"]),
        "day": clean_value(section["day"]),
        "start_time": clean_value(section["start_time"]),
        "end_time": clean_value(section["end_time"]),
        "start_label": format_time_label(section["start_time"]),
        "end_label": format_time_label(section["end_time"]),
        "teacher_name": clean_value(section["teacher_name"])
    }


def resolve_course_input(raw_value):
    value = raw_value.strip().upper()
    if not value:
        return None, "empty"

    if value in available_course_numbers:
        return value, None

    if value.isdigit():
        matches = [course for course in available_course_numbers if course.endswith(value)]
        if len(matches) == 1:
            return matches[0], None
        if len(matches) > 1:
            return None, {"type": "ambiguous", "input": value, "matches": matches}

    return None, {"type": "missing", "input": value}


@app.route("/schedule", methods=["POST", "OPTIONS"])
def generate_schedule():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON body."}), 400

    desired_courses = data.get("courses")
    if not isinstance(desired_courses, list) or not desired_courses:
        return jsonify({"error": "'courses' must be a non-empty list."}), 400

    if len(desired_courses) > MAX_REQUESTED_COURSES:
        return jsonify({
            "error": f"A maximum of {MAX_REQUESTED_COURSES} courses is allowed per request."
        }), 400

    normalized_courses = []
    ambiguous_inputs = []
    missing_inputs = []
    for item in desired_courses:
        if not isinstance(item, str):
            return jsonify({"error": "Each course must be a string."}), 400
        resolved, issue = resolve_course_input(item)
        if issue == "empty":
            return jsonify({"error": "Course values cannot be empty."}), 400
        if isinstance(issue, dict) and issue.get("type") == "ambiguous":
            ambiguous_inputs.append(issue)
            continue
        if isinstance(issue, dict) and issue.get("type") == "missing":
            missing_inputs.append(issue["input"])
            continue
        normalized_courses.append(resolved)

    if ambiguous_inputs:
        return jsonify({
            "error": "Some course inputs are ambiguous. Use full course codes.",
            "ambiguous_inputs": ambiguous_inputs
        }), 400

    if missing_inputs:
        return jsonify({
            "error": "Some course inputs were not found.",
            "missing_inputs": missing_inputs
        }), 400

    desired_courses = list(dict.fromkeys(normalized_courses))

    filtered = df[df['course_number'].isin(desired_courses)]

    course_sections = {
        c: filtered[filtered['course_number'] == c].to_dict('records')
        for c in desired_courses
    }

    if any(len(sections_list) == 0 for sections_list in course_sections.values()):
        missing = [c for c, sections_list in course_sections.items() if len(sections_list) == 0]
        return jsonify({"error": "Courses not found.", "missing_courses": missing}), 400

    combos = product(*course_sections.values())

    valid = []
    checked = 0
    for combo in combos:
        checked += 1
        if checked > MAX_COMBINATIONS_CHECKED:
            break
        if not has_conflict(combo):
            valid.append(combo)
            if len(valid) >= MAX_SCHEDULES_RETURNED:
                break

    serialized_schedules = [
        [serialize_section(section) for section in schedule]
        for schedule in valid[:MAX_SCHEDULES_RETURNED]
    ]

    selected_sections = serialized_schedules[0] if serialized_schedules else []

    return jsonify({
        "valid_schedules": serialized_schedules,
        "selected_sections": selected_sections
    })