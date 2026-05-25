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
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const schedulePageSize = 5;

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

let scheduleChoices = [];
let chosenScheduleIndex = 0;
let favoriteScheduleIndexes = new Set();
let manipulatedScheduleIndexes = new Set();
let lockedCourseSections = new Map();
let hasMoreSchedules = false;
let nextScheduleStartIndex = 0;
let currentScheduleRequest = null;

function getBox(boxId) {
  return document.getElementById(boxId);
}

function getResultsPanel() {
  return document.querySelector(".results-panel");
}

function setResultsPanelVisible(isVisible) {
  const panelBox = getResultsPanel();
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function setTeacherPanelVisible(isVisible) {
  const panelBox = getBox("teacherSearchPanel");
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function setDetailsPanelVisible(isVisible) {
  const panelBox = getBox("detailsPanel");
  if (panelBox) {
    panelBox.hidden = !isVisible;
  }
}


function clearScheduleBoxes() {
  getBox("scheduleOptions").textContent = "";
  getBox("selectedSections").textContent = "";
  getBox("scheduleGrid").textContent = "";
}


function setLoadMoreVisible(isVisible) {
  const loadMoreButton = getBox("loadMoreBtn");
  if (loadMoreButton) {
    loadMoreButton.hidden = !isVisible;
  }
}


function setManipulateVisible(isVisible) {
  const manipulateButton = getBox("manipulateBtn");
  if (manipulateButton) {
    manipulateButton.hidden = !isVisible;
  }
}


function setResetManipulatedVisible(isVisible) {
  const resetButton = getBox("resetManipulatedBtn");
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
  return favoriteScheduleIndexes.has(index);
}


function isLockedSection(classItem) {
  const lockedSection = lockedCourseSections.get(String(classItem.course_number));
  if (!lockedSection) {
    return false;
  }

  return lockedSection === String(classItem.section_number);
}


function toggleLockedSection(classItem) {
  const courseCode = String(classItem.course_number);
  const sectionCode = String(classItem.section_number);
  const lockedSection = lockedCourseSections.get(courseCode);

  if (lockedSection === sectionCode) {
    lockedCourseSections.delete(courseCode);
    return;
  }

  lockedCourseSections.set(courseCode, sectionCode);
}


function getLockedSectionsPayload() {
  return Array.from(lockedCourseSections.entries()).map(([courseNumber, sectionNumber]) => ({
    course_number: courseNumber,
    section_number: sectionNumber
  }));
}


function buildScheduleRequestBody(startIndex, pageSize, includeLockedSections) {
  const requestBody = {
    courses: [...currentScheduleRequest.courses],
    start_index: startIndex,
    page_size: pageSize
  };

  if (currentScheduleRequest.term !== null) {
    requestBody.term = currentScheduleRequest.term;
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
  currentScheduleRequest = null;
  manipulatedScheduleIndexes = new Set();
  lockedCourseSections = new Map();
  setLoadMoreVisible(false);
  setManipulateVisible(false);
  setResetManipulatedVisible(false);
}


function toggleFavoriteSchedule(index) {
  if (favoriteScheduleIndexes.has(index)) {
    favoriteScheduleIndexes.delete(index);
    return;
  }

  favoriteScheduleIndexes.add(index);
}


function getTypedClasses() {
  const typedText = getBox("classRequest").value;

  return typedText
    .split(",")
    .map(oneClass => oneClass.trim().toUpperCase())
    .filter(Boolean);
}

function getTermNumber() {
  const detailsPanel = getBox("detailsPanel");
  if (!detailsPanel || detailsPanel.hidden) {
    return null;
  }

  const typedTerm = getBox("termInput").value.trim();
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
    rowBox.className = `section-item${shouldHighlight ? " ideal" : ""}${isLockedSection(classItem) ? " locked" : ""}`;
    const meetingText = classItem.day === "ONLINE"
      ? "ONLINE"
      : `${classItem.day} ${classItem.start_label} - ${classItem.end_label}`;
    rowBox.textContent = `${classItem.course_number} (${classItem.section_number}) - ${meetingText} - ${classItem.teacher_name}`;
    rowBox.title = "Click to lock/unlock this course section for Manipulate";
    rowBox.addEventListener("click", () => {
      toggleLockedSection(classItem);
      showScheduleButtons();
      showCurrentSchedule();
    });
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
  const pixelsPerMinute = 1.6;
  const totalHeight = ((lastHour - firstHour) * 60 * pixelsPerMinute) + 80;

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
  const cardHeight = Math.max(112, (classItem.end - classItem.start) * pixelsPerMinute);
  const shouldHighlight = classItem.ideal || classItem.is_ideal;
  const isLocked = isLockedSection(classItem);

  cardBox.className = `calendar-class-card${shouldHighlight ? " ideal" : ""}${isLocked ? " locked" : ""}`;
  cardBox.style.top = `${cardTop}px`;
  cardBox.style.height = `${cardHeight}px`;
  cardBox.title = "Click to lock/unlock this course section for Manipulate";
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
    const classCard = makeClassCard(classItem, firstHour, pixelsPerMinute);
    classCard.addEventListener("click", () => {
      toggleLockedSection(classItem);
      showScheduleButtons();
      showCurrentSchedule();
    });
    trackBox.appendChild(classCard);

    const currentHeight = parseFloat(classCard.style.height) || 0;
    const neededHeight = classCard.scrollHeight + 6;
    if (neededHeight > currentHeight) {
      classCard.style.height = `${neededHeight}px`;
    }
  });

  dayBox.appendChild(trackBox);
  return dayBox;
}

function showCalendar(classList) {
  const box = getBox("scheduleGrid");
  box.innerHTML = "";

  const calendarActions = document.createElement("div");
  calendarActions.className = "calendar-actions";

  const favoriteButton = document.createElement("button");
  favoriteButton.type = "button";
  const isFavorite = isFavoriteSchedule(chosenScheduleIndex);
  favoriteButton.className = `calendar-favorite-btn${isFavorite ? " active" : ""}`;
  favoriteButton.textContent = isFavorite ? "★" : "☆";
  favoriteButton.title = isFavorite
    ? "Unhighlight this schedule option"
    : "Highlight this schedule option";
  favoriteButton.addEventListener("click", () => {
    toggleFavoriteSchedule(chosenScheduleIndex);
    showScheduleButtons();
    showCurrentSchedule();
  });

  calendarActions.appendChild(favoriteButton);
  box.appendChild(calendarActions);

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
    const emptyText = document.createElement("div");
    emptyText.textContent = "Only online classes in this schedule.";
    box.appendChild(emptyText);
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
    setLoadMoreVisible(false);
    setManipulateVisible(false);
    setResetManipulatedVisible(false);
    return;
  }

  scheduleChoices.forEach((_, buttonIndex) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = `schedule-option-btn${buttonIndex === chosenScheduleIndex ? " active" : ""}${isFavoriteSchedule(buttonIndex) ? " favorite" : ""}${manipulatedScheduleIndexes.has(buttonIndex) ? " manipulated" : ""}`;

    let labelText = `Option ${buttonIndex + 1}`;
    if (isFavoriteSchedule(buttonIndex)) {
      labelText += " ★";
    }
    optionButton.textContent = labelText;

    optionButton.addEventListener("click", () => {
      chosenScheduleIndex = buttonIndex;
      showScheduleButtons();
      showCurrentSchedule();
    });
    box.appendChild(optionButton);
  });

  setLoadMoreVisible(hasMoreSchedules);
  const shouldShowManipulateTools = scheduleChoices.length > 0 && lockedCourseSections.size > 0;
  setManipulateVisible(shouldShowManipulateTools);
  setResetManipulatedVisible(shouldShowManipulateTools);
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
  resetScheduleUiState();
}


