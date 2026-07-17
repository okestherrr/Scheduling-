const allCalendarDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const presetEventColors = [
  "#F6A5A5", "#EF5350", "#F7B267", "#FB8C00", "#F7E588", "#FDD835",
  "#B8E986", "#7CB342", "#7ED7C1", "#26A69A", "#8AD2F4", "#1E88E5",
  "#B39DDB", "#5E35B1", "#D6A4EB", "#8E24AA", "#F8A6D1", "#D81B60"
];

const dayGroupOptions = [
  { value: "Mon", label: "Monday" },
  { value: "Tue", label: "Tuesday" },
  { value: "Wed", label: "Wednesday" },
  { value: "Thu", label: "Thursday" },
  { value: "Fri", label: "Friday" },
  { value: "Sat", label: "Saturday" },
  { value: "Sun", label: "Sunday" },
  { value: "Weekdays", label: "Weekdays (Mon-Fri)" },
  { value: "Weekend", label: "Weekend (Sat-Sun)" }
];

let workEmployeeIdCounter = 1;
let shiftTemplateIdCounter = 1;
let nextShiftId = 1;
let generatedShifts = [];
let generatedEmployees = [];
let generatedCoverage = [];
const employeeColorMap = new Map();

function byId(id) {
  return document.getElementById(id);
}

function minutesToClock(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hour24 = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

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

function minutesToTimeInput(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

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

function makeWorkDayChips(selectedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])) {
  return allCalendarDays.map(dayName => {
    const isSelected = selectedDays.has(dayName);
    return `<button type="button" class="work-day-chip${isSelected ? " active" : ""}" data-day="${dayName}">${dayName.slice(0, 1)}</button>`;
  }).join("");
}

function setWorkStep(stepName) {
  const employeeStep = byId("workEmployeeStep");
  const templateStep = byId("workTemplateStep");
  const employeeTab = byId("workStepEmployeesBtn");
  const templateTab = byId("workStepTemplatesBtn");
  const isEmployeeStep = stepName === "employees";

  employeeStep.hidden = !isEmployeeStep;
  templateStep.hidden = isEmployeeStep;
  employeeTab.classList.toggle("active", isEmployeeStep);
  templateTab.classList.toggle("active", !isEmployeeStep);
}

function clearEmployeeRows() {
  byId("employeeList").innerHTML = "";
}

function clearShiftTemplateRows() {
  byId("shiftTemplateList").innerHTML = "";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

function generateEmployeeTestingData() {
  const employeeCount = randomInt(6, 10);
  const names = sampleUniqueNames(employeeCount);
  clearEmployeeRows();

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

    addEmployeeRow({
      name,
      preferredHours,
      maxWeeklyHours,
      start: minutesToTimeInput(startHour * 60),
      end: minutesToTimeInput(endHour * 60),
      days
    });
  });

  byId("workMessage").textContent = "Testing data loaded for employees.";
}

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

  byId("workBusinessStart").value = "09:00";
  byId("workBusinessEnd").value = hasWeekendCoverage ? "21:00" : "20:00";
  byId("workMessage").textContent = "Testing data loaded for shift details.";
}

