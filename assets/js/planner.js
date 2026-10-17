'use strict';
// サイトの一番上のフォルダ（このファイルは assets/js/ にある）。GitHub Pages の /リポジトリ名/ の下でも動くように、相対で求める
var SITE_ROOT = new URL('../../', (document.currentScript && document.currentScript.src) || window.location.href);

document.addEventListener('DOMContentLoaded', () => {
  initPlanner().catch(showLoadError);
});

async function initPlanner() {
  const [metadata, courses] = await Promise.all([
        fetchJson(new URL('data/modules.json', SITE_ROOT).href),
        fetchJson(new URL('data/courses.json', SITE_ROOT).href),
      ]);
      const bootstrap = { ...metadata, courses };
      const moduleOrder = bootstrap.modules.map((module) => module.code);
      const moduleMap = new Map(bootstrap.modules.map((module) => [module.code, module.name]));
      const moduleByCode = new Map(bootstrap.modules.map((module) => [module.code, module]));
      const moduleGroups = normalizeModuleGroups(bootstrap);
      const moduleGroupMap = new Map();
      moduleGroups.forEach((group) => {
        group.modules.forEach((moduleCode) => {
          moduleGroupMap.set(moduleCode, { code: group.code, name: group.name });
        });
      });
      const collator = new Intl.Collator("ja");
      const initialCompletedNames = new Set(
        bootstrap.courses.filter((course) => course.completed).map((course) => course.name)
      );
      const shareMap = buildShareMap(bootstrap.courses);
      const sharedState = readSharedStateFromUrl();
  
      const state = {
        modules: sharedState.modules,
        semester: sharedState.semester,
        year: sharedState.year,
        completedNames: sharedState.completedNames,
        completedSearch: "",
      };
  
      let lastPlan = null;
  
      const elements = {};
  
      function init() {
        cacheElements();
        renderModules();
        renderCompletedList();
        renderFacultyInfo();
        bindEvents();
        syncControls();
        updatePlan();
      }
  
      function cacheElements() {
        elements.moduleList = document.getElementById("moduleList");
        elements.toggleAllModules = document.getElementById("toggleAllModules");
        elements.completedList = document.getElementById("completedList");
        elements.completedSearch = document.getElementById("completedSearch");
        elements.clearCompleted = document.getElementById("clearCompleted");
        elements.resetButton = document.getElementById("resetButton");
        elements.copyButton = document.getElementById("copyButton");
        elements.printButton = document.getElementById("printButton");
        elements.scheduleTable = document.getElementById("scheduleTable");
        elements.summaryGrid = document.getElementById("summaryGrid");
        elements.resultBody = document.getElementById("resultBody");
        elements.alertList = document.getElementById("alertList");
        elements.totalCredits = document.getElementById("totalCredits");
        elements.headerTotal = document.getElementById("headerTotal");
        elements.headerCourses = document.getElementById("headerCourses");
        elements.slotCount = document.getElementById("slotCount");
        elements.conflictCount = document.getElementById("conflictCount");
        elements.facultyInfo = document.getElementById("facultyInfo");
      }
  
      function bindEvents() {
        elements.moduleList.addEventListener("change", (event) => {
          const checkbox = event.target.closest("input[type='checkbox']");
          if (!checkbox) return;
  
          if (checkbox.checked) {
            state.modules.add(checkbox.value);
          } else {
            state.modules.delete(checkbox.value);
          }
  
          updatePlan();
          updateModuleToggleText();
        });
  
        elements.toggleAllModules.addEventListener("click", () => {
          state.modules.clear();
          syncControls();
          updatePlan();
        });
  
        document.querySelectorAll("input[name='semester']").forEach((input) => {
          input.addEventListener("change", () => {
            state.semester = input.value;
            updatePlan();
          });
        });
  
        document.querySelectorAll("input[name='year']").forEach((input) => {
          input.addEventListener("change", () => {
            state.year = Number(input.value);
            updatePlan();
          });
        });
  
        elements.completedSearch.addEventListener("input", () => {
          state.completedSearch = elements.completedSearch.value.trim();
          renderCompletedList();
        });
  
        elements.completedList.addEventListener("change", (event) => {
          const checkbox = event.target.closest("input[type='checkbox']");
          if (!checkbox) return;
  
          const name = checkbox.dataset.name;
          if (checkbox.checked) {
            state.completedNames.add(name);
          } else {
            state.completedNames.delete(name);
          }
          updatePlan();
        });
  
        elements.clearCompleted.addEventListener("click", () => {
          state.completedNames.clear();
          renderCompletedList();
          updatePlan();
        });
  
        elements.resetButton.addEventListener("click", () => {
          state.modules = new Set(bootstrap.defaults.modules);
          state.semester = bootstrap.defaults.semester;
          state.year = bootstrap.defaults.year;
          state.completedNames = new Set(initialCompletedNames);
          state.completedSearch = "";
          elements.completedSearch.value = "";
          syncControls();
          renderCompletedList();
          updatePlan();
        });
  
        elements.copyButton.addEventListener("click", copyPlan);
        elements.printButton.addEventListener("click", () => window.print());
  
        document.querySelectorAll(".tab-button").forEach((button) => {
          button.addEventListener("click", () => activateTab(button.dataset.tab));
        });
      }
  
      function renderModules() {
        elements.moduleList.innerHTML = moduleGroups
          .map(
            (group) => `
              <section class="module-group module-group-${escapeAttr(group.code.toLowerCase())}">
                <div class="module-group-heading">
                  <span>${escapeHtml(group.name)}</span>
                  <small>${group.modules.length}モジュール</small>
                </div>
                <div class="module-group-items">
                  ${group.modules
                    .map((moduleCode) => moduleByCode.get(moduleCode))
                    .filter(Boolean)
                    .map(renderModuleOption)
                    .join("")}
                </div>
              </section>
            `
          )
          .join("");
      }

      function renderModuleOption(module) {
        return `
          <label class="check-row ${moduleGroupClass(module.code)}">
            <input type="checkbox" value="${escapeAttr(module.code)}">
            <span>
              <span class="module-name">${escapeHtml(module.name)}</span>
              ${renderModuleBadge(module.code, "module-code")}
            </span>
          </label>
        `;
      }
  
      function renderCompletedList() {
        const items = buildCompletedItems();
        const search = state.completedSearch.toLowerCase();
        const filtered = search
          ? items.filter((item) => item.searchText.includes(search))
          : items;
  
        elements.completedList.innerHTML = filtered.length
          ? filtered
              .map((item) => {
                const checked = state.completedNames.has(item.name) ? "checked" : "";
                return `
                  <label class="completed-item">
                    <input type="checkbox" data-name="${escapeAttr(item.name)}" ${checked}>
                    <span>
                      <span class="completed-name">${escapeHtml(item.name)}</span>
                      <span class="completed-meta">
                        ${item.modules.map((moduleCode) => renderModuleBadge(moduleCode, "completed-module-badge")).join("")}
                        <span>${escapeHtml(item.detailMeta)}</span>
                      </span>
                    </span>
                  </label>
                `;
              })
              .join("")
          : `<div class="completed-item"><span></span><span class="completed-name">該当科目なし</span></div>`;
      }
  
      function renderFacultyInfo() {
        const info = bootstrap.facultyInfo;
        const basicRows = info.basics
          .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
          .join("");
  
        elements.facultyInfo.innerHTML = `
          <article class="faculty-card wide">
            <h2>${escapeHtml(info.title)}</h2>
            <dl class="fact-list">${basicRows}</dl>
          </article>
          <article class="faculty-card wide">
            <h2>理念</h2>
            <p>${escapeHtml(info.philosophy)}</p>
          </article>
          ${listCard("教育目標", info.goals)}
          ${listCard("学びの特徴", info.features)}
          ${listCard("3つの学修コース", info.courses)}
          ${listCard("卒業要件の要点", info.graduation)}
        `;
      }
  
      function listCard(title, items, extraClass = "") {
        return `
          <article class="faculty-card ${extraClass}">
            <h2>${escapeHtml(title)}</h2>
            <ul>
              ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </article>
        `;
      }
  
      function syncControls() {
        elements.moduleList.querySelectorAll("input[type='checkbox']").forEach((input) => {
          input.checked = state.modules.has(input.value);
        });
        document.querySelectorAll("input[name='semester']").forEach((input) => {
          input.checked = input.value === state.semester;
        });
        document.querySelectorAll("input[name='year']").forEach((input) => {
          input.checked = Number(input.value) === state.year;
        });
        updateModuleToggleText();
      }
  
      function updatePlan() {
        lastPlan = calculatePlan();
        renderStatus(lastPlan);
        renderAlerts(lastPlan);
        renderSchedule(lastPlan);
        renderSummary(lastPlan);
        renderResults(lastPlan);
      }
  
      function calculatePlan() {
        const rows = bootstrap.courses.filter((course) => {
          const yearMatches = course.year === state.year || (state.year === 3 && course.year === 2);
          return (
            state.modules.has(course.module) &&
            course.semester === state.semester &&
            yearMatches &&
            !course.completed &&
            !state.completedNames.has(course.name)
          );
        });
        const completedSummaryRows = bootstrap.courses.filter((course) => {
          return state.completedNames.has(course.name);
        });
  
        const uniqueMap = new Map();
        const countedKeys = new Set();
        const schedule = createEmptySchedule();
        const summaryMap = new Map(
          bootstrap.modules.map((module) => {
            const group = moduleGroupMap.get(module.code) || { code: "", name: "" };
            return [
              module.code,
              {
                code: module.code,
                name: module.name,
                groupCode: group.code,
                groupName: group.name,
                credits: 0,
                courses: [],
              },
            ];
          })
        );

        function addSummaryCredit(course, completed = false) {
          const key = courseKey(course);
          if (Number(course.credits || 0) <= 0 || countedKeys.has(key)) return;

          countedKeys.add(key);
          const summary = summaryMap.get(course.module);
          summary.credits += Number(course.credits || 0);
          summary.courses.push(completed ? `${course.name}（履修済み）` : course.name);
        }
  
        rows.forEach((course) => {
          const key = courseKey(course);
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, {
              key,
              name: course.name,
              module: course.module,
              moduleName: moduleMap.get(course.module) || course.module,
              semester: course.semester,
              year: course.year,
              credits: Number(course.credits || 0),
              slots: [],
              note: course.note || "",
            });
          }
  
          uniqueMap.get(key).slots.push(`${course.day}${course.period}限`);
  
          addSummaryCredit(course);
  
          if (schedule[course.day] && schedule[course.day][course.period]) {
            schedule[course.day][course.period].push({
              id: course.id,
              name: course.name,
              module: course.module,
              moduleName: moduleMap.get(course.module) || course.module,
              credits: Number(course.credits || 0),
            });
          }
        });
        completedSummaryRows.forEach((course) => addSummaryCredit(course, true));
  
        const resultRows = Array.from(uniqueMap.values()).sort((a, b) => {
          const moduleDiff = moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module);
          if (moduleDiff !== 0) return moduleDiff;
          return collator.compare(a.name, b.name);
        });
  
        const summaries = bootstrap.modules.map((module) => summaryMap.get(module.code));
        const groupSummaries = moduleGroups.map((group) => {
          const summariesInGroup = group.modules
            .map((moduleCode) => summaryMap.get(moduleCode))
            .filter(Boolean);
          const credits = summariesInGroup.reduce((sum, item) => sum + item.credits, 0);
          return { ...group, credits, summaries: summariesInGroup };
        });
        const totalCredits = summaries.reduce((sum, item) => sum + item.credits, 0);
        const conflicts = collectConflicts(schedule);
  
        return {
          rows,
          resultRows,
          summaries,
          groupSummaries,
          schedule,
          totalCredits,
          conflicts,
        };
      }
  
      function createEmptySchedule() {
        return bootstrap.days.reduce((schedule, day) => {
          schedule[day] = bootstrap.periods.reduce((periodMap, period) => {
            periodMap[period] = [];
            return periodMap;
          }, {});
          return schedule;
        }, {});
      }
  
      function collectConflicts(schedule) {
        const conflicts = [];
        bootstrap.days.forEach((day) => {
          bootstrap.periods.forEach((period) => {
            const courses = schedule[day][period];
            if (courses.length > 1) {
              conflicts.push({ day, period, courses });
            }
          });
        });
        return conflicts;
      }
  
      function renderStatus(plan) {
        elements.totalCredits.textContent = plan.totalCredits;
        elements.headerTotal.textContent = plan.totalCredits;
        elements.headerCourses.textContent = plan.resultRows.length;
        elements.slotCount.textContent = plan.rows.length;
        elements.conflictCount.textContent = plan.conflicts.length;
      }
  
      function renderAlerts(plan) {
        elements.alertList.innerHTML = plan.conflicts
          .map((conflict) => {
            const names = conflict.courses.map((course) => course.name).join(" / ");
            return `<div class="alert">${escapeHtml(conflict.day)}曜${escapeHtml(conflict.period)}限: ${escapeHtml(names)}</div>`;
          })
          .join("");
      }
  
      function renderSchedule(plan) {
        const head = `
          <thead>
            <tr>
              <th>時限</th>
              ${bootstrap.days.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}
            </tr>
          </thead>
        `;
        const body = bootstrap.periods
          .map((period) => {
            const cells = bootstrap.days
              .map((day) => {
                const courses = plan.schedule[day][period];
                const className = courses.length > 1 ? "schedule-cell conflict" : "schedule-cell";
                const content = courses.length
                  ? courses.map(renderCoursePill).join("")
                  : `<span class="empty-cell">-</span>`;
                return `<td class="${className}">${content}</td>`;
              })
              .join("");
            return `<tr><td>${period}限</td>${cells}</tr>`;
          })
          .join("");
  
        elements.scheduleTable.innerHTML = `${head}<tbody>${body}</tbody>`;
      }
  
      function renderCoursePill(course) {
        return `
          <span class="course-pill ${moduleGroupClass(course.module)}">
            ${renderModuleBadge(course.module, "module-badge")}${escapeHtml(course.name)}
          </span>
        `;
      }
  
      function renderSummary(plan) {
        elements.summaryGrid.innerHTML = plan.groupSummaries
          .map((summary) => {
            return `
              <article class="summary-row summary-group-${escapeAttr(summary.code.toLowerCase())}">
                <span>
                  <span>${escapeHtml(summary.name)}</span>
                </span>
                <strong>${summary.credits}<small>単位</small></strong>
              </article>
            `;
          })
          .join("");
      }
  
      function renderResults(plan) {
        elements.resultBody.innerHTML = plan.resultRows.length
          ? plan.resultRows
              .map(
                (course) => `
                  <tr>
                    <td data-label="モジュール">${renderModuleBadge(course.module, "course-slot")}</td>
                    <td data-label="科目名" class="result-course-cell">
                      <span class="result-course-name">${escapeHtml(course.name)}</span>
                      <span class="result-mobile-meta">
                        ${renderModuleBadge(course.module, "course-slot")}
                        <span>${course.year}年</span>
                        <span>${escapeHtml(course.semester)}</span>
                      </span>
                      <span class="result-mobile-facts">
                        <span><b>開講枠</b>${escapeHtml(course.slots.join(" / "))}</span>
                        <span><b>単位</b>${course.credits}単位</span>
                      </span>
                    </td>
                    <td data-label="年次">${course.year}年次</td>
                    <td data-label="学期">${escapeHtml(course.semester)}</td>
                    <td data-label="開講枠">${escapeHtml(course.slots.join(" / "))}</td>
                    <td data-label="単位">${course.credits}</td>
                  </tr>
                `
              )
              .join("")
          : `<tr><td colspan="6">該当科目なし</td></tr>`;
      }
  
      function buildCompletedItems() {
        const map = new Map();
        bootstrap.courses.forEach((course) => {
          if (!map.has(course.name)) {
            map.set(course.name, {
              name: course.name,
              modules: new Set(),
              years: new Set(),
              semesters: new Set(),
            });
          }
          const item = map.get(course.name);
          item.modules.add(course.module);
          item.years.add(course.year);
          item.semesters.add(course.semester);
        });
  
        return Array.from(map.values())
          .map((item) => {
            const modules = Array.from(item.modules).sort(
              (a, b) => moduleOrder.indexOf(a) - moduleOrder.indexOf(b)
            );
            const years = Array.from(item.years).sort((a, b) => a - b).map((year) => `${year}年`);
            const semesters = Array.from(item.semesters).sort((a, b) => (a === "春" ? -1 : 1));
            const meta = `${modules.join("/")} ${years.join("/")} ${semesters.join("/")}`;
            const detailMeta = `${years.join("/")} ${semesters.join("/")}`;
            return {
              ...item,
              modules,
              meta,
              detailMeta,
              firstModule: modules[0],
              searchText: `${item.name} ${meta}`.toLowerCase(),
            };
          })
          .sort((a, b) => {
            const moduleDiff =
              moduleOrder.indexOf(a.firstModule) - moduleOrder.indexOf(b.firstModule);
            if (moduleDiff !== 0) return moduleDiff;
            return collator.compare(a.name, b.name);
          });
      }

      function normalizeModuleGroups(data) {
        const groups = Array.isArray(data.moduleGroups) ? data.moduleGroups : [];
        if (groups.length) {
          return groups
            .map((group) => ({
              code: group.code,
              name: group.name,
              modules: group.modules.filter((moduleCode) => moduleMap.has(moduleCode)),
            }))
            .filter((group) => group.modules.length);
        }

        const fallbackGroups = new Map();
        data.modules.forEach((module) => {
          const groupCode = module.group || "その他";
          if (!fallbackGroups.has(groupCode)) {
            fallbackGroups.set(groupCode, {
              code: groupCode,
              name: groupCode === "A" || groupCode === "B" ? `${groupCode}群` : groupCode,
              modules: [],
            });
          }
          fallbackGroups.get(groupCode).modules.push(module.code);
        });
        return Array.from(fallbackGroups.values());
      }

      function renderModuleBadge(moduleCode, className) {
        return `<span class="${escapeAttr(className)} ${escapeAttr(moduleGroupClass(moduleCode))}">${escapeHtml(moduleCode)}</span>`;
      }

      function moduleGroupClass(moduleCode) {
        const group = moduleGroupMap.get(moduleCode);
        const groupCode = String(group?.code || "other")
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "");
        return `module-family-${groupCode || "other"}`;
      }
  
      function updateModuleToggleText() {
        elements.toggleAllModules.textContent = "解除";
      }
  
      function activateTab(tabName) {
        document.querySelectorAll(".tab-button").forEach((button) => {
          button.classList.toggle("active", button.dataset.tab === tabName);
        });
        document.getElementById("planPanel").classList.toggle("hidden", tabName !== "plan");
        document.getElementById("facultyPanel").classList.toggle("hidden", tabName !== "faculty");
      }
  
      async function copyPlan() {
        if (!lastPlan) return;
  
        const url = buildShareUrl();
        const copied = await copyText(url);

        if (copied) {
          flashButton(elements.copyButton, "URLコピー済み");
        } else {
          flashButton(elements.copyButton, "コピー失敗");
        }
      }

      async function copyText(text) {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          navigator.clipboard.writeText
        ) {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch (error) {
            console.warn("Clipboard API copy failed. Falling back to textarea copy.", error);
          }
        }

        return fallbackCopy(text);
      }

      function buildShareUrl() {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";

        url.searchParams.set("m", Array.from(state.modules).join(","));
        url.searchParams.set("s", state.semester);
        url.searchParams.set("y", String(state.year));

        const completedIds = Array.from(state.completedNames)
          .map((name) => shareMap.idByName.get(name))
          .filter(Boolean)
          .sort();
        if (completedIds.length) {
          url.searchParams.set("done", completedIds.join(","));
        }

        return url.toString();
      }
  
      function fallbackCopy(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.width = "1px";
        textarea.style.height = "1px";
        textarea.style.opacity = "0.01";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;
        try {
          copied = document.execCommand("copy");
        } catch (error) {
          copied = false;
        }

        textarea.remove();
        return copied;
      }
  
      function flashButton(button, label) {
        const original = button.textContent;
        button.textContent = label;
        window.setTimeout(() => {
          button.textContent = original;
        }, 1300);
      }
  
      function courseKey(course) {
        return [course.module, course.name, course.semester, course.year].join("|");
      }

      function readSharedStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const moduleParam = params.has("m")
          ? params.get("m")
          : params.has("modules")
            ? params.get("modules")
            : null;
        const modules = moduleParam === null
          ? new Set(bootstrap.defaults.modules)
          : new Set(
              moduleParam
                .split(",")
                .map((code) => code.trim())
                .filter((code) => moduleMap.has(code))
            );

        const semesterParam = params.get("s") || params.get("semester");
        const semester = ["春", "秋"].includes(semesterParam)
          ? semesterParam
          : bootstrap.defaults.semester;

        const yearParam = Number(params.get("y") || params.get("year"));
        const year = [2, 3].includes(yearParam) ? yearParam : bootstrap.defaults.year;

        const completedNames = params.has("done")
          ? new Set(
              params
                .get("done")
                .split(",")
                .map((id) => shareMap.nameById.get(id.trim()))
                .filter(Boolean)
            )
          : new Set(initialCompletedNames);

        return { modules, semester, year, completedNames };
      }

      function buildShareMap(courses) {
        const idByName = new Map();
        const nameById = new Map();
        courses.forEach((course) => {
          if (!idByName.has(course.name)) {
            idByName.set(course.name, course.id);
          }
          nameById.set(course.id, course.name);
        });
        return { idByName, nameById };
      }
  
      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
  
      function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, "&#96;");
      }
  
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ' を読み込めませんでした');
  return response.json();
}

function showLoadError(error) {
  const target = document.querySelector('.workspace') || document.body;
  target.textContent = window.location.protocol === 'file:' ? 'このページは、ファイルをダブルクリックして開くと動きません（ブラウザの制限）。GitHub Pages などに公開したURLから開いてください。' : 'データの読み込みに失敗しました。公開設定またはファイル配置を確認してください。';
  console.error(error);
}