function clearTeacherResults() {
  getBox("teacherMessage").textContent = "";
  getBox("teacherResults").innerHTML = "";
}


function showTeacherResults(teacherList) {
  const messageBox = getBox("teacherMessage");
  const resultsBox = getBox("teacherResults");
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


function showSchedulesFromServer(serverData, appendMode, preserveLockedSections) {
  const loadedSchedules = serverData.valid_schedules || [];

  if (appendMode) {
    scheduleChoices = scheduleChoices.concat(loadedSchedules);
  } else {
    scheduleChoices = loadedSchedules;
    chosenScheduleIndex = 0;
    favoriteScheduleIndexes = new Set();
    manipulatedScheduleIndexes = new Set();
    if (!preserveLockedSections) {
      lockedCourseSections = new Map();
    }
  }

  hasMoreSchedules = Boolean(serverData.has_more);
  nextScheduleStartIndex = Number.isInteger(serverData.next_start_index)
    ? serverData.next_start_index
    : scheduleChoices.length;

  if (!scheduleChoices.length) {
    getBox("requestMessage").textContent = "No conflict-free schedule found.";
    showScheduleButtons();
    showCurrentSchedule();
    return;
  }

  if (appendMode) {
    getBox("requestMessage").textContent = loadedSchedules.length
      ? `Loaded ${loadedSchedules.length} more schedule(s). Showing ${scheduleChoices.length} total.`
      : `No additional schedules found. Showing ${scheduleChoices.length} total.`;
  } else {
    getBox("requestMessage").textContent = `Showing ${scheduleChoices.length} potential schedule(s).`;
  }

  showScheduleButtons();
  showCurrentSchedule();
}

async function submitClassCodes() {
  const typedClasses = getTypedClasses();
  const chosenTerm = getTermNumber();

  if (typedClasses.length === 0) {
    setResultsPanelVisible(false);
    showErrorMessage("Please enter at least one class code.");
    return;
  }

  if (Number.isNaN(chosenTerm)) {
    setResultsPanelVisible(false);
    showErrorMessage("Term number must be a positive whole number.");
    return;
  }

  setResultsPanelVisible(true);
  getBox("requestMessage").textContent = "Loading schedules...";
  clearScheduleBoxes();
  resetScheduleUiState();

  try {
    currentScheduleRequest = {
      courses: [...typedClasses],
      term: chosenTerm
    };

    const requestBody = buildScheduleRequestBody(0, schedulePageSize, false);

    const { response } = await sendScheduleRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      showErrorMessage(serverData.error || "Request failed.");
      return;
    }

    showSchedulesFromServer(serverData, false, false);
  } catch (error) {
    getBox("requestMessage").textContent = "Could not reach the scheduler API.";
    getBox("scheduleOptions").textContent = "";
    getBox("selectedSections").textContent = "";
    getBox("scheduleGrid").textContent = `Details: ${error.message}`;
    resetScheduleUiState();
  }
}


