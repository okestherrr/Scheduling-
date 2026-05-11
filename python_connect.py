from flask import Flask, request, jsonify
import pandas as pd
from itertools import product

app = Flask(__name__, static_folder="userface", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

MAX_COURSES_PER_REQUEST = 8
MAX_COMBOS_TO_CHECK = 50000
MAX_SCHEDULES_TO_RETURN = 5

sections = pd.read_csv("section.csv")
courses = pd.read_csv("course.csv")
teachers = pd.read_csv("teacher.csv")

sections.columns = sections.columns.str.strip()
courses.columns = courses.columns.str.strip()
teachers.columns = teachers.columns.str.strip()

all_data = sections.merge(courses, on='course_id')
all_data = all_data.merge(teachers, on='teacher_id')

course_list = []
for num in courses['course_number']:
    num_upper = str(num).upper()
    if num_upper not in course_list:
        course_list.append(num_upper)


@app.route("/")
def home():
    return app.send_static_file("index.html")


def to_min(time_value):
    parts = str(time_value).split(':')
    return int(parts[0]) * 60 + int(parts[1])


def time_label(time_value):
    if pd.isna(time_value):
        return None

    parts = str(time_value).split(':')
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


def times_overlap(day1, start1, end1, day2, start2, end2):
    if pd.isna(day1) or pd.isna(day2):
        return False

    day1 = str(day1).strip().upper()
    day2 = str(day2).strip().upper()

    if day1 == 'ONLINE' or day2 == 'ONLINE':
        return False

    if pd.isna(start1) or pd.isna(end1) or pd.isna(start2) or pd.isna(end2):
        return False

    has_matching_day = False
    for char in day1:
        if char in day2:
            has_matching_day = True
            break
    
    if not has_matching_day:
        return False

    class1_start = to_min(start1)
    class1_end = to_min(end1)
    class2_start = to_min(start2)
    class2_end = to_min(end2)

    they_dont_overlap = (class1_end <= class2_start) or (class2_end <= class1_start)
    return not they_dont_overlap


def has_conflict(schedule):
    for i in range(len(schedule)):
        for j in range(i+1, len(schedule)):
            class1 = schedule[i]
            class2 = schedule[j]
            if times_overlap(
                class1['day'], class1['start_time'], class1['end_time'],
                class2['day'], class2['start_time'], class2['end_time']
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
        "start_label": time_label(section["start_time"]),
        "end_label": time_label(section["end_time"]),
        "teacher_name": clean_value(section["teacher_name"])
    }


def check_course(user_input):
    code = user_input.strip().upper()
    
    if not code:
        return None, "empty", None

    if code in course_list:
        return code, None, None

    if code.isdigit():
        found_matches = []
        for course_code in course_list:
            if course_code.endswith(code):
                found_matches.append(course_code)
        
        if len(found_matches) == 1:
            return found_matches[0], None, None
        
        if len(found_matches) > 1:
            return None, "ambiguous", found_matches

    return None, "missing", None


@app.route("/schedule", methods=["POST", "OPTIONS"])
def make_schedule():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON body."}), 400

    desired_courses = data.get("courses")
    if not isinstance(desired_courses, list) or not desired_courses:
        return jsonify({"error": "'courses' must be a non-empty list."}), 400

    if len(desired_courses) > MAX_COURSES_PER_REQUEST:
        return jsonify({
            "error": f"A maximum of {MAX_COURSES_PER_REQUEST} courses is allowed per request."
        }), 400

    valid_courses = []
    ambiguous_courses = []
    missing_courses = []
    for user_course in desired_courses:
        if not isinstance(user_course, str):
            return jsonify({"error": "Each course must be a string."}), 400
        resolved, issue_type, matches = check_course(user_course)
        if issue_type == "empty":
            return jsonify({"error": "Course values cannot be empty."}), 400
        if issue_type == "ambiguous":
            ambiguous_courses.append({
                "type": "ambiguous",
                "input": user_course.strip().upper(),
                "matches": matches
            })
            continue
        if issue_type == "missing":
            missing_courses.append(user_course.strip().upper())
            continue
        valid_courses.append(resolved)

    if ambiguous_courses:
        return jsonify({
            "error": "Some course inputs are ambiguous. Use full course codes.",
            "ambiguous_inputs": ambiguous_courses
        }), 400

    if missing_courses:
        return jsonify({
            "error": "Some course inputs were not found.",
            "missing_inputs": missing_courses
        }), 400

    final_courses = []
    already_added = set()
    for course in valid_courses:
        if course not in already_added:
            final_courses.append(course)
            already_added.add(course)

    matching_data = all_data[all_data['course_number'].isin(final_courses)]

    sections_by_course = {}
    for course_num in final_courses:
        course_rows = matching_data[matching_data['course_number'] == course_num].to_dict('records')
        sections_by_course[course_num] = course_rows

    not_found = []
    for course_num, section_list in sections_by_course.items():
        if len(section_list) == 0:
            not_found.append(course_num)

    if not_found:
        return jsonify({"error": "Courses not found.", "missing_courses": not_found}), 400

    combos = product(*sections_by_course.values())

    good_schedules = []
    combos_tested = 0
    for schedule_combo in combos:
        combos_tested += 1
        if combos_tested > MAX_COMBOS_TO_CHECK:
            break
        if not has_conflict(schedule_combo):
            good_schedules.append(schedule_combo)
            if len(good_schedules) >= MAX_SCHEDULES_TO_RETURN:
                break

    clean_schedules = []
    for schedule in good_schedules[:MAX_SCHEDULES_TO_RETURN]:
        clean_schedule = []
        for section in schedule:
            clean_schedule.append(clean_section(section))
        clean_schedules.append(clean_schedule)

    first_schedule = clean_schedules[0] if clean_schedules else []

    return jsonify({
        "valid_schedules": clean_schedules,
        "selected_sections": first_schedule
    })