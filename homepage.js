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
const teacherSearchUrl = apiBaseUrl ? `${apiBaseUrl}/teachers/search` : "/teachers/search";
const allCalendarDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayCalendarDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const schedulePageSize = 5;
const calendarGapMinutes = 15;
const reminderDayToIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const presetEventColors = [
  "#F6A5A5", "#EF5350",
  "#F7B267", "#FB8C00",
  "#F7E588", "#FDD835",
  "#B8E986", "#7CB342",
  "#7ED7C1", "#26A69A",
  "#8AD2F4", "#1E88E5",
  "#B39DDB", "#5E35B1",
  "#D6A4EB", "#8E24AA",
  "#F8A6D1", "#D81B60",
  "#D7CCC8", "#8D6E63"
];

function getApiUrls(pathSuffix) {
  const urlList = [];
  const safePath = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;

  if (hasCustomApiUrl) {
    urlList.push(`${apiBaseText.replace(/\/$/, "")}${safePath}`);
  }

  if (window.location.origin && window.location.origin.startsWith("http")) {
    urlList.push(`${window.location.origin.replace(/\/$/, "")}${safePath}`);
  }

  urlList.push(`http://127.0.0.1:5000${safePath}`);
  urlList.push(`http://localhost:5000${safePath}`);

  if (safePath === "/schedule") {
    urlList.push(scheduleUrl);
  }

  if (safePath === "/teachers/search") {
    urlList.push(teacherSearchUrl);
  }

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

async function sendApiRequest(pathSuffix, requestBody) {
  const urlList = getApiUrls(pathSuffix);
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

  // If every API attempt failed to connect, prefer that message over
  // unrelated 404/HTML responses from a non-API origin.
  if (lastConnectionError) {
    throw lastConnectionError;
  }

  if (lastBadResponse) {
    return lastBadResponse;
  }

  throw lastConnectionError || new Error("Could not connect to any scheduler API endpoint.");
}


async function sendScheduleRequest(requestBody) {
  return sendApiRequest("/schedule", requestBody);
}


async function sendTeacherSearchRequest(requestBody) {
  return sendApiRequest("/teachers/search", requestBody);
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

let schedules = [];
let currentScheduleIndex = 0;
let favoriteIndexes = new Set();
let editedIndexes = new Set();
let lockedSectionsByCourse = new Map();
let hasMoreSchedules = false;
let nextScheduleStartIndex = 0;
let currentRequest = null;
let calendarResizeTimer = null;
let calendarOptionsOpen = false;
let customCalendarEvents = [];
let draggedCustomEventId = null;
let nextCustomEventId = 1;
let customEventRepeatDays = new Set(["Mon"]);
let lastDeletedCustomEvent = null;
let undoDeleteTimer = null;
const undoDeleteTimeoutMs = 8000;
let calendarZoom = 1;
const calendarZoomMin = 0.6;
const calendarZoomMax = 2;
const calendarZoomStep = 0.2;
let selectedEventColor = presetEventColors[8];
let scheduledEventAlerts = [];
let nextScheduledAlertId = 1;
let schedulerMode = "course";
let alertPanelOpen = false;
let workEmployeeRowIdCounter = 1;
let activePaletteCloseListener = null;
let workHoursPanelOpen = false;
let workHoursEnabled = false;
let generatedCourseWorkEvents = [];
let workHoursSettings = {
  targetHours: "",
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
  days: new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])
};
let calendarSettings = {
  startMinutes: 7 * 60,
  endMinutes: 17 * 60,
  weekendMode: "none",
  showDevotional: false
};

function byId(boxId) {
  return document.getElementById(boxId);
}

function getResultsPanel() {
  return document.querySelector(".results-panel");
}