async function loadMoreSchedules() {
  if (!currentScheduleRequest || !hasMoreSchedules) {
    return;
  }

  const loadMoreButton = getBox("loadMoreBtn");
  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Loading...";

  try {
    const requestBody = buildScheduleRequestBody(nextScheduleStartIndex, schedulePageSize, true);

    const { response } = await sendScheduleRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      getBox("requestMessage").textContent = serverData.error || "Could not load more schedules.";
      return;
    }

    showSchedulesFromServer(serverData, true, true);
  } catch (error) {
    getBox("requestMessage").textContent = `Could not load more schedules. Details: ${error.message}`;
  } finally {
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = "Load More";
  }
}


async function manipulateSchedules() {
  if (!currentScheduleRequest || !scheduleChoices.length) {
    return;
  }

  const lockedSections = getLockedSectionsPayload();
  if (!lockedSections.length) {
    getBox("requestMessage").textContent = "Click a course first to lock it before using Manipulate.";
    return;
  }

  const manipulateButton = getBox("manipulateBtn");
  manipulateButton.disabled = true;

  try {
    const knownSignatures = new Set(scheduleChoices.map(makeScheduleSignature));
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
        getBox("requestMessage").textContent = serverData.error || "Could not manipulate schedules.";
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
      getBox("requestMessage").textContent = "No additional schedule options found for the selected locked course(s).";
      return;
    }

    const previousLength = scheduleChoices.length;
    scheduleChoices = scheduleChoices.concat(appendedSchedules);
    for (let i = previousLength; i < scheduleChoices.length; i += 1) {
      manipulatedScheduleIndexes.add(i);
    }

    hasMoreSchedules = latestHasMore;
    nextScheduleStartIndex = startIndex;
    showScheduleButtons();
    showCurrentSchedule();
    getBox("requestMessage").textContent = `Locked ${lockedSections.length} course(s). Added ${appendedSchedules.length} new option(s).`;
  } catch (error) {
    getBox("requestMessage").textContent = `Could not manipulate schedules. Details: ${error.message}`;
  } finally {
    manipulateButton.disabled = false;
  }
}


