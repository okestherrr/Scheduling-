const allCalendarDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const presetEventColors = [
  "#F6A5A5", "#EF5350", "#F7B267", "#FB8C00", "#F7E588", "#FDD835",
  "#B8E986", "#7CB342", "#7ED7C1", "#26A69A", "#8AD2F4", "#1E88E5",
  "#B39DDB", "#5E35B1", "#D6A4EB", "#8E24AA", "#F8A6D1", "#D81B60"
];

let workEmployeeIdCounter = 1;
let nextShiftId = 1;
let generatedShifts = [];
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

function makeWorkDayChips(selectedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])) {
  return allCalendarDays.map(dayName => {
    const isSelected = selectedDays.has(dayName);
    return `<button type="button" class="work-day-chip${isSelected ? " active" : ""}" data-day="${dayName}">${dayName.slice(0, 1)}</button>`;
  }).join("");
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

function buildDayColumns(shifts) {
  const columns = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
  shifts.forEach(shift => {
    if (columns[shift.day]) {
      columns[shift.day].push(shift);
    }
  });
  allCalendarDays.forEach(dayName => {
    columns[dayName].sort((a, b) => a.start - b.start);
  });
  return columns;
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
    .map(([employeeName, minutes]) => {
      const hours = (minutes / 60).toFixed(2);
      return `<div class="work-totals-row"><strong>${employeeName}</strong><span>${hours} hrs</span></div>`;
    })
    .join("");

  totalsBox.innerHTML = `
    <h3>Total Hours by Employee</h3>
    <div class="work-totals-list">${summaryRows}</div>
  `;
  totalsBox.hidden = false;
}

function renderSchedule() {
  const scheduleGrid = byId("scheduleGrid");
  scheduleGrid.innerHTML = "";

  if (!generatedShifts.length) {
    renderTotals([]);
    return;
  }

  const columns = buildDayColumns(generatedShifts);
  const earliest = generatedShifts.reduce((min, item) => Math.min(min, item.start), 24 * 60);
  const latest = generatedShifts.reduce((max, item) => Math.max(max, item.end), 0);
  const firstMinute = Math.min(7 * 60, Math.floor(earliest / 60) * 60);
  const lastMinute = Math.max(18 * 60, Math.ceil(latest / 60) * 60);
  const pixelsPerMinute = 1.25;
  const totalHeight = Math.max(540, ((lastMinute - firstMinute) * pixelsPerMinute) + 20);

  const board = document.createElement("div");
  board.className = "calendar-board";

  const timeBox = document.createElement("div");
  timeBox.className = "calendar-times";
  timeBox.style.minHeight = `${totalHeight}px`;
  for (let minute = firstMinute; minute <= lastMinute; minute += 60) {
    const label = document.createElement("div");
    label.className = "calendar-time-label";
    label.style.top = `${(minute - firstMinute) * pixelsPerMinute}px`;
    label.textContent = minutesToClock(minute);
    timeBox.appendChild(label);
  }

  const daysArea = document.createElement("div");
  daysArea.className = "calendar-days-area";

  const toolbar = document.createElement("div");
  toolbar.className = "calendar-toolbar-row";
  toolbar.style.setProperty("--calendar-columns", String(allCalendarDays.length));
  allCalendarDays.forEach(dayName => {
    const header = document.createElement("div");
    header.className = "calendar-day-header";
    header.textContent = dayName;
    toolbar.appendChild(header);
  });

  const days = document.createElement("div");
  days.className = "calendar-days";
  days.style.setProperty("--calendar-columns", String(allCalendarDays.length));

  allCalendarDays.forEach(dayName => {
    const dayBox = document.createElement("section");
    dayBox.className = "calendar-day";

    const track = document.createElement("div");
    track.className = "calendar-day-track";
    track.style.height = `${totalHeight}px`;

    for (let minute = firstMinute; minute <= lastMinute; minute += 60) {
      const line = document.createElement("div");
      line.className = "calendar-hour-line is-hour";
      line.style.top = `${(minute - firstMinute) * pixelsPerMinute}px`;
      track.appendChild(line);
    }

    columns[dayName].forEach(shift => {
      const shiftCard = document.createElement("article");
      shiftCard.className = "calendar-class-card work-shift-card";
      shiftCard.style.top = `${(shift.start - firstMinute) * pixelsPerMinute}px`;
      shiftCard.style.height = `${Math.max(20, (shift.end - shift.start) * pixelsPerMinute)}px`;
      shiftCard.style.background = shift.eventColor;
      shiftCard.innerHTML = `
        <strong>${shift.employeeName}</strong>
        <small>${minutesToClock(shift.start)} - ${minutesToClock(shift.end)}</small>
      `;
      track.appendChild(shiftCard);
    });

    dayBox.appendChild(track);
    days.appendChild(dayBox);
  });

  daysArea.appendChild(toolbar);
  daysArea.appendChild(days);
  board.appendChild(timeBox);
  board.appendChild(daysArea);
  scheduleGrid.appendChild(board);

  renderTotals(generatedShifts);
}

function runWorkScheduleGeneration() {
  const employees = parseEmployeeRows();
  if (!employees.length) {
    byId("workMessage").textContent = "Add at least one employee.";
    return;
  }

  const generatedEvents = [];
  const dayNextStart = { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };
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

    if (!employeeColorMap.has(employee.name)) {
      employeeColorMap.set(employee.name, presetEventColors[colorIndex % presetEventColors.length]);
      colorIndex += 1;
    }
    const employeeColor = employeeColorMap.get(employee.name);

    const preferredMinutes = employee.preferredHours * 60;
    const perDayTarget = Math.max(60, Math.floor(preferredMinutes / employee.selectedDays.length));

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
        shiftId: nextShiftId,
        employeeName: employee.name,
        day: dayName,
        start: shiftStart,
        end: shiftEnd,
        eventColor: employeeColor
      });
      nextShiftId += 1;
      dayNextStart[dayName] = Math.min(employee.endMinutes, shiftEnd + 10);
    });
  }

  generatedShifts = generatedEvents;
  byId("workMessage").textContent = `Generated ${generatedEvents.length} shift(s).`;
  byId("requestMessage").textContent = "Work schedule ready.";
  renderSchedule();
}

byId("addEmployeeBtn").addEventListener("click", () => addEmployeeRow());
byId("getWorkScheduleBtn").addEventListener("click", runWorkScheduleGeneration);

addEmployeeRow();
renderSchedule();
