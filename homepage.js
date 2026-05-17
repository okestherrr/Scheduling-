const firebaseSettings = {
  apiKey: "YOUR_API_KEY",
  authDomain: "class-scheduler.firebaseapp.com",
  projectId: "class-scheduler",
  storageBucket: "class-scheduler.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const apiBaseText = (window.API_BASE_URL || "").trim();
const hasCustomApiUrl = apiBaseText && !apiBaseText.includes("REPLACE_WITH_YOUR_BACKEND_URL");
const isOnLocalhost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const apiBaseUrl = hasCustomApiUrl
  ? apiBaseText.replace(/\/$/, "")
  : (isOnLocalhost ? "http://127.0.0.1:5000" : "");
const scheduleUrl = apiBaseUrl ? `${apiBaseUrl}/schedule` : "/schedule";
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function getScheduleUrls() {
  const urlList = [];

  if (hasCustomApiUrl) {
    urlList.push(`${apiBaseText.replace(/\/$/, "")}/schedule`);
  }

  if (window.location.origin && window.location.origin.startsWith("http")) {
    urlList.push(`${window.location.origin.replace(/\/$/, "")}/schedule`);
  }

  urlList.push("http://127.0.0.1:5000/schedule");
  urlList.push("http://localhost:5000/schedule");
  urlList.push(scheduleUrl);

  return [...new Set(urlList)];
}


function shouldUseResponse(serverResponse) {
  const contentType = serverResponse.headers.get("content-type") || "";
  const hasJsonText = contentType.includes("application/json");

  if (serverResponse.ok) {
    return true;
  }

  return serverResponse.status === 400 && hasJsonText;
}

async function sendScheduleRequest(requestBody) {
  const urlList = getScheduleUrls();
  let lastConnectionError = null;
  let lastBadResponse = null;

  for (const url of urlList) {
    try {
      const serverResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (shouldUseResponse(serverResponse)) {
        return { response: serverResponse, url };
      }

      lastBadResponse = { response: serverResponse, url };
    } catch (error) {
      lastConnectionError = error;
    }
  }

  if (lastBadResponse) {
    return lastBadResponse;
  }

  throw lastConnectionError || new Error("Could not connect to any scheduler API endpoint.");
}

let firebaseDb = null;

try {
  firebase.initializeApp(firebaseSettings);
  firebaseDb = firebase.firestore();
} catch (error) {
  console.warn("Firebase initialization failed:", error);
}

if (firebaseDb) {
  firebaseDb.collection("courses").get().catch(error => {
    console.warn("Could not load Firebase courses:", error);
  });
}

let scheduleChoices = [];
let chosenScheduleIndex = 0;

function getBox(boxId) {
  return document.getElementById(boxId);
}


function clearScheduleBoxes() {
  getBox("scheduleOptions").textContent = "";
  getBox("selectedSections").textContent = "";
  getBox("scheduleGrid").textContent = "";
}


function getTypedClasses() {
  const typedText = getBox("classRequest").value;

  return typedText
    .split(",")
    .map(oneClass => oneClass.trim().toUpperCase())
    .filter(Boolean);
}

function timeTextToMinutes(timeText) {
  if (!timeText || timeText === "NULL") {
    return null;
  }

  const [hourText, minuteText] = String(timeText).split(":");
  const hourNumber = Number(hourText);
  const minuteNumber = Number(minuteText);

  if (Number.isNaN(hourNumber) || Number.isNaN(minuteNumber)) {
    return null;
  }

  return (hourNumber * 60) + minuteNumber;
}

function minutesToClock(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const amOrPm = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${amOrPm}`;
}

function splitClassesByDay(classList) {
  const dayNames = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
  const classesByDay = {
    Mon: [],
    Tue: [],
    Wed: [],
    Thu: [],
    Fri: []
  };

  classList.forEach(classItem => {
    const classDays = classItem.day || "";
    if (classDays === "ONLINE") {
      return;
    }

    const startMinutes = timeTextToMinutes(classItem.start_time);
    const endMinutes = timeTextToMinutes(classItem.end_time);
    if (startMinutes === null || endMinutes === null) {
      return;
    }

    for (const dayLetter of classDays) {
      const dayName = dayNames[dayLetter];
      if (!dayName) {
        continue;
      }

      classesByDay[dayName].push({
        ...classItem,
        start: startMinutes,
        end: endMinutes
      });
    }
  });

  Object.values(classesByDay).forEach(dayClasses => dayClasses.sort((a, b) => a.start - b.start));
  return classesByDay;
}

function showChosenClasses(classList) {
  const box = getBox("selectedSections");
  box.innerHTML = "";

  if (!classList.length) {
    box.textContent = "No valid sections found.";
    return;
  }

  classList.forEach(classItem => {
    const rowBox = document.createElement("div");
    const shouldHighlight = Boolean(classItem.ideal || classItem.is_ideal);
    rowBox.className = `section-item${shouldHighlight ? " ideal" : ""}`;
    const meetingText = classItem.day === "ONLINE"
      ? "ONLINE"
      : `${classItem.day} ${classItem.start_label} - ${classItem.end_label}`;
    rowBox.textContent = `${classItem.course_number} (${classItem.section_number}) - ${meetingText} - ${classItem.teacher_name}`;
    box.appendChild(rowBox);
  });
}


function makeCalendarInfo(classList) {
  const classesByDay = splitClassesByDay(classList);
  const allClassTimes = Object.values(classesByDay).flat();

  if (!allClassTimes.length) {
    return { classesByDay, allClassTimes };
  }

  const earliestTime = Math.min(...allClassTimes.map(classItem => classItem.start));
  const latestTime = Math.max(...allClassTimes.map(classItem => classItem.end));
  const firstHour = Math.max(7, Math.floor(earliestTime / 60));
  const lastHour = Math.min(22, Math.ceil(latestTime / 60));
  const pixelsPerMinute = 1.1;
  const totalHeight = (lastHour - firstHour) * 60 * pixelsPerMinute;

  return {
    classesByDay,
    allClassTimes,
    firstHour,
    lastHour,
    pixelsPerMinute,
    totalHeight
  };
}


function makeTimeSide(firstHour, lastHour, pixelsPerMinute) {
  const timeBox = document.createElement("div");
  timeBox.className = "calendar-times";

  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    const labelBox = document.createElement("div");
    labelBox.className = "calendar-time-label";
    labelBox.style.top = `${(hour - firstHour) * 60 * pixelsPerMinute}px`;
    labelBox.textContent = minutesToClock(hour * 60);
    timeBox.appendChild(labelBox);
  }

  return timeBox;
}


function addHourLines(trackBox, firstHour, lastHour, pixelsPerMinute) {
  for (let hour = firstHour; hour < lastHour; hour += 1) {
    const lineBox = document.createElement("div");
    lineBox.className = "calendar-hour-line";
    lineBox.style.top = `${(hour - firstHour) * 60 * pixelsPerMinute}px`;
    trackBox.appendChild(lineBox);
  }
}


function makeClassCard(classItem, firstHour, pixelsPerMinute) {
  const cardBox = document.createElement("article");
  const cardTop = (classItem.start - (firstHour * 60)) * pixelsPerMinute;
  const cardHeight = Math.max(54, (classItem.end - classItem.start) * pixelsPerMinute);
  const shouldHighlight = classItem.ideal || classItem.is_ideal;

  cardBox.className = `calendar-class-card${shouldHighlight ? " ideal" : ""}`;
  cardBox.style.top = `${cardTop}px`;
  cardBox.style.height = `${cardHeight}px`;
  cardBox.innerHTML = `
    <strong>${classItem.course_number}</strong>
    <span>Section ${classItem.section_number}</span>
    <span>${classItem.start_label} - ${classItem.end_label}</span>
    <small>${classItem.teacher_name}</small>
  `;

  return cardBox;
}


function makeDayColumn(dayName, classesByDay, totalHeight, firstHour, lastHour, pixelsPerMinute) {
  const dayBox = document.createElement("section");
  dayBox.className = "calendar-day";

  const headerBox = document.createElement("header");
  headerBox.className = "calendar-day-header";
  headerBox.textContent = dayName;
  dayBox.appendChild(headerBox);

  const trackBox = document.createElement("div");
  trackBox.className = "calendar-day-track";
  trackBox.style.height = `${totalHeight}px`;

  addHourLines(trackBox, firstHour, lastHour, pixelsPerMinute);

  classesByDay[dayName].forEach(classItem => {
    trackBox.appendChild(makeClassCard(classItem, firstHour, pixelsPerMinute));
  });

  dayBox.appendChild(trackBox);
  return dayBox;
}

function showCalendar(classList) {
  const box = getBox("scheduleGrid");
  box.innerHTML = "";

  const calendarInfo = makeCalendarInfo(classList);
  const {
    classesByDay,
    allClassTimes,
    firstHour,
    lastHour,
    pixelsPerMinute,
    totalHeight
  } = calendarInfo;

  if (!allClassTimes.length) {
    box.textContent = "Only online classes in this schedule.";
    return;
  }

  const calendarBox = document.createElement("div");
  calendarBox.className = "calendar-board";

  calendarBox.appendChild(makeTimeSide(firstHour, lastHour, pixelsPerMinute));

  const dayBoxes = document.createElement("div");
  dayBoxes.className = "calendar-days";

  weekDays.forEach(dayName => {
    dayBoxes.appendChild(
      makeDayColumn(dayName, classesByDay, totalHeight, firstHour, lastHour, pixelsPerMinute)
    );
  });

  calendarBox.appendChild(dayBoxes);
  box.appendChild(calendarBox);
}


function showCurrentSchedule() {
  const classList = scheduleChoices[chosenScheduleIndex] || [];
  showChosenClasses(classList);
  showCalendar(classList);
}

function showScheduleButtons() {
  const box = getBox("scheduleOptions");
  box.innerHTML = "";

  if (!scheduleChoices.length) {
    box.textContent = "No potential schedules available.";
    return;
  }

  scheduleChoices.forEach((_, buttonIndex) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = `schedule-option-btn${buttonIndex === chosenScheduleIndex ? " active" : ""}`;
    optionButton.textContent = `Option ${buttonIndex + 1}`;
    optionButton.addEventListener("click", () => {
      chosenScheduleIndex = buttonIndex;
      showScheduleButtons();
      showCurrentSchedule();
    });
    box.appendChild(optionButton);
  });
}


async function readScheduleData(serverResponse) {
  const contentType = serverResponse.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return serverResponse.json();
  }

  return { error: await serverResponse.text() };
}


function showErrorMessage(message) {
  getBox("requestMessage").textContent = message;
  clearScheduleBoxes();
}


function showSchedulesFromServer(serverData) {
  scheduleChoices = serverData.valid_schedules || [];
  chosenScheduleIndex = 0;

  getBox("requestMessage").textContent = scheduleChoices.length
    ? `Showing ${scheduleChoices.length} potential schedule(s).`
    : "No conflict-free schedule found.";

  showScheduleButtons();
  showCurrentSchedule();
}

async function submitClassCodes() {
  const typedClasses = getTypedClasses();

  if (typedClasses.length === 0) {
    showErrorMessage("Please enter at least one class code.");
    return;
  }

  getBox("requestMessage").textContent = "Loading schedules...";
  clearScheduleBoxes();

  try {
    const { response } = await sendScheduleRequest({ courses: typedClasses });
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      showErrorMessage(serverData.error || "Request failed.");
      return;
    }

    showSchedulesFromServer(serverData);
  } catch (error) {
    getBox("requestMessage").textContent = "Could not reach the scheduler API.";
    getBox("scheduleOptions").textContent = "";
    getBox("selectedSections").textContent = "";
    getBox("scheduleGrid").textContent = `Details: ${error.message}`;
  }
}

getBox("generateBtn").addEventListener("click", submitClassCodes);
getBox("classRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    submitClassCodes();
  }
});