function resetManipulatedSchedules() {
  if (!manipulatedScheduleIndexes.size) {
    getBox("requestMessage").textContent = "No manipulated schedules to reset.";
    return;
  }

  const keptOldIndexes = [];
  scheduleChoices.forEach((_, index) => {
    const isManipulated = manipulatedScheduleIndexes.has(index);
    const isStarred = favoriteScheduleIndexes.has(index);
    if (!isManipulated || isStarred) {
      keptOldIndexes.push(index);
    }
  });

  const oldToNewIndex = new Map();
  keptOldIndexes.forEach((oldIndex, newIndex) => {
    oldToNewIndex.set(oldIndex, newIndex);
  });

  const removedCount = scheduleChoices.length - keptOldIndexes.length;
  if (removedCount <= 0) {
    getBox("requestMessage").textContent = "All manipulated schedules are saved with stars, so none were removed.";
    return;
  }

  scheduleChoices = keptOldIndexes.map(oldIndex => scheduleChoices[oldIndex]);

  const nextFavorites = new Set();
  favoriteScheduleIndexes.forEach(oldIndex => {
    if (oldToNewIndex.has(oldIndex)) {
      nextFavorites.add(oldToNewIndex.get(oldIndex));
    }
  });
  favoriteScheduleIndexes = nextFavorites;

  const nextManipulated = new Set();
  manipulatedScheduleIndexes.forEach(oldIndex => {
    if (oldToNewIndex.has(oldIndex)) {
      nextManipulated.add(oldToNewIndex.get(oldIndex));
    }
  });
  manipulatedScheduleIndexes = nextManipulated;

  if (!scheduleChoices.length) {
    chosenScheduleIndex = 0;
  } else if (!oldToNewIndex.has(chosenScheduleIndex)) {
    chosenScheduleIndex = 0;
  } else {
    chosenScheduleIndex = oldToNewIndex.get(chosenScheduleIndex);
  }

  showScheduleButtons();
  showCurrentSchedule();
  getBox("requestMessage").textContent = `Removed ${removedCount} manipulated schedule option(s). Starred ones were kept.`;
}


async function submitTeacherSearch() {
  const typedTeacher = getBox("teacherRequest").value.trim();
  const chosenTerm = getTermNumber();

  if (Number.isNaN(chosenTerm)) {
    clearTeacherResults();
    getBox("teacherMessage").textContent = "Term number must be a positive whole number.";
    return;
  }

  getBox("teacherMessage").textContent = "Loading teachers...";
  getBox("teacherResults").innerHTML = "";

  try {
    const requestBody = { query: typedTeacher };
    if (chosenTerm !== null) {
      requestBody.term = chosenTerm;
    }

    const { response } = await sendTeacherSearchRequest(requestBody);
    const serverData = await readScheduleData(response);

    if (!response.ok) {
      clearTeacherResults();
      getBox("teacherMessage").textContent = serverData.error || "Teacher search failed.";
      return;
    }

    showTeacherResults(serverData.teachers || []);
  } catch (error) {
    clearTeacherResults();
    getBox("teacherMessage").textContent = `Could not reach the scheduler API. Details: ${error.message}`;
  }
}


getBox("detailsBtn").addEventListener("click", () => {
  const panelBox = getBox("detailsPanel");
  const shouldShow = panelBox ? panelBox.hidden : false;
  setDetailsPanelVisible(shouldShow);

  if (shouldShow) {
    getBox("termInput").focus();
  } else {
    getBox("termInput").value = "";
    setTeacherPanelVisible(false);
    clearTeacherResults();
  }
});

getBox("generateBtn").addEventListener("click", submitClassCodes);
getBox("loadMoreBtn").addEventListener("click", loadMoreSchedules);
getBox("manipulateBtn").addEventListener("click", manipulateSchedules);
getBox("resetManipulatedBtn").addEventListener("click", resetManipulatedSchedules);
getBox("teacherBtn").addEventListener("click", () => {
  const detailsPanel = getBox("detailsPanel");
  if (detailsPanel && detailsPanel.hidden) {
    setDetailsPanelVisible(true);
    setTeacherPanelVisible(true);
    getBox("teacherRequest").focus();
    return;
  }

  const panelBox = getBox("teacherSearchPanel");
  const shouldShow = panelBox ? panelBox.hidden : false;
  setTeacherPanelVisible(shouldShow);

  if (shouldShow) {
    getBox("teacherRequest").focus();
  }
});
getBox("teacherSearchBtn").addEventListener("click", submitTeacherSearch);
getBox("teacherClearBtn").addEventListener("click", () => {
  getBox("teacherRequest").value = "";
  clearTeacherResults();
  getBox("teacherRequest").focus();
});
getBox("classClearBtn").addEventListener("click", () => {
  getBox("classRequest").value = "";
  getBox("termInput").value = "";
  getBox("requestMessage").textContent = "";
  resetScheduleUiState();
  clearScheduleBoxes();
  setResultsPanelVisible(false);
  getBox("classRequest").focus();
});
getBox("classRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    submitClassCodes();
  }
});
getBox("teacherRequest").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    submitTeacherSearch();
  }
});

setResultsPanelVisible(false);
setTeacherPanelVisible(false);
setDetailsPanelVisible(false);
setLoadMoreVisible(false);
setManipulateVisible(false);
setResetManipulatedVisible(false);