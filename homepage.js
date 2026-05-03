const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "class-scheduler.firebaseapp.com",
  projectId: "class-scheduler",
  storageBucket: "class-scheduler.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const API_BASE_URL = (window.API_BASE_URL || "").trim();
const hasValidApiBase = API_BASE_URL && !API_BASE_URL.includes("REPLACE_WITH_YOUR_BACKEND_URL");
const isLocalhost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const resolvedApiBase = hasValidApiBase
  ? API_BASE_URL.replace(/\/$/, "")
  : (isLocalhost ? "http://127.0.0.1:5000" : "");
const SCHEDULE_ENDPOINT = resolvedApiBase ? `${resolvedApiBase}/schedule` : "/schedule";

function getScheduleEndpoints() {
  const endpoints = [];

  if (hasValidApiBase) {
    endpoints.push(`${API_BASE_URL.replace(/\/$/, "")}/schedule`);
  }

  if (window.location.origin && window.location.origin.startsWith("http")) {
    endpoints.push(`${window.location.origin.replace(/\/$/, "")}/schedule`);
  }

  endpoints.push("http://127.0.0.1:5000/schedule");
  endpoints.push("http://localhost:5000/schedule");
  endpoints.push(SCHEDULE_ENDPOINT);

  return [...new Set(endpoints)];
}

async function postScheduleRequest(payload) {
  const endpoints = getScheduleEndpoints();
  let lastNetworkError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      return { response, endpoint };
    } catch (error) {
      lastNetworkError = error;
    }
  }

  throw lastNetworkError || new Error("Could not connect to any scheduler API endpoint.");
}

let db = null;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (error) {
  console.warn("Firebase initialization failed:", error);
}

if (db) {
  db.collection("courses").get().then(snapshot => {
    const container = document.getElementById("courses");
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement("div");
      div.textContent = `${data.course_number}: ${data.course_name} (${data.credits} credits)`;
      container.appendChild(div);
    });
  }).catch(error => {
    console.warn("Could not load Firebase courses:", error);
  });
}

let potentialSchedules = [];
let selectedScheduleIndex = 0;

function parseTimeToMinutes(value) {
  if (!value || value === "NULL") {
    return null;
  }

  const [hourText, minuteText] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return (hour * 60) + minute;
}

function formatMinutes(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function scheduleByDay(sections) {
  const dayMap = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
  const grouped = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };

  sections.forEach(section => {
    const dayText = section.day || "";
    if (dayText === "ONLINE") {
      return;
    }

    const start = parseTimeToMinutes(section.start_time);
    const end = parseTimeToMinutes(section.end_time);
    if (start === null || end === null) {
      return;
    }

    for (const letter of dayText) {
      const dayName = dayMap[letter];
      if (!dayName) {
        continue;
      }

      grouped[dayName].push({
        ...section,
        start,
        end
      });
    }
  });

  Object.values(grouped).forEach(entries => entries.sort((a, b) => a.start - b.start));
  return grouped;
}

function renderSelectedSections(sections) {
  const container = document.getElementById("selectedSections");
  container.innerHTML = "";

  if (!sections.length) {
    container.textContent = "No valid sections found.";
    return;
  }

  sections.forEach(section => {
    const line = document.createElement("div");
    const isIdeal = Boolean(section.ideal || section.is_ideal);
    line.className = `section-item${isIdeal ? " ideal" : ""}`;
    const timeText = section.day === "ONLINE"
      ? "ONLINE"
      : `${section.day} ${section.start_label} - ${section.end_label}`;
    line.textContent = `${section.course_number} (${section.section_number}) - ${timeText} - ${section.teacher_name}`;
    container.appendChild(line);
  });
}

