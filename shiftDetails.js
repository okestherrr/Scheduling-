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

//sets up the shift details page
function initShiftDetailsPage() {
  //goes back to employee details
  byId("editEmployeesBtn")?.addEventListener("click", () => {
    window.location.href = "./WorkScheduler.html";
  });

  //default business hours
  const businessStartInput = byId("workBusinessStart");
  const businessEndInput = byId("workBusinessEnd");

  if (businessStartInput && !businessStartInput.value) {
    businessStartInput.value = "09:00";
  }

  if (businessEndInput && !businessEndInput.value) {
    businessEndInput.value = "20:00";
  }

  //checks for saved employees
  const employees = loadSavedEmployees();
  const messageBox = byId("workMessage");

  if (!employees.length && messageBox) {
    messageBox.textContent = "No saved employees found. Add employees first.";
  }
}

//starts the shift details page
initShiftDetailsPage();