function toggleResultsPanel(isVisible) {
  const panelBox = getResultsPanel();
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function toggleTeacherPanel(isVisible) {
  const panelBox = byId("teacherSearchPanel");
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function toggleTermPanel(isVisible) {
  const panelBox = byId("termPanel");
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function clearScheduleUi() {
  byId("scheduleOptions").textContent = "";
  byId("selectedSections").textContent = "";
  byId("scheduleGrid").textContent = "";
}


function toggleLoadMoreBtn(isVisible) {
  const loadMoreButton = byId("loadMoreBtn");
  if (loadMoreButton) {
    loadMoreButton.hidden = !isVisible;
  }
}


function toggleManipulateBtn(isVisible) {
  const manipulateButton = byId("manipulateBtn");
  if (manipulateButton) {
    manipulateButton.hidden = !isVisible;
  }
}


function toggleResetBtn(isVisible) {
  const resetButton = byId("resetManipulatedBtn");
  if (resetButton) {
    resetButton.hidden = !isVisible;
  }
}


function makeScheduleSignature(scheduleList) {
  return scheduleList
    .map(oneSection => `${oneSection.course_number}:${oneSection.section_number}`)
    .sort()
    .join("|");
}


function isFavoriteSchedule(index) {
  return favoriteIndexes.has(index);
}


function hashText(textValue) {
  let hashValue = 0;

  for (const oneChar of String(textValue || "")) {
    hashValue = ((hashValue << 5) - hashValue) + oneChar.charCodeAt(0);
    hashValue |= 0;
  }

  return Math.abs(hashValue);
}


function getCoursePalette(courseNumber) {
  const hashValue = hashText(courseNumber);
  const hue = hashValue % 360;

  return {
    sectionBg: `hsl(${hue} 76% 94%)`,
    sectionBorder: `hsl(${hue} 56% 46%)`,
    cardBg: `hsl(${hue} 74% 84%)`,
    cardText: `hsl(${hue} 55% 20%)`,
    cardBorder: `hsl(${hue} 55% 42%)`
  };
}


function applyCourseColorStyles(targetBox, classItem, options = {}) {
  const palette = getCoursePalette(classItem.course_number);
  const isIdeal = Boolean(classItem.ideal || classItem.is_ideal);

  if (options.forSectionRow) {
    targetBox.style.backgroundColor = palette.sectionBg;
    targetBox.style.borderLeft = `4px solid ${palette.sectionBorder}`;
    targetBox.style.paddingLeft = "8px";

    if (isIdeal) {
      targetBox.style.filter = "saturate(1.12)";
    }

    return;
  }

  targetBox.style.backgroundColor = palette.cardBg;
  targetBox.style.color = palette.cardText;
  targetBox.style.border = `1px solid ${palette.cardBorder}`;

  if (isIdeal) {
    targetBox.style.filter = "saturate(1.12)";
  }
}


function isLockedSection(classItem) {
  const lockedSection = lockedSectionsByCourse.get(String(classItem.course_number));
  if (!lockedSection) {
    return false;
  }

  return lockedSection === String(classItem.section_number);
}


function toggleLockedSection(classItem) {
  const courseCode = String(classItem.course_number);
  const sectionCode = String(classItem.section_number);
  const lockedSection = lockedSectionsByCourse.get(courseCode);

  if (lockedSection === sectionCode) {
    lockedSectionsByCourse.delete(courseCode);
    return;
  }

  lockedSectionsByCourse.set(courseCode, sectionCode);
}


function getLockedSectionsPayload() {
  return Array.from(lockedSectionsByCourse.entries()).map(([courseNumber, sectionNumber]) => ({
    course_number: courseNumber,
    section_number: sectionNumber
  }));
}


function buildScheduleRequestBody(startIndex, pageSize, includeLockedSections) {
  const requestBody = {
    courses: [...currentRequest.courses],
    start_index: startIndex,
    page_size: pageSize
  };

  if (currentRequest.term !== null) {
    requestBody.term = currentRequest.term;
  }

  if (includeLockedSections) {
    const lockedSections = getLockedSectionsPayload();
    if (lockedSections.length) {
      requestBody.locked_sections = lockedSections;
    }
  }

  return requestBody;
}


function resetScheduleUiState() {
  hasMoreSchedules = false;
  nextScheduleStartIndex = 0;
  currentRequest = null;
  editedIndexes = new Set();
  lockedSectionsByCourse = new Map();
  toggleLoadMoreBtn(false);
  toggleManipulateBtn(false);
  toggleResetBtn(false);
}


function toggleFavoriteSchedule(index) {
  if (favoriteIndexes.has(index)) {
    favoriteIndexes.delete(index);
    return;
  }

  favoriteIndexes.add(index);
}


function getTypedClasses() {
  const typedText = byId("classRequest").value;

  return typedText
    .split(",")
    .map(oneClass => oneClass.trim().toUpperCase())
    .filter(Boolean);
}

function getTermNumber() {
  const termPanel = byId("termPanel");
  if (!termPanel || termPanel.hidden) {
    return null;
  }

  const typedTerm = byId("termInput").value.trim();
  if (!typedTerm) {
    return null;
  }

  const termNumber = Number(typedTerm);
  if (!Number.isInteger(termNumber) || termNumber <= 0) {
    return Number.NaN;
  }

  return termNumber;
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
  const dayNames = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
  const classesByDay = {
    Mon: [],
    Tue: [],
    Wed: [],
    Thu: [],
    Fri: [],
    Sat: [],
    Sun: []
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
  const box = byId("selectedSections");
  box.innerHTML = "";

  if (!classList.length) {
    box.textContent = "No valid sections found.";
    return;
  }

  classList.forEach(classItem => {
    const rowBox = document.createElement("div");
    const shouldHighlight = Boolean(classItem.ideal || classItem.is_ideal);
    rowBox.className = `section-item${shouldHighlight ? " ideal" : ""}${isLockedSection(classItem) ? " locked" : ""}`;
    applyCourseColorStyles(rowBox, classItem, { forSectionRow: true });
    const meetingText = classItem.day === "ONLINE"
      ? "ONLINE"
      : `${classItem.day} ${classItem.start_label} - ${classItem.end_label}`;
    rowBox.textContent = `${classItem.course_number} (${classItem.section_number}) - ${meetingText} - ${classItem.teacher_name}`;
    rowBox.title = "Click to lock/unlock this course section for Manipulate";
    rowBox.addEventListener("click", () => {
      toggleLockedSection(classItem);
      renderScheduleButtons();
      renderCurrentSchedule();
    });
    box.appendChild(rowBox);
  });
}


function parseTimeInputToMinutes(timeText) {
  if (!timeText || !timeText.includes(":")) {
    return null;
  }

  const [hourText, minuteText] = timeText.split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
}


function minutesToInputTime(totalMinutes) {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}


function getVisibleDays() {
  if (calendarSettings.weekendMode === "both") {
    return allCalendarDays;
  }

  if (calendarSettings.weekendMode === "sat") {
    return [...weekdayCalendarDays, "Sat"];
  }

  if (calendarSettings.weekendMode === "sun") {
    return [...weekdayCalendarDays, "Sun"];
  }

  return weekdayCalendarDays;
}


function buildDevotionalClassItem() {
  return {
    course_number: "BYUI Devotional",
    section_number: "",
    start: 11 * 60 + 30,
    end: 12 * 60 + 30,
    start_label: "11:30 AM",
    end_label: "12:30 PM",
    teacher_name: "BYUI Devotional",
    rmp_score: null,
    difficulty: null,
    ideal: null,
    isDevotional: true
  };
}


function makeCalendarInfo(classList) {
  const classesByDay = splitClassesByDay(classList);
  if (calendarSettings.showDevotional) {
    classesByDay.Tue.push(buildDevotionalClassItem());
    classesByDay.Tue.sort((a, b) => a.start - b.start);
  }

  customCalendarEvents.forEach(eventItem => {
    if (!classesByDay[eventItem.day]) {
      return;
    }

    classesByDay[eventItem.day].push({
      ...eventItem,
      isCustomEvent: true
    });
    classesByDay[eventItem.day].sort((a, b) => a.start - b.start);
  });

  if (workHoursEnabled) {
    generatedCourseWorkEvents = makeCourseWorkEventsForSchedule(classList);
    generatedCourseWorkEvents.forEach(eventItem => {
      if (!classesByDay[eventItem.day]) {
        return;
      }

      classesByDay[eventItem.day].push({
        ...eventItem,
        isCustomEvent: true,
        isGeneratedWorkHour: true
      });
      classesByDay[eventItem.day].sort((a, b) => a.start - b.start);
    });
  } else {
    generatedCourseWorkEvents = [];
  }

  const allClassTimes = Object.values(classesByDay).flat();

  const firstMinute = calendarSettings.startMinutes;
  const latestEventEnd = allClassTimes.reduce(
    (latestMinute, classItem) => Math.max(latestMinute, classItem.end || firstMinute),
    firstMinute
  );
  const extendedEndMinute = latestEventEnd > calendarSettings.endMinutes
    ? latestEventEnd + 30
    : calendarSettings.endMinutes;
  const lastMinute = Math.max(calendarSettings.endMinutes, extendedEndMinute);
  const pixelsPerMinute = 1.3 * calendarZoom;
  const totalHeight = Math.max(540, ((lastMinute - firstMinute) * pixelsPerMinute) + 20);

  return {
    classesByDay,
    allClassTimes,
    firstMinute,
    lastMinute,
    pixelsPerMinute,
    totalHeight
  };
}


function makeTimeSide(firstMinute, lastMinute, pixelsPerMinute) {
  const timeBox = document.createElement("div");
  timeBox.className = "calendar-times";

  for (let minuteMark = firstMinute; minuteMark <= lastMinute; minuteMark += 15) {
    const labelBox = document.createElement("div");
    labelBox.className = "calendar-time-label";
    labelBox.style.top = `${(minuteMark - firstMinute) * pixelsPerMinute}px`;
    labelBox.textContent = minutesToClock(minuteMark);
    timeBox.appendChild(labelBox);
  }

  return timeBox;
}


function addHourLines(trackBox, firstMinute, lastMinute, pixelsPerMinute) {
  for (let minuteMark = firstMinute; minuteMark <= lastMinute; minuteMark += 15) {
    const lineBox = document.createElement("div");
    lineBox.className = (minuteMark % 60 === 0)
      ? "calendar-hour-line is-hour"
      : "calendar-hour-line";
    lineBox.style.top = `${(minuteMark - firstMinute) * pixelsPerMinute}px`;
    trackBox.appendChild(lineBox);
  }
}


function measureClassCardHeight(cardBox) {
  const cardStyle = window.getComputedStyle(cardBox);
  const minimumHeight = parseFloat(cardStyle.minHeight) || 0;

  cardBox.style.height = "auto";
  const requiredHeight = Math.ceil(cardBox.scrollHeight + 4);
  return Math.max(minimumHeight, requiredHeight);
}


function formatCourseSectionLabel(courseNumber, sectionNumber) {
  const courseText = String(courseNumber || "").trim();
  const sectionText = String(sectionNumber || "").trim();

  if (!courseText) {
    return sectionText;
  }

  if (!sectionText) {
    return courseText;
  }

  const upperCourse = courseText.toUpperCase();
  const upperSection = sectionText.toUpperCase();
  const courseParts = courseText.match(/^([A-Za-z]+)(\d.*)$/);

  if (courseParts) {
    const subjectPart = courseParts[1].toUpperCase();
    const numberPart = courseParts[2];

    if (upperSection === String(numberPart).toUpperCase() || upperSection.startsWith(`${String(numberPart).toUpperCase()}-`)) {
      return `${subjectPart} ${sectionText}`;
    }
  }

  if (upperSection.startsWith(`${upperCourse}-`)) {
    const sectionSuffix = sectionText.slice(courseText.length + 1);
    if (courseParts) {
      return `${courseParts[1].toUpperCase()} ${sectionSuffix}`;
    }
    return `${courseText}-${sectionSuffix}`;
  }

  if (upperSection.startsWith(upperCourse)) {
    let remainder = sectionText.slice(courseText.length);
    if (remainder.startsWith("-")) {
      remainder = remainder.slice(1);
    }

    if (remainder) {
      if (courseParts) {
        return `${courseParts[1].toUpperCase()} ${remainder}`;
      }
      return `${courseText}-${remainder}`;
    }
  }

  if (courseParts) {
    return `${courseParts[1].toUpperCase()} ${sectionText}`;
  }

  return `${courseText}-${sectionText}`;
}


function getReadableTextColor(hexColor, fallbackColor = "#0e3b2e") {
  const cleanHex = String(hexColor || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return fallbackColor;
  }

  const red = parseInt(cleanHex.slice(0, 2), 16);
  const green = parseInt(cleanHex.slice(2, 4), 16);
  const blue = parseInt(cleanHex.slice(4, 6), 16);
  const brightness = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return brightness > 165 ? "#14313a" : "#ffffff";
}


function darkenHexColor(hexColor, amount = 34, fallbackColor = "#2f7d67") {
  const cleanHex = String(hexColor || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return fallbackColor;
  }

  const red = Math.max(0, parseInt(cleanHex.slice(0, 2), 16) - amount);
  const green = Math.max(0, parseInt(cleanHex.slice(2, 4), 16) - amount);
  const blue = Math.max(0, parseInt(cleanHex.slice(4, 6), 16) - amount);

  return `rgb(${red}, ${green}, ${blue})`;
}


function clearPendingDeletedEvent() {
  lastDeletedCustomEvent = null;

  if (undoDeleteTimer !== null) {
    window.clearTimeout(undoDeleteTimer);
    undoDeleteTimer = null;
  }
}


function storeDeletedEventForUndo(eventItem) {
  clearPendingDeletedEvent();
  lastDeletedCustomEvent = { ...eventItem };

  undoDeleteTimer = window.setTimeout(() => {
    lastDeletedCustomEvent = null;
    undoDeleteTimer = null;

    if (schedules.length) {
      renderCurrentSchedule();
    }
  }, undoDeleteTimeoutMs);
}


function restoreLastDeletedEvent() {
  if (!lastDeletedCustomEvent) {
    return;
  }

  customCalendarEvents.push({ ...lastDeletedCustomEvent });
  clearPendingDeletedEvent();
  byId("requestMessage").textContent = "Event restored.";
  renderCurrentSchedule();
}


function adjustCalendarZoom(delta) {
  const nextZoom = Math.max(calendarZoomMin, Math.min(calendarZoomMax, calendarZoom + delta));
  if (Math.abs(nextZoom - calendarZoom) < 0.001) {
    return;
  }

  calendarZoom = Number(nextZoom.toFixed(2));
  renderCurrentSchedule();
}


function runPrintSchedule() {
  const calendarBoard = document.querySelector("#scheduleGrid .calendar-board");
  if (!calendarBoard) {
    byId("requestMessage").textContent = "Load a schedule before printing.";
    return;
  }

  document.body.classList.add("print-calendar-only");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("print-calendar-only");
  }, 100);
}


function clearScheduledAlertById(alertId) {
  const alertItem = scheduledEventAlerts.find(oneAlert => oneAlert.id === alertId);
  if (alertItem && alertItem.timeoutId !== null) {
    window.clearTimeout(alertItem.timeoutId);
  }

  scheduledEventAlerts = scheduledEventAlerts.filter(oneAlert => oneAlert.id !== alertId);
}


function clearScheduledAlertsForEvent(eventId) {
  scheduledEventAlerts
    .filter(oneAlert => oneAlert.eventId === eventId)
    .forEach(oneAlert => {
      if (oneAlert.timeoutId !== null) {
        window.clearTimeout(oneAlert.timeoutId);
      }
    });

  scheduledEventAlerts = scheduledEventAlerts.filter(oneAlert => oneAlert.eventId !== eventId);
}


function clearAllScheduledAlerts() {
  scheduledEventAlerts.forEach(oneAlert => {
    if (oneAlert.timeoutId !== null) {
      window.clearTimeout(oneAlert.timeoutId);
    }
  });

  scheduledEventAlerts = [];
}


function getNextEventDate(dayName, startMinutes) {
  const now = new Date();
  const targetDay = reminderDayToIndex[dayName];
  if (targetDay === undefined) {
    return null;
  }

  const nextDate = new Date(now);
  nextDate.setSeconds(0, 0);

  const dayOffset = (targetDay - now.getDay() + 7) % 7;
  nextDate.setDate(now.getDate() + dayOffset);
  nextDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  if (nextDate <= now) {
    nextDate.setDate(nextDate.getDate() + 7);
  }

  return nextDate;
}


function makeCourseWorkEventsForSchedule(classList) {
  if (schedulerMode !== "course") {
    return [];
  }

  const targetMinutes = Math.max(0, Number(workHoursSettings.targetHours || 0) * 60);
  if (targetMinutes <= 0 || !workHoursSettings.days.size) {
    return [];
  }

  const classesByDay = splitClassesByDay(classList || []);
  const orderedDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const generatedEvents = [];
  let remainingMinutes = targetMinutes;

  for (const dayName of orderedDays) {
    if (remainingMinutes <= 0) {
      break;
    }

    if (!workHoursSettings.days.has(dayName)) {
      continue;
    }

    const busyBlocks = (classesByDay[dayName] || [])
      .filter(classItem => classItem.end > workHoursSettings.startMinutes && classItem.start < workHoursSettings.endMinutes)
      .sort((a, b) => a.start - b.start);

    let cursor = workHoursSettings.startMinutes;
    for (const busyBlock of busyBlocks) {
      if (cursor < busyBlock.start && remainingMinutes > 0) {
        const availableMinutes = busyBlock.start - cursor;
        const usedMinutes = Math.min(availableMinutes, remainingMinutes);
        if (usedMinutes >= 30) {
          generatedEvents.push({
            eventId: `course-work-${dayName}-${cursor}-${cursor + usedMinutes}`,
            course_number: "Work Hours",
            section_number: "",
            day: dayName,
            start: cursor,
            end: cursor + usedMinutes,
            start_label: minutesToClock(cursor),
            end_label: minutesToClock(cursor + usedMinutes),
            teacher_name: "Work block",
            eventColor: "#4f86ff",
            isGeneratedWorkHour: true
          });
          remainingMinutes -= usedMinutes;
        }
      }

      cursor = Math.max(cursor, busyBlock.end);
    }

    if (cursor < workHoursSettings.endMinutes && remainingMinutes > 0) {
      const availableMinutes = workHoursSettings.endMinutes - cursor;
      const usedMinutes = Math.min(availableMinutes, remainingMinutes);
      if (usedMinutes >= 30) {
        generatedEvents.push({
          eventId: `course-work-${dayName}-${cursor}-${cursor + usedMinutes}`,
          course_number: "Work Hours",
          section_number: "",
          day: dayName,
          start: cursor,
          end: cursor + usedMinutes,
          start_label: minutesToClock(cursor),
          end_label: minutesToClock(cursor + usedMinutes),
          teacher_name: "Work block",
          eventColor: "#4f86ff",
          isGeneratedWorkHour: true
        });
        remainingMinutes -= usedMinutes;
      }
    }
  }

  return generatedEvents;
}


function scheduleEventAlertForEvent(eventItem, minutesBefore) {
  const nextEventDate = getNextEventDate(eventItem.day, eventItem.start);
  if (!nextEventDate) {
    return false;
  }

  const reminderDate = new Date(nextEventDate.getTime() - (minutesBefore * 60 * 1000));
  const now = Date.now();
  let delayMs = reminderDate.getTime() - now;

  if (delayMs <= 0) {
    const futureReminder = new Date(reminderDate.getTime() + (7 * 24 * 60 * 60 * 1000));
    delayMs = futureReminder.getTime() - now;
  }

  if (delayMs <= 0) {
    return false;
  }

  const alertId = nextScheduledAlertId;
  nextScheduledAlertId += 1;

  const timeoutId = window.setTimeout(() => {
    window.alert(`${minutesBefore} minutes until ${eventItem.course_number}.`);
    clearScheduledAlertById(alertId);
  }, delayMs);

  scheduledEventAlerts.push({
    id: alertId,
    eventId: eventItem.eventId,
    minutesBefore,
    timeoutId
  });

  return true;
}


function makeClassCard(classItem, firstMinute, pixelsPerMinute) {
  const cardBox = document.createElement("article");
  const cardTop = (classItem.start - firstMinute) * pixelsPerMinute;
  const durationHeight = (classItem.end - classItem.start) * pixelsPerMinute;
  const minVisibleHeight = classItem.isCustomEvent ? 8 : 10;
  const cardHeight = Math.max(minVisibleHeight, durationHeight);
  const shouldHighlight = classItem.ideal || classItem.is_ideal;
  const isLocked = isLockedSection(classItem);
  const ratingText = classItem.rmp_score ?? "N/A";
  const difficultyText = classItem.difficulty ?? "N/A";
  const recommendedText = classItem.ideal === "Y" ? "Yes" : (classItem.ideal === "N" ? "No" : "N/A");
  const fullTeacherName = classItem.teacher_name || "Teacher";
  const displayCourseSection = classItem.isCustomEvent
    ? String(classItem.course_number || "Custom Event")
    : classItem.isDevotional
    ? "BYUI Devotional"
    : formatCourseSectionLabel(classItem.course_number, classItem.section_number);
  const teacherHoverText = `RateMyProfessor\nRating: ${ratingText}\nDifficulty: ${difficultyText}\nRecommended: ${recommendedText}`;

  cardBox.className = `calendar-class-card${shouldHighlight ? " ideal" : ""}${isLocked ? " locked" : ""}${classItem.isDevotional ? " devotional" : ""}`;
  cardBox.style.top = `${cardTop}px`;
  cardBox.style.height = `${cardHeight}px`;

  if (classItem.isCustomEvent) {
    const customColor = classItem.eventColor || "#8fe7d1";
    const textColor = getReadableTextColor(customColor);
    cardBox.classList.add("custom-event");
    cardBox.draggable = !classItem.isGeneratedWorkHour;
    cardBox.dataset.eventId = String(classItem.eventId || "");
    cardBox.style.background = customColor;
    cardBox.style.color = textColor;
    cardBox.style.border = `1px solid ${darkenHexColor(customColor)}`;
    cardBox.title = classItem.isGeneratedWorkHour
      ? "Generated work block"
      : "Drag to move this event. Hover to delete.";
    cardBox.innerHTML = `
      ${classItem.isGeneratedWorkHour ? "" : `<button type="button" class="calendar-event-delete" data-event-id="${classItem.eventId}" aria-label="Delete event">X</button>`}
      <strong>${displayCourseSection}</strong>
      <span>${classItem.start_label} - ${classItem.end_label}</span>
      <small>${fullTeacherName}</small>
    `;
  } else {
    applyCourseColorStyles(cardBox, classItem);
    cardBox.title = "Click to lock/unlock this course section for Manipulate";
    cardBox.innerHTML = `
      <strong>${displayCourseSection}</strong>
      <span>${classItem.start_label} - ${classItem.end_label}</span>
      <small class="teacher-hover-info" title="${teacherHoverText}\nTeacher: ${fullTeacherName}">${fullTeacherName}</small>
    `;
  }

  return cardBox;
}


function makeDayColumn(dayName, classesByDay, totalHeight, firstMinute, lastMinute, pixelsPerMinute) {
  const dayBox = document.createElement("section");
  dayBox.className = "calendar-day";

  const headerBox = document.createElement("header");
  headerBox.className = "calendar-day-header";
  headerBox.textContent = dayName;
  dayBox.appendChild(headerBox);

  const trackBox = document.createElement("div");
  trackBox.className = "calendar-day-track";
  trackBox.style.height = `${totalHeight}px`;

  trackBox.addEventListener("dragover", dragEvent => {
    if (draggedCustomEventId === null) {
      return;
    }

    dragEvent.preventDefault();
    trackBox.classList.add("event-drop-target");
  });

  trackBox.addEventListener("dragleave", () => {
    trackBox.classList.remove("event-drop-target");
  });

  trackBox.addEventListener("drop", dropEvent => {
    if (draggedCustomEventId === null) {
      return;
    }

    dropEvent.preventDefault();
    trackBox.classList.remove("event-drop-target");

    const targetEvent = customCalendarEvents.find(eventItem => eventItem.eventId === draggedCustomEventId);
    draggedCustomEventId = null;
    if (!targetEvent) {
      return;
    }

    const eventDuration = targetEvent.end - targetEvent.start;
    const maxStartMinute = Math.max(firstMinute, lastMinute - eventDuration);
    const boxRect = trackBox.getBoundingClientRect();
    const pointerMinute = firstMinute + ((dropEvent.clientY - boxRect.top) / pixelsPerMinute);
    let snappedStartMinute = Math.round(pointerMinute);
    snappedStartMinute = Math.max(firstMinute, Math.min(maxStartMinute, snappedStartMinute));

    targetEvent.day = dayName;
    targetEvent.start = snappedStartMinute;
    targetEvent.end = snappedStartMinute + eventDuration;
    targetEvent.start_label = minutesToClock(targetEvent.start);
    targetEvent.end_label = minutesToClock(targetEvent.end);

    byId("requestMessage").textContent = "Event moved.";
    renderCurrentSchedule();
  });

  addHourLines(trackBox, firstMinute, lastMinute, pixelsPerMinute);

  classesByDay[dayName].forEach(classItem => {
    if (classItem.end <= firstMinute || classItem.start >= lastMinute) {
      return;
    }

    const visibleClass = {
      ...classItem,
      start: Math.max(classItem.start, firstMinute),
      end: Math.min(classItem.end, lastMinute)
    };

    const classCard = makeClassCard(visibleClass, firstMinute, pixelsPerMinute);

    if (classItem.isCustomEvent && !classItem.isGeneratedWorkHour) {
      classCard.addEventListener("dragstart", dragEvent => {
        draggedCustomEventId = classItem.eventId;
        classCard.classList.add("dragging");

        if (dragEvent.dataTransfer) {
          dragEvent.dataTransfer.effectAllowed = "move";
          dragEvent.dataTransfer.setData("text/plain", String(classItem.eventId));
        }
      });

      classCard.addEventListener("dragend", () => {
        draggedCustomEventId = null;
        classCard.classList.remove("dragging");
        document.querySelectorAll(".calendar-day-track.event-drop-target")
          .forEach(trackItem => trackItem.classList.remove("event-drop-target"));
      });

      const deleteButton = classCard.querySelector(".calendar-event-delete");
      if (deleteButton) {
        deleteButton.addEventListener("click", clickEvent => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();

          const eventId = Number(deleteButton.dataset.eventId);
          const deletedEvent = customCalendarEvents.find(eventItem => eventItem.eventId === eventId);
          if (!deletedEvent) {
            return;
          }

          storeDeletedEventForUndo(deletedEvent);
          clearScheduledAlertsForEvent(eventId);
          customCalendarEvents = customCalendarEvents.filter(eventItem => eventItem.eventId !== eventId);
          byId("requestMessage").textContent = "Event deleted. Undo available for a few seconds.";
          renderCurrentSchedule();
        });
      }
    }

    classCard.addEventListener("click", () => {
      if (classItem.isCustomEvent) {
        return;
      }

      toggleLockedSection(classItem);
      renderScheduleButtons();
      renderCurrentSchedule();
    });
    trackBox.appendChild(classCard);
  });

  dayBox.appendChild(trackBox);
  return dayBox;
}

function showCalendar(classList) {
  const box = byId("scheduleGrid");
  box.innerHTML = "";
  clearActivePaletteListener();

  const calendarActions = document.createElement("div");
  calendarActions.className = "calendar-actions";

  const optionsButton = document.createElement("button");
  optionsButton.type = "button";
  optionsButton.className = `btn-main btn-options calendar-options-btn${calendarOptionsOpen ? " active" : ""}`;
  optionsButton.textContent = "Options";
  optionsButton.addEventListener("click", () => {
    calendarOptionsOpen = !calendarOptionsOpen;
    renderCurrentSchedule();
  });

  const workHoursButton = document.createElement("button");
  workHoursButton.type = "button";
  workHoursButton.className = `btn-main calendar-workhours-btn${workHoursPanelOpen ? " active" : ""}`;
  workHoursButton.textContent = "Add Work Hours";
  workHoursButton.title = "Generate work-hour blocks around class schedules";
  workHoursButton.addEventListener("click", () => {
    workHoursPanelOpen = !workHoursPanelOpen;
    renderCurrentSchedule();
  });

  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.className = "btn-main calendar-print-btn";
  printButton.textContent = "Print Schedule";
  printButton.title = "Print or save only the calendar as PDF";
  printButton.addEventListener("click", runPrintSchedule);

  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  const isFavorite = isFavoriteSchedule(currentScheduleIndex);
  favoriteButton.className = `btn-main btn-star calendar-favorite-btn${isFavorite ? " active" : ""}`;
  favoriteButton.textContent = isFavorite ? "★" : "☆";
  favoriteButton.title = isFavorite
    ? "Unhighlight this schedule option"
    : "Highlight this schedule option";
  favoriteButton.addEventListener("click", () => {
    toggleFavoriteSchedule(currentScheduleIndex);
    renderScheduleButtons();
    renderCurrentSchedule();
  });

  calendarActions.appendChild(optionsButton);
  if (schedulerMode === "course") {
    calendarActions.appendChild(workHoursButton);
  }
  calendarActions.appendChild(printButton);
  calendarActions.appendChild(favoriteButton);

  box.appendChild(calendarActions);

  if (calendarOptionsOpen) {
    const optionsPanel = document.createElement("section");
    optionsPanel.className = "calendar-options-panel settings-row";

    const isSatOnly = calendarSettings.weekendMode === "sat";
    const isSunOnly = calendarSettings.weekendMode === "sun";
    const isBothWeekendDays = calendarSettings.weekendMode === "both";
    const shouldShowSat = isSatOnly || isBothWeekendDays;
    const shouldShowSun = isSunOnly || isBothWeekendDays;

    optionsPanel.innerHTML = `
      <label class="calendar-options-field calendar-options-start-field">
        <span>Calendar Start Time</span>
        <input id="calendarStartTime" type="time" step="900" value="${minutesToInputTime(calendarSettings.startMinutes)}" />
      </label>
      <label class="calendar-options-field calendar-options-end-field">
        <span>Calendar End Time</span>
        <input id="calendarEndTime" type="time" step="900" value="${minutesToInputTime(calendarSettings.endMinutes)}" />
      </label>
      <div class="calendar-options-weekends calendar-options-weekends-field days-group">
        <label class="calendar-options-check check-option">
          <input id="calendarShowSat" type="checkbox" ${shouldShowSat ? "checked" : ""} /> Sat
        </label>
        <label class="calendar-options-check check-option">
          <input id="calendarShowSun" type="checkbox" ${shouldShowSun ? "checked" : ""} /> Sun
        </label>
        <label class="calendar-options-check calendar-options-devotional check-option devotional-label">
          <input id="calendarShowDevotional" type="checkbox" ${calendarSettings.showDevotional ? "checked" : ""} /> Devotional
        </label>
      </div>
      <div class="calendar-event-alert-row">
        <div class="calendar-options-event-field">
          <span>Create Event</span>
          <div class="calendar-options-event-controls">
            <input id="calendarEventTitle" type="text" maxlength="40" placeholder="Event name" />
            <div class="calendar-options-event-color-field">
              <span>Color</span>
              <button id="calendarColorSwatch" type="button" class="calendar-color-swatch" aria-label="Pick event color"></button>
              <div id="calendarColorPalette" class="calendar-color-palette" hidden>
                ${presetEventColors.map(colorValue => `<button type="button" class="calendar-color-choice" data-color="${colorValue}" style="background:${colorValue}" aria-label="Select ${colorValue}"></button>`).join("")}
              </div>
            </div>
            <div class="calendar-event-repeat">
              <span class="calendar-event-repeat-label">Repeat on</span>
              <div class="calendar-repeat-days">
                ${[
                  ["Sun", "S"],
                  ["Mon", "M"],
                  ["Tue", "T"],
                  ["Wed", "W"],
                  ["Thu", "T"],
                  ["Fri", "F"],
                  ["Sat", "S"]
                ].map(([dayValue, dayLabel]) => {
                  const isActive = customEventRepeatDays.has(dayValue);
                  return `<button type="button" class="calendar-repeat-day${isActive ? " active" : ""}" data-day="${dayValue}" aria-pressed="${isActive ? "true" : "false"}">${dayLabel}</button>`;
                }).join("")}
              </div>
            </div>
            <div class="calendar-event-time-row">
              <label class="calendar-options-field calendar-options-event-time-field" for="calendarEventStart">
                <span>Start Time</span>
                <input id="calendarEventStart" type="time" step="60" />
              </label>
              <label class="calendar-options-field calendar-options-event-time-field" for="calendarEventEnd">
                <span>End Time</span>
                <input id="calendarEventEnd" type="time" step="60" />
              </label>
            </div>
            <button id="calendarAddEventBtn" class="btn-main" type="button">Add</button>
            <button id="calendarClearEventsBtn" class="btn-main" type="button">Clear</button>
          </div>
        </div>
        <div class="calendar-options-alert-field">
          <button id="calendarAlertToggleBtn" class="btn-main calendar-alert-toggle-btn" type="button" aria-expanded="${alertPanelOpen ? "true" : "false"}">Create Alert for Event</button>
          <div id="calendarAlertBody" class="calendar-options-alert-controls" ${alertPanelOpen ? "" : "hidden"}>
            <label class="calendar-options-field" for="calendarAlertEvent">
              <span>Event</span>
              <select id="calendarAlertEvent">
                <option value="">Select an event</option>
                ${customCalendarEvents.map(eventItem => `<option value="${eventItem.eventId}">${eventItem.course_number} (${eventItem.day} ${eventItem.start_label})</option>`).join("")}
              </select>
            </label>
            <label class="calendar-options-field" for="calendarAlertOffset">
              <span>Reminder</span>
              <select id="calendarAlertOffset">
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label class="calendar-options-field" id="calendarAlertCustomWrap" for="calendarAlertCustom" hidden>
              <span>Custom Minutes</span>
              <input id="calendarAlertCustom" type="number" min="1" step="1" placeholder="Minutes before" />
            </label>
            <button id="calendarCreateAlertBtn" class="btn-main" type="button">Set Alert</button>
            <p id="calendarAlertMessage" class="calendar-alert-message"></p>
          </div>
        </div>
      </div>
    `;

    box.appendChild(optionsPanel);

    const satCheckbox = optionsPanel.querySelector("#calendarShowSat");
    const sunCheckbox = optionsPanel.querySelector("#calendarShowSun");
    const startInput = optionsPanel.querySelector("#calendarStartTime");
    const endInput = optionsPanel.querySelector("#calendarEndTime");
    const devotionalInput = optionsPanel.querySelector("#calendarShowDevotional");
    const eventTitleInput = optionsPanel.querySelector("#calendarEventTitle");
    const colorSwatchButton = optionsPanel.querySelector("#calendarColorSwatch");
    const colorPalette = optionsPanel.querySelector("#calendarColorPalette");
    const colorChoiceButtons = [...optionsPanel.querySelectorAll(".calendar-color-choice")];
    const eventStartInput = optionsPanel.querySelector("#calendarEventStart");
    const eventEndInput = optionsPanel.querySelector("#calendarEventEnd");
    const alertEventSelect = optionsPanel.querySelector("#calendarAlertEvent");
    const alertOffsetSelect = optionsPanel.querySelector("#calendarAlertOffset");
    const alertCustomWrap = optionsPanel.querySelector("#calendarAlertCustomWrap");
    const alertCustomInput = optionsPanel.querySelector("#calendarAlertCustom");
    const createAlertButton = optionsPanel.querySelector("#calendarCreateAlertBtn");
    const alertMessageBox = optionsPanel.querySelector("#calendarAlertMessage");
    const alertToggleButton = optionsPanel.querySelector("#calendarAlertToggleBtn");
    const alertBody = optionsPanel.querySelector("#calendarAlertBody");
    const addEventButton = optionsPanel.querySelector("#calendarAddEventBtn");
    const clearEventsButton = optionsPanel.querySelector("#calendarClearEventsBtn");
    const repeatDayButtons = [...optionsPanel.querySelectorAll(".calendar-repeat-day")];

    if (colorSwatchButton) {
      colorSwatchButton.style.background = selectedEventColor;
    }

    if (colorPalette && colorSwatchButton) {
      function closeColorPalette() {
        colorPalette.hidden = true;
        colorPalette.classList.remove("open-upward");
        clearActivePaletteListener();
      }

      function openColorPalette() {
        colorPalette.hidden = false;
        colorPalette.classList.remove("open-upward");

        const swatchRect = colorSwatchButton.getBoundingClientRect();
        const paletteRect = colorPalette.getBoundingClientRect();
        const spacing = 6;

        let top = swatchRect.bottom + spacing;
        let openUpward = false;
        if ((top + paletteRect.height) > (window.innerHeight - 8)) {
          top = swatchRect.top - paletteRect.height - spacing;
          openUpward = true;
        }

        let left = swatchRect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - paletteRect.width - 8));
        top = Math.max(8, top);

        colorPalette.style.left = `${left}px`;
        colorPalette.style.top = `${top}px`;
        colorPalette.classList.toggle("open-upward", openUpward);

        clearActivePaletteListener();
        activePaletteCloseListener = clickEvent => {
          if (clickEvent.target === colorSwatchButton || colorPalette.contains(clickEvent.target)) {
            return;
          }

          closeColorPalette();
        };
        document.addEventListener("mousedown", activePaletteCloseListener);
      }

      colorSwatchButton.addEventListener("click", clickEvent => {
        clickEvent.preventDefault();
        if (colorPalette.hidden) {
          openColorPalette();
        } else {
          closeColorPalette();
        }
      });

      colorChoiceButtons.forEach(colorButton => {
        colorButton.addEventListener("click", () => {
          const pickedColor = colorButton.dataset.color;
          if (!pickedColor) {
            return;
          }

          selectedEventColor = pickedColor;
          colorSwatchButton.style.background = pickedColor;
          closeColorPalette();
        });
      });
    }

    if (alertToggleButton && alertBody) {
      alertToggleButton.addEventListener("click", () => {
        alertPanelOpen = !alertPanelOpen;
        alertBody.hidden = !alertPanelOpen;
        alertToggleButton.setAttribute("aria-expanded", alertPanelOpen ? "true" : "false");
      });
    }

    repeatDayButtons.forEach(dayButton => {
      dayButton.addEventListener("click", () => {
        const dayValue = dayButton.dataset.day;
        if (!dayValue) {
          return;
        }

        if (customEventRepeatDays.has(dayValue)) {
          customEventRepeatDays.delete(dayValue);
        } else {
          customEventRepeatDays.add(dayValue);
        }

        const isActive = customEventRepeatDays.has(dayValue);
        dayButton.classList.toggle("active", isActive);
        dayButton.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    });

    function addCustomEventFromInputs() {
      const eventTitle = (eventTitleInput.value || "").trim() || "Custom Event";
      const eventColor = selectedEventColor;
      const selectedDays = [...customEventRepeatDays];
      const startMinutes = parseTimeInputToMinutes(eventStartInput.value);
      const endMinutes = parseTimeInputToMinutes(eventEndInput.value);

      if (!selectedDays.length) {
        byId("requestMessage").textContent = "Select at least one repeat day.";
        return;
      }

      if (startMinutes === null || endMinutes === null) {
        byId("requestMessage").textContent = "Please enter valid event start/end times.";
        return;
      }

      if (endMinutes <= startMinutes) {
        byId("requestMessage").textContent = "The end time must be after the start time. Please choose a valid time.";
        return;
      }

      selectedDays.forEach(dayValue => {
        customCalendarEvents.push({
          eventId: nextCustomEventId,
          course_number: eventTitle,
          section_number: "",
          day: dayValue,
          start: startMinutes,
          end: endMinutes,
          start_label: minutesToClock(startMinutes),
          end_label: minutesToClock(endMinutes),
          teacher_name: "Added Event",
          eventColor
        });
        nextCustomEventId += 1;
      });

      byId("requestMessage").textContent = `Event added to ${selectedDays.length} day(s).`;
      eventTitleInput.value = "";
      eventStartInput.value = "";
      eventEndInput.value = "";
      renderCurrentSchedule();
    }

    function updateCustomReminderVisibility() {
      const isCustomReminder = alertOffsetSelect.value === "custom";
      alertCustomWrap.hidden = !isCustomReminder;
      if (!isCustomReminder) {
        alertCustomInput.value = "";
      }
    }

    function createReminderForEvent() {
      alertMessageBox.textContent = "";
      const selectedEventId = Number(alertEventSelect.value);
      const selectedEvent = customCalendarEvents.find(eventItem => eventItem.eventId === selectedEventId);
      if (!selectedEvent) {
        alertMessageBox.textContent = "Select an event first.";
        return;
      }

      let minutesBefore = 0;
      if (alertOffsetSelect.value === "custom") {
        minutesBefore = Number.parseInt((alertCustomInput.value || "").trim(), 10);
      } else {
        minutesBefore = Number.parseInt(alertOffsetSelect.value, 10);
      }

      if (!Number.isInteger(minutesBefore) || minutesBefore <= 0) {
        alertMessageBox.textContent = "Enter a valid reminder time.";
        return;
      }

      const wasScheduled = scheduleEventAlertForEvent(selectedEvent, minutesBefore);
      alertMessageBox.textContent = wasScheduled
        ? "Alert is set."
        : "Could not set alert for that event.";
    }

    function applyCalendarOptions(showValidationError) {
      const startMinutes = parseTimeInputToMinutes(startInput.value);
      const endMinutes = parseTimeInputToMinutes(endInput.value);

      if (startMinutes === null || endMinutes === null) {
        if (showValidationError) {
          byId("requestMessage").textContent = "Please enter valid start/end times.";
        }
        return;
      }

      if (endMinutes <= startMinutes) {
        if (showValidationError) {
          byId("requestMessage").textContent = "End time must be after start time.";
        }
        return;
      }

      if ((endMinutes - startMinutes) < 60) {
        if (showValidationError) {
          byId("requestMessage").textContent = "Please select at least a 1-hour calendar window.";
        }
        return;
      }

      let weekendMode = "none";
      if (satCheckbox.checked && sunCheckbox.checked) {
        weekendMode = "both";
      } else if (satCheckbox.checked) {
        weekendMode = "sat";
      } else if (sunCheckbox.checked) {
        weekendMode = "sun";
      }

      calendarSettings = {
        startMinutes,
        endMinutes,
        weekendMode,
        showDevotional: Boolean(devotionalInput && devotionalInput.checked)
      };

      byId("requestMessage").textContent = "";
      renderCurrentSchedule();
    }

    satCheckbox.addEventListener("change", () => applyCalendarOptions(false));
    sunCheckbox.addEventListener("change", () => applyCalendarOptions(false));
    devotionalInput.addEventListener("change", () => applyCalendarOptions(false));
    startInput.addEventListener("change", () => applyCalendarOptions(true));
    endInput.addEventListener("change", () => applyCalendarOptions(true));
    alertOffsetSelect.addEventListener("change", updateCustomReminderVisibility);
    createAlertButton.addEventListener("click", createReminderForEvent);
    updateCustomReminderVisibility();
    addEventButton.addEventListener("click", addCustomEventFromInputs);
    clearEventsButton.addEventListener("click", () => {
      customCalendarEvents = [];
      clearPendingDeletedEvent();
      clearAllScheduledAlerts();
      byId("requestMessage").textContent = "Added events cleared.";
      renderCurrentSchedule();
    });
  }

  if (schedulerMode === "course" && workHoursPanelOpen) {
    const workHoursPanel = document.createElement("section");
    workHoursPanel.className = "calendar-workhours-panel";
    workHoursPanel.innerHTML = `
      <h3>Add Work Hours</h3>
      <div class="calendar-workhours-grid">
        <label class="calendar-options-field" for="workTargetHoursInput">
          <span>How many hours do you want to work?</span>
          <input id="workTargetHoursInput" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 12" value="${workHoursSettings.targetHours}" />
        </label>
        <label class="calendar-options-field" for="workStartInput">
          <span>Work Start Time</span>
          <input id="workStartInput" type="time" step="60" value="${minutesToInputTime(workHoursSettings.startMinutes)}" />
        </label>
        <label class="calendar-options-field" for="workEndInput">
          <span>Work End Time</span>
          <input id="workEndInput" type="time" step="60" value="${minutesToInputTime(workHoursSettings.endMinutes)}" />
        </label>
      </div>
      <div class="calendar-workhours-days">
        <span>What days can you work?</span>
        <div class="workhours-day-buttons">
          ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(dayName => `<button type="button" class="workhours-day-btn${workHoursSettings.days.has(dayName) ? " active" : ""}" data-day="${dayName}">${dayName}</button>`).join("")}
        </div>
      </div>
      <div class="calendar-workhours-actions">
        <button id="generateWorkHoursBtn" class="btn-main" type="button">Generate Work Hours</button>
      </div>
    `;

    box.appendChild(workHoursPanel);

    const targetHoursInput = workHoursPanel.querySelector("#workTargetHoursInput");
    const workStartInput = workHoursPanel.querySelector("#workStartInput");
    const workEndInput = workHoursPanel.querySelector("#workEndInput");
    const dayButtons = [...workHoursPanel.querySelectorAll(".workhours-day-btn")];

    dayButtons.forEach(dayButton => {
      dayButton.addEventListener("click", () => {
        dayButton.classList.toggle("active");
      });
    });

    workHoursPanel.querySelector("#generateWorkHoursBtn").addEventListener("click", () => {
      const targetHours = Number.parseInt((targetHoursInput.value || "").trim(), 10);
      const startMinutes = parseTimeInputToMinutes(workStartInput.value);
      const endMinutes = parseTimeInputToMinutes(workEndInput.value);
      const selectedDays = new Set(
        dayButtons.filter(dayButton => dayButton.classList.contains("active")).map(dayButton => dayButton.dataset.day)
      );

      if (!Number.isInteger(targetHours) || targetHours <= 0) {
        byId("requestMessage").textContent = "Enter a valid number of work hours.";
        return;
      }

      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        byId("requestMessage").textContent = "Work end time must be after start time.";
        return;
      }

      if (!selectedDays.size) {
        byId("requestMessage").textContent = "Select at least one work day.";
        return;
      }

      workHoursSettings = {
        targetHours,
        startMinutes,
        endMinutes,
        days: selectedDays
      };
      workHoursEnabled = true;

      byId("requestMessage").textContent = "Generated work-hour blocks shown in blue.";
      renderCurrentSchedule();
    });
  }

  const calendarInfo = makeCalendarInfo(classList);
  const {
    classesByDay,
    allClassTimes,
    firstMinute,
    lastMinute,
    pixelsPerMinute,
    totalHeight
  } = calendarInfo;

  if (!allClassTimes.length) {
    const emptyText = document.createElement("div");
    emptyText.textContent = "Only online classes in this schedule.";
    box.appendChild(emptyText);
    return;
  }

  const calendarBox = document.createElement("div");
  calendarBox.className = "calendar-board";

  calendarBox.appendChild(makeTimeSide(firstMinute, lastMinute, pixelsPerMinute));

  const visibleDays = getVisibleDays();

  const dayArea = document.createElement("div");
  dayArea.className = "calendar-days-area";
  dayArea.style.setProperty("--calendar-columns", String(visibleDays.length));

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "calendar-toolbar-row";
  toolbarRow.style.setProperty("--calendar-columns", String(visibleDays.length));

  const toolbarControls = document.createElement("div");
  toolbarControls.className = "calendar-toolbar-controls";
  toolbarControls.style.gridColumn = String(visibleDays.length);

  const zoomOutButton = document.createElement("button");
  zoomOutButton.type = "button";
  zoomOutButton.className = "btn-main calendar-zoom-btn";
  zoomOutButton.textContent = "-";
  zoomOutButton.title = "Zoom out calendar rows";
  zoomOutButton.disabled = calendarZoom <= calendarZoomMin + 0.001;
  zoomOutButton.addEventListener("click", () => adjustCalendarZoom(-calendarZoomStep));

  const zoomInButton = document.createElement("button");
  zoomInButton.type = "button";
  zoomInButton.className = "btn-main calendar-zoom-btn";
  zoomInButton.textContent = "+";
  zoomInButton.title = "Zoom in calendar rows";
  zoomInButton.disabled = calendarZoom >= calendarZoomMax - 0.001;
  zoomInButton.addEventListener("click", () => adjustCalendarZoom(calendarZoomStep));

  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className = "btn-main calendar-undo-btn";
  undoButton.textContent = "↶ Undo";
  undoButton.title = lastDeletedCustomEvent
    ? "Restore the most recently deleted event"
    : "No deleted event to restore";
  undoButton.disabled = !lastDeletedCustomEvent;
  undoButton.addEventListener("click", restoreLastDeletedEvent);

  toolbarControls.appendChild(zoomOutButton);
  toolbarControls.appendChild(zoomInButton);
  toolbarControls.appendChild(undoButton);
  toolbarRow.appendChild(toolbarControls);

  const dayBoxes = document.createElement("div");
  dayBoxes.className = "calendar-days";
  dayBoxes.style.setProperty("--calendar-columns", String(visibleDays.length));
  visibleDays.forEach(dayName => {
    dayBoxes.appendChild(
      makeDayColumn(dayName, classesByDay, totalHeight, firstMinute, lastMinute, pixelsPerMinute)
    );
  });

  dayArea.appendChild(toolbarRow);
  dayArea.appendChild(dayBoxes);
  calendarBox.appendChild(dayArea);
  box.appendChild(calendarBox);
}


