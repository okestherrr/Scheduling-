const welcomeCourseButton = document.getElementById("welcomeCourseBtn");
const welcomeWorkButton = document.getElementById("welcomeWorkBtn");

function bindRedirect(buttonBox, nextPath) {
  if (!buttonBox) {
    return;
  }
  buttonBox.addEventListener("click", () => {
    window.location.href = nextPath;
  });
}

bindRedirect(welcomeCourseButton, "../Course Scheduler/courseScheduler.html");
bindRedirect(welcomeWorkButton, "../Work Scheduler/Employee Details/WorkScheduler.html");
