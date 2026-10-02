const DoorSyncSchedule = (() => {
  const timeZone = "Asia/Manila";
  const dayMs = 86400000;

  function occurrences(schedules, professorId, now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).map(({ type, value }) => [type, value]));
    const midnight = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`);
    const result = [];
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = new Date(midnight.getTime() + offset * dayMs);
      // Use a UTC-shifted calendar date so the device timezone cannot change the weekday.
      const calendarDay = new Date(day.getTime() + 8 * 3600000);
      const date = calendarDay.toISOString().slice(0, 10);
      for (const schedule of schedules) {
        if (schedule.ProfessorID !== professorId || !schedule.Days.includes(calendarDay.getUTCDay())) continue;
        const start = new Date(`${date}T${schedule.StartTime}:00+08:00`);
        const end = new Date(`${date}T${schedule.EndTime}:00+08:00`);
        result.push({ ...schedule, key: `${schedule.ScheduleID}:${date}`, date, start, end,
          opens: new Date(start.getTime() - 15 * 60000) });
      }
    }
    return result.sort((a, b) => a.start - b.start);
  }

  function eligibility(lesson, rooms, requests, now = new Date()) {
    if (!lesson || now < lesson.opens || now >= lesson.start) {
      return { allowed: false, reason: "Outside request window" };
    }
    const room = rooms.find((item) => item.RoomID === lesson.RoomID);
    if (!room) return { allowed: false, reason: "Room unavailable" };
    if (room.CurrentStatus === "Unlocked") return { allowed: false, reason: "Room already unlocked" };
    if (requests.some((request) => request.RoomID === lesson.RoomID && request.Status === "Pending")) {
      return { allowed: false, reason: "Request pending" };
    }
    if (requests.some((request) => request.ScheduleID === lesson.ScheduleID && request.ClassDate === lesson.date)) {
      return { allowed: false, reason: "Request already submitted" };
    }
    return { allowed: true, reason: "Request window open" };
  }

  function clock(date) {
    return new Intl.DateTimeFormat("en-PH", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  }

  function day(date) {
    return new Intl.DateTimeFormat("en-PH", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(date);
  }

  return { occurrences, eligibility, clock, day };
})();

if (typeof module !== "undefined") module.exports = DoorSyncSchedule;
