const welcomeCourseButton = document.getElementById("welcomeCourseBtn");
const welcomeWorkButton = document.getElementById("welcomeWorkBtn");

if (welcomeCourseButton) {
  welcomeCourseButton.addEventListener("click", () => {
    window.location.href = "../Course Scheduler/courseScheduler.html";
  });
}

if (welcomeWorkButton) {
  welcomeWorkButton.addEventListener("click", () => {
    window.location.href = "../Work Scheduler/Employee Details/WorkScheduler.html";
  });
}