function renderCurrentSchedule() {
  const classList = schedules[currentScheduleIndex] || [];
  showChosenClasses(classList);
  showCalendar(classList);
}


function rerenderOnResize() {
  if (!schedules.length) {
    return;
  }

  renderCurrentSchedule();
}

function renderScheduleButtons() {
  const box = byId("scheduleOptions");
  box.innerHTML = "";

  if (!schedules.length) {
    box.textContent = "No potential schedules available.";
    toggleLoadMoreBtn(false);
    toggleManipulateBtn(false);
    toggleResetBtn(false);
    return;
  }

  schedules.forEach((_, buttonIndex) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = `btn-main btn-schedule-option schedule-option-btn${buttonIndex === currentScheduleIndex ? " active" : ""}${isFavoriteSchedule(buttonIndex) ? " favorite" : ""}${editedIndexes.has(buttonIndex) ? " manipulated" : ""}`;

    let labelText = `Option ${buttonIndex + 1}`;
    if (isFavoriteSchedule(buttonIndex)) {
      labelText += " ★";
    }
    optionButton.textContent = labelText;

    optionButton.addEventListener("click", () => {
      currentScheduleIndex = buttonIndex;
      renderScheduleButtons();
      renderCurrentSchedule();
    });
    box.appendChild(optionButton);
  });

  toggleLoadMoreBtn(hasMoreSchedules);
  const shouldShowManipulateTools = schedules.length > 0 && lockedSectionsByCourse.size > 0;
  toggleManipulateBtn(shouldShowManipulateTools);
  toggleResetBtn(shouldShowManipulateTools);
}


