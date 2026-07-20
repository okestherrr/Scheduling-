const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const Colors = [
  "#F6A5A5", "#EF5350", "#F7B267", "#FB8C00", "#F7E588", "#FDD835",
  "#B8E986", "#7CB342", "#7ED7C1", "#26A69A", "#8AD2F4", "#1E88E5",
  "#B39DDB", "#5E35B1", "#D6A4EB", "#8E24AA", "#F8A6D1", "#D81B60"
];
//establishes the days and subnames of the days
const daylabels = [
  { value: "Mon", label: "Monday" },
  { value: "Tue", label: "Tuesday" },
  { value: "Wed", label: "Wednesday" },
  { value: "Thu", label: "Thursday" },
  { value: "Fri", label: "Friday" },
  { value: "Sat", label: "Saturday" },
  { value: "Sun", label: "Sunday" },
  { value: "Weekdays", label: "Weekdays(Mon-Fri)" },
  { value: "Weekend", label: "Weekend(Sat-Sun)" }
];

let employeeRowIdCounter = 1;
let templateRowIdCounter = 1;
let nextGeneratedShiftId = 1;
let generatedShiftList = []; // empty list of the shifts
let generatedEmployeeList = [];//empty list of employees
let generatedCoverageList = [];// empty list of covered shifts
const employeeColorByName = new Map();
const WORK_EMPLOYEE_STORAGE_KEY = "workSchedulerEmployees";
const genericInputMessage = "Please check your input and try again.";

//gets element by id
function getElementById(id) {
  return document.getElementById(id);
}

//shortcut for element by id
function byId(id) {
  return getElementById(id);
}

//shows a message in the work message box
function setWorkMessage(messageText) {
  const messageBox = byId("workMessage");
  if (messageBox) {
    messageBox.textContent = messageText;
  }
}