function renderScheduleGrid(sections) {
  const container = document.getElementById("scheduleGrid");
  container.innerHTML = "";

  const dayColumns = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const grouped = scheduleByDay(sections);

  const allMeetings = Object.values(grouped).flat();
  if (!allMeetings.length) {
    container.textContent = "Only online classes in this schedule.";
    return;
  }

  const earliest = Math.min(...allMeetings.map(item => item.start));
  const latest = Math.max(...allMeetings.map(item => item.end));

  const startHour = Math.floor(earliest / 60);
  const endHour = Math.ceil(latest / 60);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");

  const timeHead = document.createElement("th");
  timeHead.textContent = "Time";
  headRow.appendChild(timeHead);

  dayColumns.forEach(day => {
    const th = document.createElement("th");
    th.textContent = day;
    headRow.appendChild(th);
  });

  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");

  for (let hour = startHour; hour < endHour; hour += 1) {
    const row = document.createElement("tr");
    const rowStart = hour * 60;
    const rowEnd = (hour + 1) * 60;

    const timeCell = document.createElement("td");
    timeCell.textContent = `${formatMinutes(rowStart)} - ${formatMinutes(rowEnd)}`;
    row.appendChild(timeCell);

    dayColumns.forEach(day => {
      const cell = document.createElement("td");
      const classes = grouped[day].filter(item => item.start < rowEnd && item.end > rowStart);

      if (classes.length) {
        const hasIdealClass = classes.some(item => item.ideal || item.is_ideal);
        cell.className = hasIdealClass ? "has-class has-ideal-class" : "has-class";
        cell.innerHTML = classes.map(item => {
          return `${item.course_number} (${item.section_number})<br>${item.teacher_name}<br>${item.start_label} - ${item.end_label}`;
        }).join("<hr>");
      }

      row.appendChild(cell);
    });

    body.appendChild(row);
  }

  table.appendChild(body);
  container.appendChild(table);
}

function renderScheduleOptions() {
  const container = document.getElementById("scheduleOptions");
  container.innerHTML = "";

  if (!potentialSchedules.length) {
    container.textContent = "No potential schedules available.";
    return;
  }

  potentialSchedules.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `schedule-option-btn${index === selectedScheduleIndex ? " active" : ""}`;
    button.textContent = `Option ${index + 1}`;
    button.addEventListener("click", () => {
      selectedScheduleIndex = index;
      renderScheduleOptions();
      renderSelectedSections(potentialSchedules[selectedScheduleIndex]);
      renderScheduleGrid(potentialSchedules[selectedScheduleIndex]);
    });
    container.appendChild(button);
  });
}

async function submitClassRequest() {
  const input = document.getElementById("classRequest").value;
  const requestMessage = document.getElementById("requestMessage");
  const selectedContainer = document.getElementById("selectedSections");
  const gridContainer = document.getElementById("scheduleGrid");
  const optionsContainer = document.getElementById("scheduleOptions");

  const courses = input
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);

  if (courses.length === 0) {
    requestMessage.textContent = "Please enter at least one class code.";
    optionsContainer.textContent = "";
    selectedContainer.textContent = "";
    gridContainer.textContent = "";
    return;
  }

  requestMessage.textContent = "Loading schedules...";
  optionsContainer.textContent = "";
  selectedContainer.textContent = "";
  gridContainer.textContent = "";

  try {
    const { response } = await postScheduleRequest({ courses });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      requestMessage.textContent = data.error || "Request failed.";
      optionsContainer.textContent = "";
      selectedContainer.textContent = "";
      gridContainer.textContent = "";
      return;
    }

    potentialSchedules = data.valid_schedules || [];
    selectedScheduleIndex = 0;

    const sections = potentialSchedules[selectedScheduleIndex] || [];
    requestMessage.textContent = potentialSchedules.length
      ? `Showing ${potentialSchedules.length} potential schedule(s).`
      : "No conflict-free schedule found.";

    renderScheduleOptions();
    renderSelectedSections(sections);
    renderScheduleGrid(sections);
  } catch (error) {
    requestMessage.textContent = "Could not reach the scheduler API.";
    optionsContainer.textContent = "";
    selectedContainer.textContent = "";
    gridContainer.textContent = `Details: ${error.message}`;
  }
}

document.getElementById("generateBtn").addEventListener("click", submitClassRequest);
document.getElementById("classRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    submitClassRequest();
  }
});