async function readScheduleData(serverResponse) {
  const contentType = serverResponse.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return serverResponse.json();
  }

  return { error: await serverResponse.text() };
}


function showScheduleError(message) {
  byId("requestMessage").textContent = message;
  clearScheduleUi();
  resetScheduleUiState();
}


function clearTeacherUi() {
  byId("teacherMessage").textContent = "";
  byId("teacherResults").innerHTML = "";
}


function renderTeacherResults(teacherList) {
  const messageBox = byId("teacherMessage");
  const resultsBox = byId("teacherResults");
  resultsBox.innerHTML = "";

  if (!teacherList.length) {
    messageBox.textContent = "No teachers matched that search.";
    return;
  }

  messageBox.textContent = `Found ${teacherList.length} teacher(s).`;

  teacherList.forEach(teacherItem => {
    const cardBox = document.createElement("section");
    cardBox.className = "teacher-card";

    const headerBox = document.createElement("header");
    headerBox.className = "teacher-card-header";
    const ratingText = teacherItem.rmp_score ?? "N/A";
    const difficultyText = teacherItem.difficulty ?? "N/A";
    headerBox.textContent = `${teacherItem.teacher_name} | Rating: ${ratingText} | Difficulty: ${difficultyText}`;
    cardBox.appendChild(headerBox);

    const listBox = document.createElement("div");
    listBox.className = "teacher-class-list";

    teacherItem.classes.forEach(oneClass => {
      const rowBox = document.createElement("div");
      rowBox.className = "teacher-class-item";
      const trickyText = oneClass.tricky_scale ? ` | Difficulty Scale: ${oneClass.tricky_scale}` : "";
      rowBox.textContent = `${oneClass.course_number} ${oneClass.course_name} (${oneClass.section_number}) | ${oneClass.meeting} | Term ${oneClass.term}${trickyText}`;
      listBox.appendChild(rowBox);
    });

    cardBox.appendChild(listBox);
    resultsBox.appendChild(cardBox);
  });
}