//formats time for the schedule
function minutesToClock(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hour24 = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}
//reads the time input
function parseTimeInputToMinutes(value) {
  if (!value || !value.includes(":")) {
    return null;
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return (hours * 60) + minutes;
}

//time format for inputs
function minutesToTimeInput(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

//short hour labels
function minutesToCompactHour(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hour24 = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const hour12 = ((hour24 + 11) % 12) + 1;
  if (minute === 0) {
    return String(hour12);
  }
  return `${hour12}:${String(minute).padStart(2, "0")}`;
}

//hour labels with am and pm
function minutesToHourAmPm(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hour24 = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  if (minute === 0) {
    return `${hour12} ${period}`;
  }
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

//buttons for employee availability
function buildWorkDayChipButtons(selectedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])) {
  const chipHtml = [];
  allDays.forEach(day => {
    const active = selectedDays.has(day);
    chipHtml.push(`<button type="button" class="work-day-chip${active ? " active" : ""}" data-day="${day}">${day.slice(0, 1)}</button>`);
  });
  return chipHtml.join("");
}

//removes employee rows
function clearEmployeeRows() {
  const list = getElementById("employeeList");
  if (list) {
    list.innerHTML = "";
  }
}

//removes shift rows
function clearShiftTemplateRows() {
  const list = getElementById("shiftTemplateList");
  if (list) {
    list.innerHTML = "";
  }
}
//random numbers for testing
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

//employee names for testing
function sampleUniqueNames(count) {
  const firstNames = ["Ava", "Noah", "Mia", "Ethan", "Liam", "Emma", "Olivia", "Mason", "Elijah", "Sophia", "Amelia", "Lucas", "Harper", "James", "Isla", "Daniel", "Levi", "Grace", "Nora", "Logan"];
  const lastNames = ["Bennett", "Carter", "Diaz", "Foster", "Green", "Hayes", "Irwin", "Jordan", "Khan", "Lopez", "Morris", "Nguyen", "Owens", "Patel", "Quinn", "Reed", "Sanchez", "Turner", "Vasquez", "Walker"];
  const used = new Set();
  const names = [];
  while (names.length < count) {
    const first = firstNames[randomInt(0, firstNames.length - 1)];
    const last = lastNames[randomInt(0, lastNames.length - 1)];
    const full = `${first} ${last}`;
    if (used.has(full)) {
      continue;
    }
    used.add(full);
    names.push(full);
  }
  return names;
}

//employee testing info
function buildRandomEmployeeData() {
  const employeeCount = randomInt(6, 10);
  const names = sampleUniqueNames(employeeCount);
  const items = [];
  names.forEach((name, index) => {
    const preferredHours = randomInt(18, 34);
    const maxWeeklyHours = randomInt(preferredHours, Math.min(40, preferredHours + 10));
    const startHourOptions = [8, 9, 10, 11, 12];
    const startHour = startHourOptions[randomInt(0, startHourOptions.length - 1)];
    const shiftSpanHours = randomInt(6, 10);
    const endHour = Math.min(23, startHour + shiftSpanHours);
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (index % 3 === 0 && Math.random() > 0.4) {
      days.push("Sat");
    }
    if (index % 4 === 0 && Math.random() > 0.5) {
      days.push("Sun");
    }
    items.push({
      name,
      preferredHours,
      maxWeeklyHours,
      start: minutesToTimeInput(startHour * 60),
      end: minutesToTimeInput(endHour * 60),
      days
    });
  });
  return items;
}

//saved employee data
function loadEmployeesFromStorage() {
  try {
    const raw = window.localStorage.getItem(WORK_EMPLOYEE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(item => ({
      name: String(item.name || "").trim(),
      preferredHours: Number.parseInt(item.preferredHours, 10),
      maxWeeklyHours: Number.parseInt(item.maxWeeklyHours, 10),
      startMinutes: parseTimeInputToMinutes(item.start || ""),
      endMinutes: parseTimeInputToMinutes(item.end || ""),
      selectedDays: Array.isArray(item.days) ? item.days.filter(day => allDays.includes(day)) : []
    }));
  } catch (_error) {
    return [];
  }
}

//employee preview
function renderEmployeePreview() {
  const previewBox = getElementById("employeeSummaryList");
  if (!previewBox) {
    return;
  }
  const employees = loadEmployeesFromStorage();
  if (!employees.length) {
    previewBox.innerHTML = "<p>No employees saved yet. Go to Employee Details first.</p>";
    return;
  }
  const listItems = employees.map(employee => {
    const startLabel = employee.startMinutes === null ? "--" : minutesToClock(employee.startMinutes);
    const endLabel = employee.endMinutes === null ? "--" : minutesToClock(employee.endMinutes);
    const dayText = employee.selectedDays.length ? employee.selectedDays.join(", ") : "No days selected";
    return `<li><strong>${employee.name || "Unnamed"}</strong> | Pref ${employee.preferredHours || 0}h | Max ${employee.maxWeeklyHours || 0}h | ${startLabel}-${endLabel} | ${dayText}</li>`;
  }).join("");
  previewBox.innerHTML = `<ul class="employee-summary-list">${listItems}</ul>`;
}

//employee list for scheduling
function getEmployeesForScheduling() {
  const hasEmployeeRows = document.querySelectorAll(".work-employee-row").length > 0;
  if (hasEmployeeRows) {
    return parseEmployeeRows();
  }
  return loadEmployeesFromStorage();
}

//testing button for employees
function generateEmployeeTestingData() {
  const data = buildRandomEmployeeData();
  clearEmployeeRows();
  const hasEmployeeList = !!getElementById("employeeList");
  if (hasEmployeeList) {
    data.forEach(item => addEmployeeRow(item));
  }
  try {
    window.localStorage.setItem(WORK_EMPLOYEE_STORAGE_KEY, JSON.stringify(data));
  } catch (_error) {
    // no-op when localStorage is unavailable
  }
  const messageBox = getElementById("workMessage");
  if (messageBox) {
    messageBox.textContent = hasEmployeeList
      ? "Testing data loaded for employees."
      : "Testing employee data saved.";
  }
  renderEmployeePreview();
}

//testing button for shifts
function generateShiftTestingData() {
  clearShiftTemplateRows();
  const hasWeekendCoverage = Math.random() > 0.45;
  const baseTemplates = [
    { name: "Morning", dayGroup: "Weekdays", start: "09:00", end: "13:00", need: randomInt(2, 3) },
    { name: "Afternoon", dayGroup: "Weekdays", start: "13:00", end: "17:00", need: randomInt(2, 4) },
    { name: "Evening", dayGroup: "Weekdays", start: "17:00", end: "21:00", need: randomInt(2, 3) }
  ];
  if (hasWeekendCoverage) {
    baseTemplates.push({ name: "Weekend Day", dayGroup: "Weekend", start: "10:00", end: "18:00", need: randomInt(1, 3) });
  }
  baseTemplates.forEach(template => addShiftTemplateRow(template));
  getElementById("workBusinessStart").value = "09:00";
  getElementById("workBusinessEnd").value = hasWeekendCoverage ? "21:00" : "20:00";
  getElementById("workMessage").textContent = "Testing data loaded for shift details.";
}

//new employee row
function addEmployeeRow(defaultData = {}) {
  const employeeList = getElementById("employeeList");
  if (!employeeList) {
    return;
  }
  const rowId = `workEmployee${employeeRowIdCounter}`;
  employeeRowIdCounter += 1;
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
        <span>Preferred Weekly Hours</span>
        <input id="${rowId}Preferred" class="work-hours" type="number" min="1" max="80" step="1" value="${defaultData.preferredHours ?? ""}" />
      </label>
      <label class="calendar-options-field" for="${rowId}Max">
        <span>Max Weekly Hours</span>
        <input id="${rowId}Max" class="work-max-hours" type="number" min="1" max="80" step="1" value="${defaultData.maxWeeklyHours ?? ""}" />
      </label>
      <label class="calendar-options-field" for="${rowId}Start">
        <span>Availability Start</span>
        <input id="${rowId}Start" class="work-start" type="time" step="60" value="${defaultData.start ?? ""}" />
      </label>
      <label class="calendar-options-field" for="${rowId}End">
        <span>Availability End</span>
        <input id="${rowId}End" class="work-end" type="time" step="60" value="${defaultData.end ?? ""}" />
      </label>
    </div>
    <div class="work-days-row">
      <span>Availability Days</span>
      <div class="work-day-chips">${buildWorkDayChipButtons(selectedDays)}</div>
      <button type="button" class="btn-main work-remove-btn">Remove</button>
    </div>
  `;
  rowBox.querySelectorAll(".work-day-chip").forEach(dayButton => {
    dayButton.addEventListener("click", () => {
      dayButton.classList.toggle("active");
    });
  });
  rowBox.querySelector(".work-remove-btn").addEventListener("click", () => {
    rowBox.remove();
  });
  employeeList.appendChild(rowBox);
}

//employee values
function parseEmployeeRows() {
  const rows = [...document.querySelectorAll(".work-employee-row")];
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector(".work-name").value.trim();
    const preferredHours = Number.parseInt(row.querySelector(".work-hours").value, 10);
    const maxWeeklyHours = Number.parseInt(row.querySelector(".work-max-hours").value, 10);
    const startMinutes = parseTimeInputToMinutes(row.querySelector(".work-start").value);
    const endMinutes = parseTimeInputToMinutes(row.querySelector(".work-end").value);
    const days = [];
    row.querySelectorAll(".work-day-chip.active").forEach(button => {
      days.push(button.dataset.day);
    });
    items.push({
      name,
      preferredHours,
      maxWeeklyHours,
      startMinutes,
      endMinutes,
      selectedDays: days
    });
  });
  return items;
}

//new shift row
function addShiftTemplateRow(defaultData = {}) {
  const list = getElementById("shiftTemplateList");
  const rowId = `shiftTemplate${templateRowIdCounter}`;
  templateRowIdCounter += 1;
  const row = document.createElement("section");
  row.className = "shift-template-row";
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <label class="calendar-options-field" for="${rowId}Name">
      <span>Shift Name</span>
      <input id="${rowId}Name" class="template-name" type="text" value="${defaultData.name ?? ""}" />
    </label>
    <label class="calendar-options-field" for="${rowId}DayGroup">
      <span>Day</span>
      <select id="${rowId}DayGroup" class="template-day-group">
        ${daylabels.map(option => `<option value="${option.value}"${defaultData.dayGroup === option.value ? " selected" : ""}>${option.label}</option>`).join("")}
      </select>
    </label>
    <label class="calendar-options-field" for="${rowId}Start">
      <span>Start</span>
      <input id="${rowId}Start" class="template-start" type="time" step="60" value="${defaultData.start ?? ""}" />
    </label>
    <label class="calendar-options-field" for="${rowId}End">
      <span>End</span>
      <input id="${rowId}End" class="template-end" type="time" step="60" value="${defaultData.end ?? ""}" />
    </label>
    <label class="calendar-options-field" for="${rowId}Need">
      <span>Employees Needed</span>
      <input id="${rowId}Need" class="template-need" type="number" min="1" max="50" step="1" value="${defaultData.need ?? ""}" />
    </label>
    <button type="button" class="btn-main template-remove-btn">Remove</button>
  `;
  row.querySelector(".template-remove-btn").addEventListener("click", () => {
    row.remove();
  });
  list.appendChild(row);
}

//shift values
function parseShiftTemplateRows() {
  const rows = [...document.querySelectorAll(".shift-template-row")];
  const items = [];
  rows.forEach(row => {
    items.push({
      name: row.querySelector(".template-name").value.trim(),
      dayGroup: row.querySelector(".template-day-group").value,
      start: parseTimeInputToMinutes(row.querySelector(".template-start").value),
      end: parseTimeInputToMinutes(row.querySelector(".template-end").value),
      need: Number.parseInt(row.querySelector(".template-need").value, 10)
    });
  });
  return items;
}

//weekday groups
function expandDayGroup(dayGroup) {
  if (dayGroup === "Weekdays") {
    return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  }
  if (dayGroup === "Weekend") {
    return ["Sat", "Sun"];
  }
  if (allDays.includes(dayGroup)) {
    return [dayGroup];
  }
  return [];
}

//shift requirements for each day
function expandShiftTemplatesToRequirements(templates) {
  const output = [];
  // one template can apply to multiple days, so we break it out into real day-by-day requirements
  for (const template of templates) {
    const days = expandDayGroup(template.dayGroup);
    for (const day of days) {
      output.push({
        templateName: template.name,
        dayGroup: template.dayGroup,
        day,
        start: template.start,
        end: template.end,
        need: template.need
      });
    }
  }
  return output;
}

//business hour settings
function parseGlobalRules() {
  const businessStart = parseTimeInputToMinutes(getElementById("workBusinessStart").value);
  const businessEnd = parseTimeInputToMinutes(getElementById("workBusinessEnd").value);
  const slotSize = 60;
  // Internal defaults after removing UI controls: keep shifts long and realistic.
  const minShiftHours = 4;
  const maxShiftHours = 10;
  return {
    businessStart,
    businessEnd,
    slotSize,
    minShiftHours,
    maxShiftHours
  };
}

//staffing grid
function createNeedGrid(slotStartsByDay) {
  const needGrid = {};
  // start every slot at 0 workers needed, then fill real needs later
  allDays.forEach(day => {
    const daySlots = slotStartsByDay[day];
    needGrid[day] = [];
    for (let i = 0; i < daySlots.length; i += 1) {
      needGrid[day].push(0);
    }
  });
  return needGrid;
}

//hour slots for each day
function createSlotStartsByDay(businessStart, businessEnd, slotSize) {
  const slotStartsByDay = {};
  allDays.forEach(dayName => {
    slotStartsByDay[dayName] = [];
    for (let minute = businessStart; minute + slotSize <= businessEnd; minute += slotSize) {
      slotStartsByDay[dayName].push(minute);
    }
  });
  return slotStartsByDay;
}

//staffing for each shift
function applyShiftTemplateNeeds(needByDay, requirements, slotStartsByDay, slotSize) {
  // paint each template's "need" onto the matching time slots for that day
  requirements.forEach(rule => {
    const slots = needByDay[rule.day];
    const starts = slotStartsByDay[rule.day];
    if (!slots || !starts) {
      return;
    }
    for (let slotIndex = 0; slotIndex < starts.length; slotIndex += 1) {
      const slotStart = starts[slotIndex];
      const slotEnd = slotStart + slotSize;
      if (slotStart >= rule.start && slotEnd <= rule.end) {
        slots[slotIndex] = Math.max(slots[slotIndex], rule.need);
      }
    }
  });
}

//employee availability
function isEmployeeAvailableForShiftSlot(employee, dayName, slotStart, slotEnd) {
  if (!employee.selectedDays.includes(dayName)) {
    return false;
  }
  return slotStart >= employee.startMinutes && slotEnd <= employee.endMinutes;
}

//assigned employees
function isEmployeeAssignedInSlot(assignmentsByDay, dayName, slotIndex, employeeName) {
  return assignmentsByDay[dayName][slotIndex].includes(employeeName);
}

//previous connected shifts
function countTrailingAssignedSlots(assignmentsByDay, dayName, slotIndex, employeeName) {
  let streak = 0;
  for (let index = slotIndex - 1; index >= 0; index -= 1) {
    if (!isEmployeeAssignedInSlot(assignmentsByDay, dayName, index, employeeName)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

//earlier shifts that day
function hasAssignedEarlierSlot(assignmentsByDay, dayName, slotIndex, employeeName) {
  for (let index = 0; index < slotIndex; index += 1) {
    if (isEmployeeAssignedInSlot(assignmentsByDay, dayName, index, employeeName)) {
      return true;
    }
  }
  return false;
}

//available shifts ahead
function countFutureAvailableSlots(employee, dayName, slotStarts, fromIndex, slotSize, maxSlots) {
  let count = 0;
  // check how far this person can keep working from this point forward
  for (let index = fromIndex; index < slotStarts.length && count < maxSlots; index += 1) {
    const slotStart = slotStarts[index];
    const slotEnd = slotStart + slotSize;
    if (!isEmployeeAvailableForShiftSlot(employee, dayName, slotStart, slotEnd)) {
      break;
    }
    count += 1;
  }
  return count;
}

//future shifts needing people
function countFutureNeededSlots(needSlots, fromIndex, maxSlots) {
  let count = 0;
  // check how many upcoming slots actually still need people
  for (let index = fromIndex; index < needSlots.length && count < maxSlots; index += 1) {
    if ((needSlots[index] || 0) <= 0) {
      break;
    }
    count += 1;
  }
  return count;
}

//best employee for each shift
function selectShiftCandidatesForSlot({
  employees,
  dayName,
  slotIndex,
  slotStarts,
  needSlots,
  slotSize,
  assignmentsByDay,
  employeeMinutesWorked,
  minShiftSlots,
  maxShiftSlots
}) {
  const slotStart = slotStarts[slotIndex];
  const slotEnd = slotStart + slotSize;
  const primary = [];
  // build a list of people who are valid for this exact slot
  employees.forEach(employee => {
    if (!isEmployeeAvailableForShiftSlot(employee, dayName, slotStart, slotEnd)) {
      return;
    }
    const workedMinutes = employeeMinutesWorked.get(employee.name) || 0;
    if (workedMinutes + slotSize > employee.maxWeeklyHours * 60) {
      return;
    }
    const trailingSlots = countTrailingAssignedSlots(assignmentsByDay, dayName, slotIndex, employee.name);
    const continuingShift = trailingSlots > 0;
    // Enforce one continuous shift per employee per day.
    // If they already worked earlier today but are not on the previous slot,
    // assigning now would create a split shift.
    const assignedEarlier = hasAssignedEarlierSlot(assignmentsByDay, dayName, slotIndex, employee.name);
    if (assignedEarlier && !continuingShift) {
      return;
    }
    const nextShiftSize = trailingSlots + 1;
    if (nextShiftSize > maxShiftSlots) {
      return;
    }
    const mustContinueToMeetMinimum = continuingShift && nextShiftSize < minShiftSlots;
    // Do not start a new shift if the employee cannot fit at least
    // the minimum shift length before hitting weekly max hours.
    if (!continuingShift) {
      const remainingWeeklyCapacity = (employee.maxWeeklyHours * 60) - workedMinutes;
      if (remainingWeeklyCapacity < (minShiftSlots * slotSize)) {
        return;
      }
    }
    let shiftCanMeetMinimum = true;
    if (!continuingShift && minShiftSlots > 1) {
      const availableRun = countFutureAvailableSlots(employee, dayName, slotStarts, slotIndex, slotSize, maxShiftSlots);
      const neededRun = countFutureNeededSlots(needSlots, slotIndex, maxShiftSlots);
      shiftCanMeetMinimum = availableRun >= minShiftSlots && neededRun >= minShiftSlots;
    }
    const remainingPreferred = Math.max(0, (employee.preferredHours * 60) - workedMinutes);
    // keep extra info so sorting can pick the "best" next person fairly
    const candidate = {
      employee,
      workedMinutes,
      remainingPreferred,
      continuingShift,
      mustContinueToMeetMinimum,
      shiftCanMeetMinimum
    };
    if (shiftCanMeetMinimum) {
      primary.push(candidate);
    }
  });
  const byPriority = (a, b) => {
    // First, preserve in-progress shifts until they satisfy the minimum length.
    if (a.mustContinueToMeetMinimum !== b.mustContinueToMeetMinimum) {
      return a.mustContinueToMeetMinimum ? -1 : 1;
    }
    // Keep existing shifts continuous before opening new starts.
    if (a.continuingShift !== b.continuingShift) {
      return a.continuingShift ? -1 : 1;
    }
    if (a.remainingPreferred !== b.remainingPreferred) {
      return b.remainingPreferred - a.remainingPreferred;
    }
    if (a.workedMinutes !== b.workedMinutes) {
      return a.workedMinutes - b.workedMinutes;
    }
    return a.employee.name.localeCompare(b.employee.name);
  };
  primary.sort(byPriority);
  return primary;
}

//finished shifts
function buildShiftsFromAssignments(employees, assignmentsByDay, slotStartsByDay, slotSize) {
  const shifts = [];
  // merge back-to-back assigned slots into one bigger shift block per employee/day
  employees.forEach(employee => {
    allDays.forEach(dayName => {
      const slots = assignmentsByDay[dayName];
      const slotStarts = slotStartsByDay[dayName];
      let index = 0;
      while (index < slots.length) {
        while (index < slots.length && !slots[index].includes(employee.name)) {
          index += 1;
        }
        if (index >= slots.length) {
          break;
        }
        const segmentStartIndex = index;
        while (index < slots.length && slots[index].includes(employee.name)) {
          index += 1;
        }
        const segmentEndIndex = index - 1;
        const start = slotStarts[segmentStartIndex];
        const end = slotStarts[segmentEndIndex] + slotSize;
        shifts.push({
          shiftId: nextGeneratedShiftId,
          employeeName: employee.name,
          day: dayName,
          start,
          end,
          eventColor: employeeColorByName.get(employee.name)
        });
        nextGeneratedShiftId += 1;
      }
    });
  });
  return shifts;
}

//coverage summary
function buildCoverageSummary(requirements, assignmentsByDay, slotStartsByDay, slotSize) {
  // coverage is the minimum people covering any slot inside that template window
  return requirements.map(requirement => {
    const assignedNames = new Set();
    let minCovered = Number.POSITIVE_INFINITY;
    slotStartsByDay[requirement.day].forEach((slotStart, slotIndex) => {
      const slotEnd = slotStart + slotSize;
      if (slotStart >= requirement.start && slotEnd <= requirement.end) {
        const names = assignmentsByDay[requirement.day][slotIndex];
        names.forEach(name => assignedNames.add(name));
        minCovered = Math.min(minCovered, names.length);
      }
    });
    const coveredCount = Number.isFinite(minCovered) ? minCovered : 0;
    return {
      ...requirement,
      assignedNames: [...assignedNames].sort((a, b) => a.localeCompare(b)),
      coveredCount,
      isUnderstaffed: coveredCount < requirement.need
    };
  });
}

//employee shifts by day
function groupShiftsByEmployeeDay(shifts) {
  const grouped = new Map();
  shifts.forEach(shift => {
    const key = `${shift.employeeName}::${shift.day}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(shift);
  });
  grouped.forEach(list => {
    list.sort((a, b) => a.start - b.start);
  });
  return grouped;
}

//print page
function printWorkSchedule() {
  document.body.classList.add("print-calendar-only");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("print-calendar-only");
  }, 250);
}

//schedule layout
function renderSchedule() {
  const scheduleGrid = byId("scheduleGrid");
  if (!scheduleGrid) {
    return;
  }
  scheduleGrid.innerHTML = "";
  getElementById("staffingCoverage").hidden = true;
  getElementById("workTotals").hidden = true;
  if (!generatedEmployeeList.length) {
    return;
  }
  // hide weekend columns unless we actually scheduled weekend shifts
  const shiftsByEmployeeDay = groupShiftsByEmployeeDay(generatedShiftList);
  const hasSaturdayShift = generatedShiftList.some(shift => shift.day === "Sat");
  const hasSundayShift = generatedShiftList.some(shift => shift.day === "Sun");
  const visibleDays = allDays.filter(dayName => {
    if (dayName === "Sat") {
      return hasSaturdayShift;
    }
    if (dayName === "Sun") {
      return hasSundayShift;
    }
    return true;
  });
  if (!visibleDays.length) {
    return;
  }
  const minutesByEmployee = new Map();
  generatedShiftList.forEach(shift => {
    const minutes = Math.max(0, shift.end - shift.start);
    minutesByEmployee.set(shift.employeeName, (minutesByEmployee.get(shift.employeeName) || 0) + minutes);
  });
  const rules = parseGlobalRules();
  // timeline snaps to full hours so the grid labels look clean
  const windowStart = Number.isInteger(rules.businessStart) ? rules.businessStart : 9 * 60;
  const windowEnd = Number.isInteger(rules.businessEnd) ? rules.businessEnd : 21 * 60;
  const timelineStart = Math.floor(windowStart / 60) * 60;
  const timelineEnd = Math.ceil(windowEnd / 60) * 60;
  const timelineMinutes = Math.max(60, timelineEnd - timelineStart);
  const majorMarkerInterval = 180;
  const topBar = document.createElement("div");
  topBar.className = "work-roster-topbar";
  const titleWrap = document.createElement("div");
  titleWrap.className = "work-roster-title-wrap";
  titleWrap.innerHTML = "<h3>Staff Schedule</h3>";
  topBar.appendChild(titleWrap);
  const actions = document.createElement("div");
  actions.className = "work-roster-actions";
  const printButton = document.createElement("button");
  printButton.type = "button";
  printButton.className = "btn-main work-roster-btn work-link-btn";
  printButton.textContent = "Print Schedule";
  printButton.addEventListener("click", printWorkSchedule);
  const updateButton = document.createElement("button");
  updateButton.type = "button";
  updateButton.className = "btn-main work-roster-btn work-link-btn";
  updateButton.textContent = "Update";
  updateButton.addEventListener("click", generateWorkSchedule);
  actions.appendChild(printButton);
  actions.appendChild(updateButton);
  topBar.appendChild(actions);
  scheduleGrid.appendChild(topBar);
  const coverageByDay = {};
  allDays.forEach(dayName => {
    coverageByDay[dayName] = generatedCoverageList
      .filter(item => item.day === dayName)
      .sort((a, b) => a.start - b.start);
  });
  const staffingStrip = document.createElement("div");
  staffingStrip.className = "work-staffing-strip";
  staffingStrip.style.setProperty("--work-day-columns", String(visibleDays.length));
  const staffingInfo = document.createElement("div");
  staffingInfo.className = "work-staffing-info";
  staffingInfo.innerHTML = "<strong>STAFFING SUMMARY</strong><small>Coverage by day and shift window</small>";
  staffingStrip.appendChild(staffingInfo);
  visibleDays.forEach(dayName => {
    const dayCard = document.createElement("div");
    dayCard.className = "work-staffing-day-card";
    dayCard.innerHTML = `<h4>${dayName}</h4>`;
    coverageByDay[dayName].forEach(period => {
      const chip = document.createElement("div");
      chip.className = `work-staffing-chip${period.isUnderstaffed ? " understaffed" : ""}`;
      chip.innerHTML = `<span>${minutesToCompactHour(period.start)}-${minutesToCompactHour(period.end)}</span><strong>${period.coveredCount}/${period.need}</strong>`;
      dayCard.appendChild(chip);
    });
    if (!coverageByDay[dayName].length) {
      const chip = document.createElement("div");
      chip.className = "work-staffing-chip empty";
      chip.textContent = "No shifts";
      dayCard.appendChild(chip);
    }
    staffingStrip.appendChild(dayCard);
  });
  scheduleGrid.appendChild(staffingStrip);
  const table = document.createElement("div");
  table.className = "work-roster-grid";
  table.style.setProperty("--work-day-columns", String(visibleDays.length));
  const headerRow = document.createElement("div");
  headerRow.className = "work-roster-row work-roster-header";
  const corner = document.createElement("div");
  corner.className = "work-roster-cell employee-cell";
  corner.innerHTML = "<strong>Employee</strong><small>Hours</small>";
  headerRow.appendChild(corner);
  visibleDays.forEach(dayName => {
    const dayCell = document.createElement("div");
    dayCell.className = "work-roster-cell day-cell";
    const dayTitle = document.createElement("div");
    dayTitle.className = "work-day-title";
    dayTitle.textContent = dayName;
    dayCell.appendChild(dayTitle);
    const markerRow = document.createElement("div");
    markerRow.className = "work-day-major-markers";
    for (let minute = timelineStart; minute <= timelineEnd; minute += majorMarkerInterval) {
      const marker = document.createElement("span");
      marker.className = "work-day-major-label";
      marker.style.left = `${((minute - timelineStart) / timelineMinutes) * 100}%`;
      marker.textContent = minutesToCompactHour(minute);
      markerRow.appendChild(marker);
    }
    dayCell.appendChild(markerRow);
    headerRow.appendChild(dayCell);
  });
  table.appendChild(headerRow);
  generatedEmployeeList.forEach(employee => {
    const row = document.createElement("div");
    row.className = "work-roster-row";
    const nameCell = document.createElement("div");
    nameCell.className = "work-roster-cell employee-cell";
    const workedHours = (minutesByEmployee.get(employee.name) || 0) / 60;
    const maxHoursText = Number.isFinite(employee.maxWeeklyHours) ? employee.maxWeeklyHours : "?";
    nameCell.innerHTML = `
      <div class="work-employee-name-line">
        <span class="work-employee-dot" style="background:${employeeColorByName.get(employee.name)}"></span>
        <strong>${employee.name}</strong>
      </div>
      <small>${workedHours.toFixed(0)} / ${maxHoursText} hrs</small>
    `;
    row.appendChild(nameCell);
    visibleDays.forEach(dayName => {
      const cell = document.createElement("div");
      cell.className = "work-roster-cell schedule-cell";
      const key = `${employee.name}::${dayName}`;
      const shifts = shiftsByEmployeeDay.get(key) || [];
      const timeline = document.createElement("div");
      timeline.className = "work-cell-timeline";
      for (let minute = timelineStart; minute <= timelineEnd; minute += 60) {
        const line = document.createElement("div");
        line.className = "work-hour-line";
        line.style.left = `${((minute - timelineStart) / timelineMinutes) * 100}%`;
        timeline.appendChild(line);
      }
      if (!shifts.length) {
        const offLabel = document.createElement("span");
        offLabel.className = "work-off-label";
        offLabel.textContent = "—";
        timeline.appendChild(offLabel);
      } else {
        shifts.forEach(shift => {
          const clampedStart = Math.max(timelineStart, Math.min(timelineEnd, shift.start));
          const clampedEnd = Math.max(clampedStart, Math.min(timelineEnd, shift.end));
          const durationMinutes = Math.max(0, clampedEnd - clampedStart);
          if (durationMinutes <= 0) {
            return;
          }
          const leftPercent = ((clampedStart - timelineStart) / timelineMinutes) * 100;
          const widthPercent = (durationMinutes / timelineMinutes) * 100;
          const bar = document.createElement("button");
          bar.type = "button";
          bar.className = "work-shift-pill work-shift-bar";
          bar.style.background = shift.eventColor;
          bar.style.left = `${leftPercent}%`;
          bar.style.width = `${widthPercent}%`;
          if (widthPercent >= 20) {
            bar.textContent = `${minutesToHourAmPm(shift.start)} - ${minutesToHourAmPm(shift.end)}`;
          } else if (widthPercent >= 10) {
            bar.textContent = `${minutesToCompactHour(shift.start)}-${minutesToCompactHour(shift.end)}`;
          } else {
            bar.textContent = "";
          }
          bar.title = "";
          bar.disabled = true;
          timeline.appendChild(bar);
        });
      }
      cell.appendChild(timeline);
      row.appendChild(cell);
    });
    table.appendChild(row);
  });
  scheduleGrid.appendChild(table);
}

//final work schedule
function generateWorkSchedule() {
  const employees = getEmployeesForScheduling();
  const templates = parseShiftTemplateRows();
  const requirements = expandShiftTemplatesToRequirements(templates);
  const rules = parseGlobalRules();
  if (!employees.length) {
    setWorkMessage(genericInputMessage);
    return;
  }
  if (!templates.length) {
    setWorkMessage(genericInputMessage);
    return;
  }
  if (rules.businessStart === null || rules.businessEnd === null || rules.businessEnd <= rules.businessStart) {
    setWorkMessage(genericInputMessage);
    return;
  }
  if (!Number.isInteger(rules.slotSize) || rules.slotSize <= 0) {
    setWorkMessage(genericInputMessage);
    return;
  }
  // first pass: validate employee data + assign each person a color if needed
  let colorIndex = employeeColorByName.size;
  for (const employee of employees) {
    if (!employee.name) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!employee.selectedDays.length) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (employee.startMinutes === null || employee.endMinutes === null || employee.endMinutes <= employee.startMinutes) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!Number.isInteger(employee.preferredHours) || employee.preferredHours <= 0) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!Number.isInteger(employee.maxWeeklyHours) || employee.maxWeeklyHours <= 0) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (employee.maxWeeklyHours < employee.preferredHours) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!employeeColorByName.has(employee.name)) {
      employeeColorByName.set(employee.name, Colors[colorIndex % Colors.length]);
      colorIndex += 1;
    }
  }
  // second pass: validate every shift template before we start scheduling
  for (const template of templates) {
    if (!template.name) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!expandDayGroup(template.dayGroup).length) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (template.start === null || template.end === null || template.end <= template.start) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (!Number.isInteger(template.need) || template.need <= 0) {
      setWorkMessage(genericInputMessage);
      return;
    }
    if (template.start < rules.businessStart || template.end > rules.businessEnd) {
      setWorkMessage(genericInputMessage);
      return;
    }
  }
  // convert rules/templates into slot-by-slot staffing needs
  const minShiftSlots = Math.max(1, Math.ceil((rules.minShiftHours * 60) / rules.slotSize));
  const maxShiftSlots = Math.max(minShiftSlots, Math.floor((rules.maxShiftHours * 60) / rules.slotSize));
  const slotStartsByDay = createSlotStartsByDay(rules.businessStart, rules.businessEnd, rules.slotSize);
  const needByDay = createNeedGrid(slotStartsByDay);
  applyShiftTemplateNeeds(needByDay, requirements, slotStartsByDay, rules.slotSize);
  const assignmentsByDay = {};
  // main scheduling loop: for each slot, pick the best available people
  allDays.forEach(dayName => {
    assignmentsByDay[dayName] = slotStartsByDay[dayName].map(() => []);
  });
  const employeeMinutesWorked = new Map();
  employees.forEach(employee => {
    employeeMinutesWorked.set(employee.name, 0);
  });
  allDays.forEach(dayName => {
    const slotStarts = slotStartsByDay[dayName];
    slotStarts.forEach((slotStart, slotIndex) => {
      const need = needByDay[dayName][slotIndex];
      if (need <= 0) {
        return;
      }
      const rankedCandidates = selectShiftCandidatesForSlot({
        employees,
        dayName,
        slotIndex,
        slotStarts,
        needSlots: needByDay[dayName],
        slotSize: rules.slotSize,
        assignmentsByDay,
        employeeMinutesWorked,
        minShiftSlots,
        maxShiftSlots
      });
      rankedCandidates.slice(0, need).forEach(candidate => {
        assignmentsByDay[dayName][slotIndex].push(candidate.employee.name);
        employeeMinutesWorked.set(
          candidate.employee.name,
          (employeeMinutesWorked.get(candidate.employee.name) || 0) + rules.slotSize
        );
      });
    });
  });
  // after assignment, build final objects used by the UI
  generatedShiftList = buildShiftsFromAssignments(employees, assignmentsByDay, slotStartsByDay, rules.slotSize);
  generatedEmployeeList = employees;
  generatedCoverageList = buildCoverageSummary(requirements, assignmentsByDay, slotStartsByDay, rules.slotSize);
  const maxedOutCount = employees.filter(employee => {
    const workedMinutes = employeeMinutesWorked.get(employee.name) || 0;
    return workedMinutes >= (employee.maxWeeklyHours * 60);
  }).length;
  const understaffedCount = generatedCoverageList.filter(period => period.isUnderstaffed).length;
  if (understaffedCount > 0 && maxedOutCount > 0) {
     getElementById("workMessage").textContent = "Could not generate a full schedule.";
  } else if (understaffedCount > 0) {
     getElementById("workMessage").textContent = `Generated ${generatedShiftList.length} shift(s) with limited coverage.`;
  } else {
    getElementById("workMessage").textContent = `Generated ${generatedShiftList.length} shift(s) from shift templates.`;
  }
  renderSchedule();
}

const addEmployeeButton = getElementById("addEmployeeBtn");
if (addEmployeeButton) {
  addEmployeeButton.addEventListener("click", () => addEmployeeRow());
}

const addShiftTemplateButton = getElementById("addShiftTemplateBtn");
if (addShiftTemplateButton) {
  addShiftTemplateButton.addEventListener("click", () => addShiftTemplateRow());
}

const getScheduleButton = getElementById("getWorkScheduleBtn");
if (getScheduleButton) {
  getScheduleButton.addEventListener("click", generateWorkSchedule);
}

const testingButton = getElementById("workTestingEmployeesBtn");
if (testingButton) {
  testingButton.addEventListener("click", () => {
    generateEmployeeTestingData();
    generateShiftTestingData();
    const messageBox = getElementById("workMessage");
    if (messageBox) {
      messageBox.textContent = "Testing data loaded for employees and shift details.";
    }
  });
}

if (getElementById("employeeList")) {
  addEmployeeRow();
}

if (getElementById("shiftTemplateList")) {
  addShiftTemplateRow();
}

renderEmployeePreview();
renderSchedule();
