const WORK_EMPLOYEE_STORAGE_KEY = "workSchedulerEmployees";

//shortcut for getting elements by id
function byId(id) {
  return document.getElementById(id);
}

//saved employee information
function loadSavedEmployees() {
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

//sets a default time when an input is empty
function setDefaultTime(inputBox, defaultValue) {
  if (inputBox && !inputBox.value) {
    inputBox.value = defaultValue;
  }
}

//sets up the shift details page
function initShiftDetailsPage() {
  //goes back to employee details
  byId("editEmployeesBtn")?.addEventListener("click", () => {
    window.location.href = "../Employee Details/WorkScheduler.html";
  });
  //default business hours
  const businessStartInput = byId("workBusinessStart");
  const businessEndInput = byId("workBusinessEnd");
  setDefaultTime(businessStartInput, "09:00");
  setDefaultTime(businessEndInput, "20:00");
  //checks for saved employees
  const employees = loadSavedEmployees();
  const messageBox = byId("workMessage");
  if (!employees.length && messageBox) {
    messageBox.textContent = "No saved employees found. Add employees first.";
  }
}

//starts the shift details page
initShiftDetailsPage();