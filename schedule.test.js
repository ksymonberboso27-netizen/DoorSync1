const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const schedule = require("./schedule.js");
const seed = vm.runInNewContext(`${fs.readFileSync("data.js", "utf8")}\nDOORSYNC_SEED`);
const at = (time) => new Date(`2026-10-02T${time}+08:00`);
const rooms = [{ RoomID: "RM-201", CurrentStatus: "Locked" }];
const lesson = schedule.occurrences(seed.classSchedules, "PROF-001", at("07:00:00"))[0];

test("15-minute window includes opening but excludes class start", () => {
  for (const [time, allowed] of [["07:44:59", false], ["07:45:00", true], ["07:59:59", true], ["08:00:00", false], ["09:00:00", false]]) {
    assert.equal(schedule.eligibility(lesson, rooms, [], at(time)).allowed, allowed, time);
  }
});
test("schedule uses Manila dates and professor ownership", () => {
  assert.equal(lesson.date, "2026-10-02");
  assert.equal(lesson.start.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(schedule.occurrences(seed.classSchedules, "unknown", at("07:45:00")).length, 0);
  const saturday = schedule.occurrences(seed.classSchedules, "PROF-001", new Date("2026-10-02T16:00:00Z"));
  assert.equal(saturday[0].date, "2026-10-05");
});
test("pending, completed class requests and unlocked rooms cannot be requested", () => {
  const now = at("07:50:00");
  assert.equal(schedule.eligibility(lesson, [{ RoomID: "RM-201", CurrentStatus: "Unlocked" }], [], now).allowed, false);
  assert.equal(schedule.eligibility(lesson, rooms, [{ RoomID: "RM-201", Status: "Pending" }], now).allowed, false);
  assert.equal(schedule.eligibility(lesson, rooms, [{ ScheduleID: lesson.ScheduleID, ClassDate: lesson.date, Status: "Completed" }], now).allowed, false);
  assert.equal(schedule.eligibility(undefined, rooms, [], now).allowed, false);
});
test("sample schedules have valid references and no room or professor overlaps", () => {
  for (const item of seed.classSchedules) {
    assert.ok(seed.professors.some((p) => p.ProfessorID === item.ProfessorID));
    assert.ok(seed.rooms.some((r) => r.RoomID === item.RoomID));
    assert.ok(item.StartTime < item.EndTime);
    for (const other of seed.classSchedules) {
      if (item === other || !item.Days.some((day) => other.Days.includes(day))) continue;
      if (item.RoomID !== other.RoomID && item.ProfessorID !== other.ProfessorID) continue;
      assert.ok(item.EndTime <= other.StartTime || other.EndTime <= item.StartTime);
    }
  }
});

test("request handler enforces ownership and time, migrates saved data, and saves class linkage", () => {
  let current = at("07:45:00");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [current.getTime()])); }
    static now() { return current.getTime(); }
  }
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, { value: "", dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, setAttribute() {}, focus() {}, reset() {} });
    return nodes.get(key);
  };
  const oldState = JSON.parse(JSON.stringify(seed));
  delete oldState.classSchedules;
  oldState.unlockRequests = [];
  const storage = new Map([["doorsync-state-v1", JSON.stringify(oldState)],
    ["doorsync-session-v1", JSON.stringify({ role: "professor", userId: "PROF-001" })]]);
  const context = vm.createContext({ Date: Clock, Intl, structuredClone, setInterval() {},
    window: { clearTimeout() {}, setTimeout() {} },
    document: { querySelector: node, querySelectorAll: () => [] },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  });
  vm.runInContext(fs.readFileSync("data.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("schedule.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
  assert.equal(vm.runInContext("state.classSchedules.length", context), 6);
  const attempt = (key, time) => {
    current = at(time);
    node("#roomSelect").value = key;
    vm.runInContext("createUnlockRequest()", context);
    return vm.runInContext("state.unlockRequests.length", context);
  };
  assert.equal(attempt("SCH-001:2026-10-02", "07:44:59"), 0);
  assert.equal(attempt("SCH-003:2026-10-02", "09:45:00"), 0);
  assert.equal(attempt("SCH-001:2026-10-02", "08:00:00"), 0);
  assert.equal(attempt("SCH-001:2026-10-02", "07:45:00"), 1);
  assert.equal(attempt("SCH-001:2026-10-02", "07:46:00"), 1);
  const saved = JSON.parse(storage.get("doorsync-state-v1"));
  assert.equal(saved.unlockRequests[0].ScheduleID, "SCH-001");
  assert.equal(saved.unlockRequests[0].RoomID, "RM-201");
  assert.equal(saved.unlockRequests[0].ClassDate, "2026-10-02");
});