function applyServerSchedules(serverData, appendMode, preserveLockedSections) {
  const loadedSchedules = serverData.valid_schedules || [];

  if (appendMode) {
    schedules = schedules.concat(loadedSchedules);
  } else {
    schedules = loadedSchedules;
    currentScheduleIndex = 0;
    favoriteIndexes = new Set();
    editedIndexes = new Set();
    if (!preserveLockedSections) {
      lockedSectionsByCourse = new Map();
    }
  }

  hasMoreSchedules = Boolean(serverData.has_more);
  nextScheduleStartIndex = Number.isInteger(serverData.next_start_index)
    ? serverData.next_start_index
    : schedules.length;

  if (!schedules.length) {
    byId("requestMessage").textContent = "No conflict-free schedule found.";
    renderScheduleButtons();
    renderCurrentSchedule();
    return;
  }

  if (appendMode) {
    byId("requestMessage").textContent = loadedSchedules.length
      ? `Loaded ${loadedSchedules.length} more schedule(s). Showing ${schedules.length} total.`
      : `No additional schedules found. Showing ${schedules.length} total.`;
  } else {
    byId("requestMessage").textContent = "";
  }

  renderScheduleButtons();
  renderCurrentSchedule();
}

async function runScheduleSearch() {
  const typedClasses = getTypedClasses();
  const chosenTerm = getTermNumber();

  if (typedClasses.length === 0) {
    toggleResultsPanel(false);
    showScheduleError("Please enter at least one class code.");
    return;
  }

  if (Number.isNaN(chosenTerm)) {
    toggleResultsPanel(false);
    showScheduleError("Term number must be a positive whole number.");
    return;
  }

  toggleResultsPanel(true);
  byId("requestMessage").textContent = "Loading schedules...";
  clearScheduleUi();
  resetScheduleUiState();

  try {
    currentRequest = {
      courses: [...typedClasses],
      term: chosenTerm
    };

    const requestBody = buildScheduleRequestBody(0, schedulePageSize, false);

    const { response } = await sendScheduleRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      showScheduleError(serverData.error || "Request failed.");
      return;
    }

    applyServerSchedules(serverData, false, false);
  } catch (error) {
    byId("requestMessage").textContent = "Could not reach the scheduler API.";
    byId("scheduleOptions").textContent = "";
    byId("selectedSections").textContent = "";
    byId("scheduleGrid").textContent = `Details: ${error.message}`;
    resetScheduleUiState();
  }
}


