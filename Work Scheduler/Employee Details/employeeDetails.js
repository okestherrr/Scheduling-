//employee storage and days
const WORK_EMPLOYEE_STORAGE_KEY = "workSchedulerEmployees";
const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let employeeRowIdCounter = 1;

//where we get element by id
function byId(id) {
  return document.getElementById(id);
}

//formats minutes for the time inputs
function minutesToTimeInput(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

//availability day buttons
function buildWorkDayChipButtons(selectedDays = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"])) {
  return allDays
    .map(day => {
      const active = selectedDays.has(day);
      return `<button type="button" class="work-day-chip${active ? " active" : ""}" data-day="${day}">${day.slice(0, 1)}</button>`;
    })
    .join("");
}

//employee input section
function addEmployeeRow(defaultData = {}) {
  const employeeList = byId("employeeList");
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
        <input id="${rowId}Start" class="work-start" type="time" step="60" value="${defaultData.start || ""}" />
      </label>
      <label class="calendar-options-field" for="${rowId}End">
        <span>Availability End</span>
        <input id="${rowId}End" class="work-end" type="time" step="60" value="${defaultData.end || ""}" />
      </label>
    </div>
    <div class="work-days-row">
      <span>Availability Days</span>
      <div class="work-day-chips">${buildWorkDayChipButtons(selectedDays)}</div>
      <button type="button" class="btn-main work-remove-btn">Remove</button>
    </div>
  `;

  //selecting availability days
  rowBox.querySelectorAll(".work-day-chip").forEach(dayButton => {
    dayButton.addEventListener("click", () => {
      dayButton.classList.toggle("active");
    });
  });

  //removes employee
  rowBox.querySelector(".work-remove-btn").addEventListener("click", () => {
    rowBox.remove();
  });

  employeeList.appendChild(rowBox);
}

//employee information from the inputs
function parseEmployeeRows() {
  const rows = [...document.querySelectorAll(".work-employee-row")];

  return rows.map(row => {
    const days = [...row.querySelectorAll(".work-day-chip.active")]
      .map(button => button.dataset.day);

    return {
      name: row.querySelector(".work-name").value.trim(),
      preferredHours: Number.parseInt(row.querySelector(".work-hours").value, 10),
      maxWeeklyHours: Number.parseInt(row.querySelector(".work-max-hours").value, 10),
      start: row.querySelector(".work-start").value,
      end: row.querySelector(".work-end").value,
      days
    };
  });
}

//message shown to the user
function showMessage(text) {
  const messageBox = byId("employeeMessage");

  if (messageBox) {
    messageBox.textContent = text;
  }
}

//checks and saves employee information
function saveEmployeesToStorage() {
  const employees = parseEmployeeRows();

  if (!employees.length) {
    showMessage("Add at least one employee before continuing.");
    return false;
  }

  //checks each employee input
  for (const employee of employees) {
    if (!employee.name) {
      showMessage("Each employee needs a name.");
      return false;
    }

    if (!employee.days.length) {
      showMessage(`Choose at least one day for ${employee.name}.`);
      return false;
    }

    if (!Number.isInteger(employee.preferredHours) || employee.preferredHours <= 0) {
      showMessage(`Enter preferred weekly hours for ${employee.name}.`);
      return false;
    }

    if (!Number.isInteger(employee.maxWeeklyHours) || employee.maxWeeklyHours <= 0) {
      showMessage(`Enter max weekly hours for ${employee.name}.`);
      return false;
    }

    if (employee.maxWeeklyHours < employee.preferredHours) {
      showMessage(`Max weekly hours must be >= preferred hours for ${employee.name}.`);
      return false;
    }

    if (!employee.start || !employee.end || employee.end <= employee.start) {
      showMessage(`Enter valid start/end availability for ${employee.name}.`);
      return false;
    }
  }

  //saves employees in the browser
  try {
    window.localStorage.setItem(
      WORK_EMPLOYEE_STORAGE_KEY,
      JSON.stringify(employees)
    );

    showMessage("Employees saved. Opening Shift Details...");
    return true;
  } catch (_error) {
    showMessage("Could not save employees in this browser.");
    return false;
  }
}

//saved employee information
function loadEmployeesFromStorage() {
  try {
    const raw = window.localStorage.getItem(WORK_EMPLOYEE_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

//clears all employee rows
function clearEmployeeRows() {
  const employeeList = byId("employeeList");

  if (employeeList) {
    employeeList.innerHTML = "";
  }
}

//random number between the two values
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

//random employee names without repeats
function sampleUniqueNames(count) {
  const firstNames = [
    "Ava", "Noah", "Mia", "Ethan", "Liam", "Emma", "Olivia",
    "Mason", "Elijah", "Sophia", "Amelia", "Lucas", "Harper",
    "James", "Isla", "Daniel", "Levi", "Grace", "Nora", "Logan"
  ];

  const lastNames = [
    "Bennett", "Carter", "Diaz", "Foster", "Green", "Hayes",
    "Irwin", "Jordan", "Khan", "Lopez", "Morris", "Nguyen",
    "Owens", "Patel", "Quinn", "Reed", "Sanchez", "Turner",
    "Vasquez", "Walker"
  ];

  const used = new Set();
  const names = [];

  while (names.length < count) {
    const full = `${firstNames[randomInt(0, firstNames.length - 1)]} ${lastNames[randomInt(0, lastNames.length - 1)]}`;

    if (used.has(full)) {
      continue;
    }

    used.add(full);
    names.push(full);
  }

  return names;
}

//puts in random employee testing information
function generateEmployeeTestingData() {
  const employeeCount = randomInt(6, 10);
  const names = sampleUniqueNames(employeeCount);

  clearEmployeeRows();

  names.forEach((name, index) => {
    const preferredHours = randomInt(18, 34);
    const maxWeeklyHours = randomInt(
      preferredHours,
      Math.min(40, preferredHours + 10)
    );

    const startHourOptions = [8, 9, 10, 11, 12];
    const startHour = startHourOptions[
      randomInt(0, startHourOptions.length - 1)
    ];

    const shiftSpanHours = randomInt(6, 10);
    const endHour = Math.min(23, startHour + shiftSpanHours);

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    //some employees can work weekends
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

  showMessage("Testing data loaded for employees.");
}

//employee page buttons and saved information
function initEmployeePage() {
  const savedEmployees = loadEmployeesFromStorage();

  if (savedEmployees.length) {
    savedEmployees.forEach(employee => addEmployeeRow(employee));
  } else {
    addEmployeeRow();
  }

  byId("addEmployeeBtn")?.addEventListener("click", () => {
    addEmployeeRow();
  });

  byId("employeeTestingBtn")?.addEventListener(
    "click",
    generateEmployeeTestingData
  );

  byId("goToShiftDetailsBtn")?.addEventListener("click", () => {
    const saved = saveEmployeesToStorage();

    if (saved) {
      window.location.href = "../Shift Details/ShiftDetails.html";
    }
  });
}

//runs the employee page
initEmployeePage();