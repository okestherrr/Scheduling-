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

  const allClassTimes = Object.values(classesByDay).flat();

  const firstMinute = calendarSettings.startMinutes;
  const lastMinute = calendarSettings.endMinutes;
  const pixelsPerMinute = 1.3;
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


function makeClassCard(classItem, firstMinute, pixelsPerMinute) {
  const cardBox = document.createElement("article");
  const cardTop = (classItem.start - firstMinute) * pixelsPerMinute;
  const durationHeight = (classItem.end - classItem.start) * pixelsPerMinute;
  const cardHeight = Math.max(84, durationHeight);
  const shouldHighlight = classItem.ideal || classItem.is_ideal;
  const isLocked = isLockedSection(classItem);
  const ratingText = classItem.rmp_score ?? "N/A";
  const difficultyText = classItem.difficulty ?? "N/A";
  const recommendedText = classItem.ideal === "Y" ? "Yes" : (classItem.ideal === "N" ? "No" : "N/A");
  const fullTeacherName = classItem.teacher_name || "Teacher";
  const displayCourseSection = classItem.isDevotional
    ? "BYUI Devotional"
    : formatCourseSectionLabel(classItem.course_number, classItem.section_number);
  const teacherHoverText = `RateMyProfessor\nRating: ${ratingText}\nDifficulty: ${difficultyText}\nRecommended: ${recommendedText}`;

  cardBox.className = `calendar-class-card${shouldHighlight ? " ideal" : ""}${isLocked ? " locked" : ""}${classItem.isDevotional ? " devotional" : ""}`;
  cardBox.style.top = `${cardTop}px`;
  cardBox.style.height = `${cardHeight}px`;
  applyCourseColorStyles(cardBox, classItem);
  cardBox.title = "Click to lock/unlock this course section for Manipulate";
  cardBox.innerHTML = `
    <strong>${displayCourseSection}</strong>
    <span>${classItem.start_label} - ${classItem.end_label}</span>
    <small class="teacher-hover-info" title="${teacherHoverText}\nTeacher: ${fullTeacherName}">${fullTeacherName}</small>
  `;

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
    classCard.addEventListener("click", () => {
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
        <span>Start Time</span>
        <input id="calendarStartTime" type="time" step="900" value="${minutesToInputTime(calendarSettings.startMinutes)}" />
      </label>
      <label class="calendar-options-field calendar-options-end-field">
        <span>End Time</span>
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
    `;

    box.appendChild(optionsPanel);

    const satCheckbox = optionsPanel.querySelector("#calendarShowSat");
    const sunCheckbox = optionsPanel.querySelector("#calendarShowSun");
    const startInput = optionsPanel.querySelector("#calendarStartTime");
    const endInput = optionsPanel.querySelector("#calendarEndTime");
    const devotionalInput = optionsPanel.querySelector("#calendarShowDevotional");

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

  const dayBoxes = document.createElement("div");
  dayBoxes.className = "calendar-days";

  const visibleDays = getVisibleDays();
  dayBoxes.style.setProperty("--calendar-columns", String(visibleDays.length));
  visibleDays.forEach(dayName => {
    dayBoxes.appendChild(
      makeDayColumn(dayName, classesByDay, totalHeight, firstMinute, lastMinute, pixelsPerMinute)
    );
  });

  calendarBox.appendChild(dayBoxes);
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
    byId("requestMessage").textContent = `Showing ${schedules.length} potential schedule(s).`;
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

window.addEventListener("resize", () => {
  if (calendarResizeTimer !== null) {
    window.clearTimeout(calendarResizeTimer);
  }

  calendarResizeTimer = window.setTimeout(() => {
    rerenderOnResize();
  }, 120);
});