async function runLoadMoreSchedules() {
  if (!currentRequest || !hasMoreSchedules) {
    return;
  }

  const loadMoreButton = byId("loadMoreBtn");
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Loading...";

  try {
    const requestBody = buildScheduleRequestBody(nextScheduleStartIndex, schedulePageSize, true);

    const { response } = await sendScheduleRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      byId("requestMessage").textContent = serverData.error || "Could not load more schedules.";
      return;
    }

    applyServerSchedules(serverData, true, true);
  } catch (error) {
    byId("requestMessage").textContent = `Could not load more schedules. Details: ${error.message}`;
  } finally {
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = "Load More";
  }
}


async function runManipulateSchedules() {
  if (!currentRequest || !schedules.length) {
    return;
  }

  const lockedSections = getLockedSectionsPayload();
  if (!lockedSections.length) {
    byId("requestMessage").textContent = "Click a course first to lock it before using Manipulate.";
    return;
  }

  const manipulateButton = byId("manipulateBtn");
  manipulateButton.disabled = true;

  try {
    const knownSignatures = new Set(schedules.map(makeScheduleSignature));
    const appendedSchedules = [];
    let startIndex = 0;
    let keepLoading = true;
    let loops = 0;
    let latestHasMore = false;

    while (keepLoading && loops < 6 && appendedSchedules.length < schedulePageSize) {
      const requestBody = buildScheduleRequestBody(startIndex, 10, true);

      const { response } = await sendScheduleRequest(requestBody);
      const serverData = await readScheduleData(response);

      if (!response.ok) {
        byId("requestMessage").textContent = serverData.error || "Could not manipulate schedules.";
        return;
      }

      const serverSchedules = serverData.valid_schedules || [];
      serverSchedules.forEach(oneSchedule => {
        const signature = makeScheduleSignature(oneSchedule);
        if (knownSignatures.has(signature)) {
          return;
        }

        knownSignatures.add(signature);
        appendedSchedules.push(oneSchedule);
      });

      startIndex = Number.isInteger(serverData.next_start_index)
        ? serverData.next_start_index
        : (startIndex + serverSchedules.length);
      keepLoading = Boolean(serverData.has_more);
      latestHasMore = Boolean(serverData.has_more);
      loops += 1;
    }

    if (!appendedSchedules.length) {
      byId("requestMessage").textContent = "No additional schedule options found for the selected locked course(s).";
      return;
    }

    const previousLength = schedules.length;
    schedules = schedules.concat(appendedSchedules);
    for (let i = previousLength; i < schedules.length; i += 1) {
      editedIndexes.add(i);
    }

    hasMoreSchedules = latestHasMore;
    nextScheduleStartIndex = startIndex;
    renderScheduleButtons();
    renderCurrentSchedule();
    byId("requestMessage").textContent = `Locked ${lockedSections.length} course(s). Added ${appendedSchedules.length} new option(s).`;
  } catch (error) {
    byId("requestMessage").textContent = `Could not manipulate schedules. Details: ${error.message}`;
  } finally {
    manipulateButton.disabled = false;
  }
}