function addEmployeeRow(defaultData = {}) {
  const employeeList = byId("employeeList");
  const rowId = `workEmployee${workEmployeeIdCounter}`;
  workEmployeeIdCounter += 1;

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
      <div class="work-day-chips">${makeWorkDayChips(selectedDays)}</div>
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

function parseEmployeeRows() {
  const rows = [...document.querySelectorAll(".work-employee-row")];
  return rows.map(rowBox => {
    const name = rowBox.querySelector(".work-name").value.trim();
    const preferredHours = Number.parseInt(rowBox.querySelector(".work-hours").value, 10);
    const maxWeeklyHours = Number.parseInt(rowBox.querySelector(".work-max-hours").value, 10);
    const startMinutes = parseTimeInputToMinutes(rowBox.querySelector(".work-start").value);
    const endMinutes = parseTimeInputToMinutes(rowBox.querySelector(".work-end").value);
    const selectedDays = [...rowBox.querySelectorAll(".work-day-chip.active")].map(button => button.dataset.day);

    return {
      name,
      preferredHours,
      maxWeeklyHours,
      startMinutes,
      endMinutes,
      selectedDays
    };
  });
}

function addShiftTemplateRow(defaultData = {}) {
  const list = byId("shiftTemplateList");
  const rowId = `shiftTemplate${shiftTemplateIdCounter}`;
  shiftTemplateIdCounter += 1;

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
        ${dayGroupOptions.map(option => `<option value="${option.value}"${defaultData.dayGroup === option.value ? " selected" : ""}>${option.label}</option>`).join("")}
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

function parseShiftTemplateRows() {
  const rows = [...document.querySelectorAll(".shift-template-row")];
  return rows.map(row => ({
    name: row.querySelector(".template-name").value.trim(),
    dayGroup: row.querySelector(".template-day-group").value,
    start: parseTimeInputToMinutes(row.querySelector(".template-start").value),
    end: parseTimeInputToMinutes(row.querySelector(".template-end").value),
    need: Number.parseInt(row.querySelector(".template-need").value, 10)
  }));
}

function expandDayGroup(dayGroup) {
  if (dayGroup === "Weekdays") {
    return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  }
  if (dayGroup === "Weekend") {
    return ["Sat", "Sun"];
  }
  if (allCalendarDays.includes(dayGroup)) {
    return [dayGroup];
  }
  return [];
}

function expandShiftTemplatesToRequirements(templates) {
  const requirements = [];
  templates.forEach(template => {
    const days = expandDayGroup(template.dayGroup);
    days.forEach(day => {
      requirements.push({
        templateName: template.name,
        dayGroup: template.dayGroup,
        day,
        start: template.start,
        end: template.end,
        need: template.need
      });
    });
  });
  return requirements;
}

function parseGlobalRules() {
  const businessStart = parseTimeInputToMinutes(byId("workBusinessStart").value);
  const businessEnd = parseTimeInputToMinutes(byId("workBusinessEnd").value);
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

function initializeNeedByDay(slotStartsByDay) {
  const needByDay = {};
  allCalendarDays.forEach(dayName => {
    needByDay[dayName] = slotStartsByDay[dayName].map(() => 0);
  });
  return needByDay;
}

function buildSlotStartsByDay(businessStart, businessEnd, slotSize) {
  const slotStartsByDay = {};
  allCalendarDays.forEach(dayName => {
    slotStartsByDay[dayName] = [];
    for (let minute = businessStart; minute + slotSize <= businessEnd; minute += slotSize) {
      slotStartsByDay[dayName].push(minute);
    }
  });
  return slotStartsByDay;
}

function applyStaffingNeeds(needByDay, requirements, slotStartsByDay, slotSize) {
  requirements.forEach(requirement => {
    const slots = needByDay[requirement.day];
    const starts = slotStartsByDay[requirement.day];
    if (!slots || !starts) {
      return;
    }

    starts.forEach((slotStart, slotIndex) => {
      const slotEnd = slotStart + slotSize;
      if (slotStart >= requirement.start && slotEnd <= requirement.end) {
        slots[slotIndex] = Math.max(slots[slotIndex], requirement.need);
      }
    });
  });
}

function isEmployeeAvailableForSlot(employee, dayName, slotStart, slotEnd) {
  if (!employee.selectedDays.includes(dayName)) {
    return false;
  }
  return slotStart >= employee.startMinutes && slotEnd <= employee.endMinutes;
}

function employeeAssignedInSlot(assignmentsByDay, dayName, slotIndex, employeeName) {
  return assignmentsByDay[dayName][slotIndex].includes(employeeName);
}

function countTrailingAssignedSlots(assignmentsByDay, dayName, slotIndex, employeeName) {
  let streak = 0;
  for (let index = slotIndex - 1; index >= 0; index -= 1) {
    if (!employeeAssignedInSlot(assignmentsByDay, dayName, index, employeeName)) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function hasAssignedEarlierSlot(assignmentsByDay, dayName, slotIndex, employeeName) {
  for (let index = 0; index < slotIndex; index += 1) {
    if (employeeAssignedInSlot(assignmentsByDay, dayName, index, employeeName)) {
      return true;
    }
  }
  return false;
}

function countFutureAvailableSlots(employee, dayName, slotStarts, fromIndex, slotSize, maxSlots) {
  let count = 0;
  for (let index = fromIndex; index < slotStarts.length && count < maxSlots; index += 1) {
    const slotStart = slotStarts[index];
    const slotEnd = slotStart + slotSize;
    if (!isEmployeeAvailableForSlot(employee, dayName, slotStart, slotEnd)) {
      break;
    }
    count += 1;
  }
  return count;
}

function countFutureNeededSlots(needSlots, fromIndex, maxSlots) {
  let count = 0;
  for (let index = fromIndex; index < needSlots.length && count < maxSlots; index += 1) {
    if ((needSlots[index] || 0) <= 0) {
      break;
    }
    count += 1;
  }
  return count;
}

function selectCandidatesForSlot({
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

  employees.forEach(employee => {
    if (!isEmployeeAvailableForSlot(employee, dayName, slotStart, slotEnd)) {
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

function buildShiftsFromAssignments(employees, assignmentsByDay, slotStartsByDay, slotSize) {
  const shifts = [];

  employees.forEach(employee => {
    allCalendarDays.forEach(dayName => {
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
          shiftId: nextShiftId,
          employeeName: employee.name,
          day: dayName,
          start,
          end,
          eventColor: employeeColorMap.get(employee.name)
        });
        nextShiftId += 1;
      }
    });
  });

  return shifts;
}

function buildCoverageSummary(requirements, assignmentsByDay, slotStartsByDay, slotSize) {
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

function renderTotals(shifts) {
  const totalsBox = byId("workTotals");
  if (!shifts.length) {
    totalsBox.hidden = true;
    totalsBox.innerHTML = "";
    return;
  }

  const minutesByEmployee = new Map();
  shifts.forEach(shift => {
    const minutes = Math.max(0, shift.end - shift.start);
    minutesByEmployee.set(shift.employeeName, (minutesByEmployee.get(shift.employeeName) || 0) + minutes);
  });

  const summaryRows = [...minutesByEmployee.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([employeeName, minutes]) => `<div class="work-totals-row"><strong>${employeeName}</strong><span>${(minutes / 60).toFixed(2)} hrs</span></div>`)
    .join("");

  totalsBox.innerHTML = `
    <h3>Total Hours by Employee</h3>
    <div class="work-totals-list">${summaryRows}</div>
  `;
  totalsBox.hidden = false;
}

function renderCoverage(coverageRows) {
  const coverageBox = byId("staffingCoverage");
  if (!coverageRows.length) {
    coverageBox.hidden = true;
    coverageBox.innerHTML = "";
    return;
  }

  const rowsMarkup = coverageRows.map(period => {
    const assigned = period.assignedNames.length ? period.assignedNames.join(", ") : "No one assigned";
    return `
      <div class="work-coverage-row${period.isUnderstaffed ? " understaffed" : ""}">
        <div class="work-coverage-heading">
          <strong>${period.templateName || "Shift"} - ${period.day} ${minutesToClock(period.start)} - ${minutesToClock(period.end)}</strong>
          <span>Need ${period.need} | Covered ${period.coveredCount}</span>
        </div>
        <div class="work-coverage-assigned">Assigned: ${assigned}</div>
      </div>
    `;
  }).join("");

  coverageBox.innerHTML = `
    <h3>Coverage by Shift Template</h3>
    <div class="work-coverage-list">${rowsMarkup}</div>
  `;
  coverageBox.hidden = false;
}

function getShiftBreaks(shift) {
  const duration = Math.max(0, shift.end - shift.start);
  if (duration >= 8 * 60) {
    const lunchStart = Math.max(shift.start, Math.min(shift.end - 30, shift.start + Math.floor(duration / 2) - 15));
    return [{ start: lunchStart, end: lunchStart + 30, type: "lunch" }];
  }
  if (duration >= 4 * 60) {
    const breakStart = Math.max(shift.start, Math.min(shift.end - 15, shift.start + Math.floor(duration / 2) - 7));
    return [{ start: breakStart, end: breakStart + 15, type: "short-break" }];
  }
  return [];
}

function printWorkSchedule() {
  document.body.classList.add("print-calendar-only");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("print-calendar-only");
  }, 250);
}

function renderSchedule() {
  const scheduleGrid = byId("scheduleGrid");
  scheduleGrid.innerHTML = "";
  byId("staffingCoverage").hidden = true;
  byId("workTotals").hidden = true;

  if (!generatedEmployees.length) {
    return;
  }

  const shiftsByEmployeeDay = groupShiftsByEmployeeDay(generatedShifts);
  const hasSaturdayShift = generatedShifts.some(shift => shift.day === "Sat");
  const hasSundayShift = generatedShifts.some(shift => shift.day === "Sun");
  const visibleDays = allCalendarDays.filter(dayName => {
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
  generatedShifts.forEach(shift => {
    const minutes = Math.max(0, shift.end - shift.start);
    minutesByEmployee.set(shift.employeeName, (minutesByEmployee.get(shift.employeeName) || 0) + minutes);
  });

  const rules = parseGlobalRules();
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
  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "btn-main work-roster-btn work-link-btn";
  printBtn.textContent = "Print Schedule";
  printBtn.addEventListener("click", printWorkSchedule);
  const updateBtn = document.createElement("button");
  updateBtn.type = "button";
  updateBtn.className = "btn-main work-roster-btn work-link-btn";
  updateBtn.textContent = "Update";
  updateBtn.addEventListener("click", runWorkScheduleGeneration);
  actions.appendChild(printBtn);
  actions.appendChild(updateBtn);
  topBar.appendChild(actions);
  scheduleGrid.appendChild(topBar);

  const coverageByDay = {};
  allCalendarDays.forEach(dayName => {
    coverageByDay[dayName] = generatedCoverage
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

  generatedEmployees.forEach(employee => {
    const row = document.createElement("div");
    row.className = "work-roster-row";

    const nameCell = document.createElement("div");
    nameCell.className = "work-roster-cell employee-cell";
    const workedHours = (minutesByEmployee.get(employee.name) || 0) / 60;
    const maxHoursText = Number.isFinite(employee.maxWeeklyHours) ? employee.maxWeeklyHours : "?";
    nameCell.innerHTML = `
      <div class="work-employee-name-line">
        <span class="work-employee-dot" style="background:${employeeColorMap.get(employee.name)}"></span>
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

function runWorkScheduleGeneration() {
  const employees = parseEmployeeRows();
  const templates = parseShiftTemplateRows();
  const requirements = expandShiftTemplatesToRequirements(templates);
  const rules = parseGlobalRules();

  if (!employees.length) {
    byId("workMessage").textContent = "Add at least one employee.";
    return;
  }

  if (!templates.length) {
    byId("workMessage").textContent = "Add at least one shift template.";
    return;
  }

  if (rules.businessStart === null || rules.businessEnd === null || rules.businessEnd <= rules.businessStart) {
    byId("workMessage").textContent = "Enter valid business open/close hours.";
    return;
  }

  if (!Number.isInteger(rules.slotSize) || rules.slotSize <= 0) {
    byId("workMessage").textContent = "Enter a valid slot size.";
    return;
  }

  let colorIndex = employeeColorMap.size;
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
    if (!Number.isInteger(employee.maxWeeklyHours) || employee.maxWeeklyHours <= 0) {
      byId("workMessage").textContent = `Enter max weekly hours for ${employee.name}.`;
      return;
    }
    if (employee.maxWeeklyHours < employee.preferredHours) {
      byId("workMessage").textContent = "max hours can't be less than perferred hours";
      return;
    }

    if (!employeeColorMap.has(employee.name)) {
      employeeColorMap.set(employee.name, presetEventColors[colorIndex % presetEventColors.length]);
      colorIndex += 1;
    }
  }

  for (const template of templates) {
    if (!template.name) {
      byId("workMessage").textContent = "Each shift template needs a name.";
      return;
    }
    if (!expandDayGroup(template.dayGroup).length) {
      byId("workMessage").textContent = `Choose a valid day/day group for ${template.name}.`;
      return;
    }
    if (template.start === null || template.end === null || template.end <= template.start) {
      byId("workMessage").textContent = `Enter valid times for ${template.name}.`;
      return;
    }
    if (!Number.isInteger(template.need) || template.need <= 0) {
      byId("workMessage").textContent = `Enter valid employees needed for ${template.name}.`;
      return;
    }
    if (template.start < rules.businessStart || template.end > rules.businessEnd) {
      byId("workMessage").textContent = `${template.name} must be inside business open/close hours.`;
      return;
    }
  }

  const minShiftSlots = Math.max(1, Math.ceil((rules.minShiftHours * 60) / rules.slotSize));
  const maxShiftSlots = Math.max(minShiftSlots, Math.floor((rules.maxShiftHours * 60) / rules.slotSize));
  const slotStartsByDay = buildSlotStartsByDay(rules.businessStart, rules.businessEnd, rules.slotSize);
  const needByDay = initializeNeedByDay(slotStartsByDay);
  applyStaffingNeeds(needByDay, requirements, slotStartsByDay, rules.slotSize);

  const assignmentsByDay = {};
  allCalendarDays.forEach(dayName => {
    assignmentsByDay[dayName] = slotStartsByDay[dayName].map(() => []);
  });

  const employeeMinutesWorked = new Map();
  employees.forEach(employee => {
    employeeMinutesWorked.set(employee.name, 0);
  });

  allCalendarDays.forEach(dayName => {
    const slotStarts = slotStartsByDay[dayName];
    slotStarts.forEach((slotStart, slotIndex) => {
      const need = needByDay[dayName][slotIndex];
      if (need <= 0) {
        return;
      }

      const rankedCandidates = selectCandidatesForSlot({
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

  generatedShifts = buildShiftsFromAssignments(employees, assignmentsByDay, slotStartsByDay, rules.slotSize);
  generatedEmployees = employees;
  generatedCoverage = buildCoverageSummary(requirements, assignmentsByDay, slotStartsByDay, rules.slotSize);

  const maxedOutCount = employees.filter(employee => {
    const workedMinutes = employeeMinutesWorked.get(employee.name) || 0;
    return workedMinutes >= (employee.maxWeeklyHours * 60);
  }).length;

  const understaffedCount = generatedCoverage.filter(period => period.isUnderstaffed).length;
  if (understaffedCount > 0 && maxedOutCount > 0) {
    byId("workMessage").textContent = "schedule can't be filled completely because not enough people are working, and their hrs have been maxed";
  } else if (understaffedCount > 0) {
    byId("workMessage").textContent = `Generated ${generatedShifts.length} shift(s). ${understaffedCount} template period(s) are understaffed (long-shift rules prevent tiny filler shifts).`;
  } else {
    byId("workMessage").textContent = `Generated ${generatedShifts.length} shift(s) from shift templates.`;
  }
  renderSchedule();
}

byId("addEmployeeBtn").addEventListener("click", () => addEmployeeRow());
byId("getWorkScheduleBtn").addEventListener("click", runWorkScheduleGeneration);
byId("workTestingEmployeesBtn").addEventListener("click", () => {
  generateEmployeeTestingData();
  generateShiftTestingData();
  byId("workMessage").textContent = "Testing data loaded for employees and shift details.";
});

byId("workNextBtn").addEventListener("click", () => {
  if (!document.querySelectorAll(".work-employee-row").length) {
    byId("workMessage").textContent = "Add at least one employee before continuing.";
    return;
  }
  byId("workMessage").textContent = "Now add shift templates and generate your schedule.";
  setWorkStep("templates");
});

byId("workStepEmployeesBtn").addEventListener("click", () => {
  setWorkStep("employees");
});

byId("workStepTemplatesBtn").addEventListener("click", () => {
  setWorkStep("templates");
});

addEmployeeRow();

addShiftTemplateRow();

setWorkStep("employees");
renderSchedule();