function runResetManipulatedSchedules() {
  if (!editedIndexes.size) {
    byId("requestMessage").textContent = "No manipulated schedules to reset.";
    return;
  }

  const keptOldIndexes = [];
  schedules.forEach((_, index) => {
    const isManipulated = editedIndexes.has(index);
    const isStarred = favoriteIndexes.has(index);
    if (!isManipulated || isStarred) {
      keptOldIndexes.push(index);
    }
  });

  const oldToNewIndex = new Map();
  keptOldIndexes.forEach((oldIndex, newIndex) => {
    oldToNewIndex.set(oldIndex, newIndex);
  });

  const removedCount = schedules.length - keptOldIndexes.length;
  if (removedCount <= 0) {
    byId("requestMessage").textContent = "All manipulated schedules are saved with stars, so none were removed.";
    return;
  }

  schedules = keptOldIndexes.map(oldIndex => schedules[oldIndex]);

  const nextFavorites = new Set();
  favoriteIndexes.forEach(oldIndex => {
    if (oldToNewIndex.has(oldIndex)) {
      nextFavorites.add(oldToNewIndex.get(oldIndex));
    }
  });
  favoriteIndexes = nextFavorites;

  const nextManipulated = new Set();
  editedIndexes.forEach(oldIndex => {
    if (oldToNewIndex.has(oldIndex)) {
      nextManipulated.add(oldToNewIndex.get(oldIndex));
    }
  });
  editedIndexes = nextManipulated;

  if (!schedules.length) {
    currentScheduleIndex = 0;
  } else if (!oldToNewIndex.has(currentScheduleIndex)) {
    currentScheduleIndex = 0;
  } else {
    currentScheduleIndex = oldToNewIndex.get(currentScheduleIndex);
  }

  renderScheduleButtons();
  renderCurrentSchedule();
  byId("requestMessage").textContent = `Removed ${removedCount} manipulated schedule option(s). Starred ones were kept.`;
}


function clearActivePaletteListener() {
  if (activePaletteCloseListener) {
    document.removeEventListener("mousedown", activePaletteCloseListener);
    activePaletteCloseListener = null;
  }
}


function showWelcomeScreen() {
  byId("welcomeScreen").hidden = false;
  byId("appShell").hidden = true;
  const topHomeButton = byId("topHomeBtn");
  const topCourseButton = byId("topCourseBtn");
  const topWorkButton = byId("topWorkBtn");
  if (topHomeButton) {
    topHomeButton.hidden = true;
  }
  if (topCourseButton) {
    topCourseButton.hidden = false;
  }
  if (topWorkButton) {
    topWorkButton.hidden = false;
  }
  clearActivePaletteListener();
}


function setSchedulerMode(nextMode) {
  if (nextMode === "work") {
    window.location.href = "./WorkScheduler.html";
    return;
  }

  schedulerMode = nextMode;
  byId("welcomeScreen").hidden = true;
  byId("appShell").hidden = false;
  const topHomeButton = byId("topHomeBtn");
  const topCourseButton = byId("topCourseBtn");
  const topWorkButton = byId("topWorkBtn");
  if (topHomeButton) {
    topHomeButton.hidden = false;
  }
  if (topCourseButton) {
    topCourseButton.hidden = true;
  }
  if (topWorkButton) {
    topWorkButton.hidden = false;
  }

  const showCourse = nextMode === "course";
  const showWork = nextMode === "work";
  byId("courseHero").hidden = !showCourse;
  byId("workHero").hidden = !showWork;

  byId("selectedHeader").textContent = nextMode === "work"
    ? "Scheduled Shifts"
    : "Selected Classes";
}


function makeWorkDayChips(selectedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])) {
  return allCalendarDays.map(dayName => {
    const isSelected = selectedDays.has(dayName);
    return `<button type="button" class="work-day-chip${isSelected ? " active" : ""}" data-day="${dayName}">${dayName.slice(0, 1)}</button>`;
  }).join("");
}


function addEmployeeRow(defaultData = {}) {
  const employeeList = byId("employeeList");
  const rowId = `workEmployee${workEmployeeRowIdCounter}`;
  workEmployeeRowIdCounter += 1;

  const selectedDays = new Set(defaultData.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const rowBox = document.createElement("section");
  rowBox.className = "work-employee-row";
  rowBox.dataset.rowId = rowId;
  rowBox.innerHTML = `
    <h3>Employee</h3>
    <div class="work-employee-fields">
      <label class="calendar-options-field" for="${rowId}Name">
        <span>Employee Name</span>
        <input id="${rowId}Name" class="work-name" type="text" placeholder="Employee name" value="${defaultData.name || ""}" />
      </label>
      <label class="calendar-options-field" for="${rowId}Preferred">
        <span>Preferred Hours</span>
        <input id="${rowId}Preferred" class="work-hours" type="number" min="1" max="80" step="1" value="${defaultData.preferredHours || 20}" />
      </label>
      <label class="calendar-options-field" for="${rowId}Start">
        <span>Availability Start</span>
        <input id="${rowId}Start" class="work-start" type="time" step="60" value="${defaultData.start || "09:00"}" />
      </label>
      <label class="calendar-options-field" for="${rowId}End">
        <span>Availability End</span>
        <input id="${rowId}End" class="work-end" type="time" step="60" value="${defaultData.end || "17:00"}" />
      </label>
    </div>
    <div class="work-days-row">
      <span>Availability Days</span>
      <div class="work-day-chips">${makeWorkDayChips(selectedDays)}</div>
      <button type="button" class="btn-main work-remove-btn">Remove</button>
    </div>
  `;

  rowBox.querySelectorAll(".work-day-chip").forEach(dayButton => {
    dayButton.addEventListener("click", () => {
      dayButton.classList.toggle("active");
    });
  });

  const removeButton = rowBox.querySelector(".work-remove-btn");
  removeButton.addEventListener("click", () => {
    rowBox.remove();
  });

  employeeList.appendChild(rowBox);
}


function parseEmployeeRows() {
  const rows = [...document.querySelectorAll(".work-employee-row")];
  return rows.map(rowBox => {
    const name = rowBox.querySelector(".work-name").value.trim();
    const preferredHours = Number.parseInt(rowBox.querySelector(".work-hours").value, 10);
    const startMinutes = parseTimeInputToMinutes(rowBox.querySelector(".work-start").value);
    const endMinutes = parseTimeInputToMinutes(rowBox.querySelector(".work-end").value);
    const selectedDays = [...rowBox.querySelectorAll(".work-day-chip.active")].map(button => button.dataset.day);

    return {
      name,
      preferredHours,
      startMinutes,
      endMinutes,
      selectedDays
    };
  });
}


function runWorkScheduleGeneration() {
  const employees = parseEmployeeRows();
  if (!employees.length) {
    byId("workMessage").textContent = "Add at least one employee.";
    return;
  }

  const generatedEvents = [];
  const employeeColorMap = new Map();
  const dayNextStart = { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };
  let colorIndex = 0;

  for (const employee of employees) {
    if (!employee.name) {
      byId("workMessage").textContent = "Each employee needs a name.";
      return;
    }

    if (!employee.selectedDays.length) {
      byId("workMessage").textContent = `Choose at least one availability day for ${employee.name}.`;
      return;
    }

    if (employee.startMinutes === null || employee.endMinutes === null || employee.endMinutes <= employee.startMinutes) {
      byId("workMessage").textContent = `Enter valid availability times for ${employee.name}.`;
      return;
    }

    if (!Number.isInteger(employee.preferredHours) || employee.preferredHours <= 0) {
      byId("workMessage").textContent = `Enter preferred weekly hours for ${employee.name}.`;
      return;
    }

    const preferredMinutes = employee.preferredHours * 60;
    const perDayTarget = Math.max(60, Math.floor(preferredMinutes / employee.selectedDays.length));

    if (!employeeColorMap.has(employee.name)) {
      employeeColorMap.set(employee.name, presetEventColors[colorIndex % presetEventColors.length]);
      colorIndex += 1;
    }
    const employeeColor = employeeColorMap.get(employee.name);

    employee.selectedDays.forEach(dayName => {
      const availableMinutes = employee.endMinutes - employee.startMinutes;
      const shiftMinutes = Math.min(availableMinutes, perDayTarget);
      const candidateStart = dayNextStart[dayName] === null
        ? employee.startMinutes
        : Math.max(employee.startMinutes, dayNextStart[dayName]);
      const shiftStart = Math.min(candidateStart, employee.endMinutes - 30);
      const shiftEnd = Math.min(employee.endMinutes, shiftStart + shiftMinutes);

      if (shiftEnd <= shiftStart) {
        return;
      }

      generatedEvents.push({
        eventId: nextCustomEventId,
        course_number: employee.name,
        section_number: "",
        day: dayName,
        start: shiftStart,
        end: shiftEnd,
        start_label: minutesToClock(shiftStart),
        end_label: minutesToClock(shiftEnd),
        teacher_name: `Preferred ${employee.preferredHours}h/week`,
          eventColor: employeeColor
      });
      nextCustomEventId += 1;
      dayNextStart[dayName] = Math.min(employee.endMinutes, shiftEnd + 10);
    });
  }

  customCalendarEvents = generatedEvents;
  clearPendingDeletedEvent();
  clearAllScheduledAlerts();
  schedules = [[]];
  currentScheduleIndex = 0;
  hasMoreSchedules = false;
  byId("workMessage").textContent = `Generated ${generatedEvents.length} shift(s).`;
  byId("requestMessage").textContent = "Work schedule ready.";
  toggleResultsPanel(true);
  renderScheduleButtons();
  renderCurrentSchedule();
}


async function runTeacherSearch() {
  const typedTeacher = byId("teacherRequest").value.trim();
  const chosenTerm = getTermNumber();

  if (Number.isNaN(chosenTerm)) {
    clearTeacherUi();
    byId("teacherMessage").textContent = "Term number must be a positive whole number.";
    return;
  }

  byId("teacherMessage").textContent = "Loading teachers...";
  byId("teacherResults").innerHTML = "";

  try {
    const requestBody = { query: typedTeacher };
    if (chosenTerm !== null) {
      requestBody.term = chosenTerm;
    }

    const { response } = await sendTeacherSearchRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      clearTeacherUi();
      byId("teacherMessage").textContent = serverData.error || "Teacher search failed.";
      return;
    }

    renderTeacherResults(serverData.teachers || []);
  } catch (error) {
    clearTeacherUi();
    byId("teacherMessage").textContent = `Could not reach the scheduler API. Details: ${error.message}`;
  }
}


function ensureWorkEmployeeRows() {
  if (!document.querySelector(".work-employee-row")) {
    addEmployeeRow();
  }
}


byId("welcomeCourseBtn").addEventListener("click", () => {
  setSchedulerMode("course");
});

byId("welcomeWorkBtn").addEventListener("click", () => {
  window.location.href = "./WorkScheduler.html";
});

const topHomeButton = byId("topHomeBtn");
if (topHomeButton) {
  topHomeButton.addEventListener("click", showWelcomeScreen);
}

const topCourseButton = byId("topCourseBtn");
if (topCourseButton) {
  topCourseButton.addEventListener("click", () => setSchedulerMode("course"));
}

const topWorkButton = byId("topWorkBtn");
if (topWorkButton) {
  topWorkButton.addEventListener("click", () => {
    window.location.href = "./WorkScheduler.html";
  });
}

byId("addEmployeeBtn").addEventListener("click", () => addEmployeeRow());
byId("getWorkScheduleBtn").addEventListener("click", () => {
  window.location.href = "./WorkScheduler.html";
});


byId("termBtn").addEventListener("click", () => {
  const panelBox = byId("termPanel");
  const shouldShow = panelBox ? panelBox.hidden : false;
  toggleTermPanel(shouldShow);

  if (shouldShow) {
    byId("termInput").focus();
  } else {
    byId("termInput").value = "";
  }
});

byId("generateBtn").addEventListener("click", runScheduleSearch);
byId("loadMoreBtn").addEventListener("click", runLoadMoreSchedules);
byId("manipulateBtn").addEventListener("click", runManipulateSchedules);
byId("resetManipulatedBtn").addEventListener("click", runResetManipulatedSchedules);
byId("teacherBtn").addEventListener("click", () => {
  const panelBox = byId("teacherSearchPanel");
  const shouldShow = panelBox ? panelBox.hidden : false;
  toggleTeacherPanel(shouldShow);

  if (shouldShow) {
    byId("teacherRequest").focus();
  }
});
byId("teacherSearchBtn").addEventListener("click", runTeacherSearch);
byId("teacherInlineSearchBtn").addEventListener("click", runTeacherSearch);
byId("teacherClearBtn").addEventListener("click", () => {
  byId("teacherRequest").value = "";
  clearTeacherUi();
  byId("teacherRequest").focus();
});
byId("classClearBtn").addEventListener("click", () => {
  byId("classRequest").value = "";
  byId("termInput").value = "";
  byId("requestMessage").textContent = "";
  resetScheduleUiState();
  clearScheduleUi();
  toggleResultsPanel(false);
  byId("classRequest").focus();
});
byId("classRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    runScheduleSearch();
  }
});
byId("teacherRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    runTeacherSearch();
  }
});

toggleResultsPanel(false);
toggleTeacherPanel(false);
toggleTermPanel(false);
toggleLoadMoreBtn(false);
toggleManipulateBtn(false);
toggleResetBtn(false);

const initialView = new URLSearchParams(window.location.search).get("view");
if (initialView === "course") {
  setSchedulerMode("course");
} else if (initialView === "work") {
  window.location.href = "./WorkScheduler.html";
} else {
  showWelcomeScreen();
}

window.addEventListener("resize", () => {
  if (calendarResizeTimer !== null) {
    window.clearTimeout(calendarResizeTimer);
  }

  calendarResizeTimer = window.setTimeout(() => {
    rerenderOnResize();
  }, 120);
});
