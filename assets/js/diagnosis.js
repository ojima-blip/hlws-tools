'use strict';
// サイトの一番上のフォルダ（このファイルは assets/js/ にある）。GitHub Pages の /リポジトリ名/ の下でも動くように、相対で求める
var SITE_ROOT = new URL('../../', (document.currentScript && document.currentScript.src) || window.location.href);

document.addEventListener('DOMContentLoaded', () => {
  initDiagnosis().catch(showLoadError);
});

async function initDiagnosis() {
  const diagnosisData = await fetchJson(new URL('data/questions.json', SITE_ROOT).href);
  const themes = diagnosisData.themes;
  const questions = diagnosisData.questions;
  'use strict';
  
      const state = { current: 0, answers: {}, resultIds: [] };
      const byId = function (id) { return document.getElementById(id); };
      const screens = ['welcome-screen', 'quiz-screen', 'result-screen'];
  
      function showOnly(screenId) {
        screens.forEach(function (id) { byId(id).classList.toggle('hidden', id !== screenId); });
        scrollToScreenTop(screenId);
      }

      function scrollToScreenTop(screenId) {
        const target = byId(screenId);
        const currentY = window.pageYOffset || 0;
        const top = target && typeof target.getBoundingClientRect === 'function'
          ? target.getBoundingClientRect().top + currentY - 16
          : 0;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
  
      function startQuiz() {
        state.current = 0;
        state.answers = {};
        state.resultIds = [];
        showOnly('quiz-screen');
        renderQuestion();
        scrollToScreenTop('quiz-screen');
      }
  
      function renderQuestion() {
        const question = questions[state.current];
        const answered = state.answers[question.id] || [];
        byId('progress-text').textContent = 'QUESTION ' + (state.current + 1) + ' / ' + questions.length;
        byId('progress-percent').textContent = Math.round(((state.current + 1) / questions.length) * 100) + '%';
        byId('progress-bar').style.width = ((state.current + 1) / questions.length) * 100 + '%';
        byId('back-button').style.visibility = state.current === 0 ? 'hidden' : 'visible';
        byId('next-button').textContent = state.current === questions.length - 1 ? '結果を見る →' : '次へ →';
  
        const choices = question.choices.map(function (choice) {
          const selected = answered.indexOf(choice[0]) > -1;
          return '<button class="choice" type="button" data-value="' + choice[0] + '" aria-pressed="' + selected + '">' +
            '<span class="choice-copy"><strong>' + escapeHtml(choice[1]) + '</strong><small>' + escapeHtml(choice[2]) + '</small></span>' +
            '<span class="choice-arrow" aria-hidden="true">→</span>' +
          '</button>';
        }).join('');
  
        byId('question-card').innerHTML =
          '<div class="question-number">0' + (state.current + 1) + '</div>' +
          '<h2>' + question.title + '</h2>' +
          '<p class="question-helper">' + question.helper + '</p>' +
          '<div class="choice-list">' + choices + '</div>' +
          '<p id="selection-hint" class="selection-hint"></p>';
  
        document.querySelectorAll('.choice').forEach(function (button) {
          button.addEventListener('click', function () { selectChoice(question, button.dataset.value); });
        });
      }
  
      function selectChoice(question, value) {
        const selected = state.answers[question.id] || [];
        const max = getQuestionMax(question);
        if (question.type === 'single') {
          state.answers[question.id] = [value];
        } else {
          const isSelected = selected.indexOf(value) > -1;
          if (isSelected) {
            state.answers[question.id] = selected.filter(function (choiceValue) { return choiceValue !== value; });
          } else if (selected.length >= max) {
            byId('selection-hint').textContent = '最大' + max + 'つまで選べます。選択を外してから選び直してください。';
            return;
          } else {
            state.answers[question.id] = selected.concat(value);
          }
        }
        renderQuestion();
      }
  
      function nextQuestion() {
        const question = questions[state.current];
        const selection = state.answers[question.id] || [];
        if (!selection.length) {
          byId('selection-hint').textContent = '1つ以上選んでください。';
          return;
        }
        if (state.current < questions.length - 1) {
          state.current += 1;
          renderQuestion();
          scrollToScreenTop('quiz-screen');
        } else {
          showResult();
        }
      }
  
      function getRankedThemes() {
        const score = {};
        Object.keys(themes).forEach(function (id) { score[id] = 0; });
        questions.forEach(function (question) {
          getThemeIds(state.answers[question.id] || []).forEach(function (id) {
            if (Object.prototype.hasOwnProperty.call(score, id)) {
              score[id] += question.id === 'interest' ? 3 : 1;
            }
          });
        });
        const interestOrder = getThemeIds(state.answers.interest || []);
        return Object.keys(score).sort(function (a, b) {
          if (score[b] !== score[a]) return score[b] - score[a];
          const aInterest = interestOrder.indexOf(a);
          const bInterest = interestOrder.indexOf(b);
          if (aInterest !== bInterest) return (aInterest === -1 ? 99 : aInterest) - (bInterest === -1 ? 99 : bInterest);
          return a.localeCompare(b, 'ja');
        });
      }
  
      function makeCard(id, isPrimary) {
        const theme = themes[id];
        const consultationQuestions = theme.openCampusQuestions || (theme.staffPrompt ? [theme.staffPrompt] : []);
        const modules = uniqueItems((theme.courseLinkedModules || []).concat(theme.relatedModules || []));
        if (isPrimary) return makePrimaryResultCard(theme, consultationQuestions, modules);
        return makeSecondaryResultCard(theme, modules);
      }
  
      function showResult() {
        state.resultIds = getRankedThemes().slice(0, 2);
        const primary = themes[state.resultIds[0]];
        const secondary = themes[state.resultIds[1]];
        byId('result-title').innerHTML = '「' + escapeHtml(primary.shortLabel) + '」から、<br class="mobile-result-title-break">未来をひらく。';
        byId('result-lead').textContent = 'この結果は、学び方を考えるためのヒントです。「' + primary.shortLabel + '」に関心が向きやすいかもしれません。' + secondary.shortLabel + 'の視点も組み合わせると、学部説明や在学生相談で聞きたいことが見つけやすくなります。';
        byId('result-cards').innerHTML = makeCard(state.resultIds[0], true) + makeCard(state.resultIds[1], false);
        showOnly('result-screen');
      }
  
      byId('start-button').addEventListener('click', startQuiz);
      byId('brand-home').addEventListener('click', function (event) {
        event.preventDefault();
        showOnly('welcome-screen');
      });
      byId('next-button').addEventListener('click', nextQuestion);
      byId('back-button').addEventListener('click', function () { state.current -= 1; renderQuestion(); scrollToScreenTop('quiz-screen'); });
      byId('restart-button').addEventListener('click', startQuiz);
      byId('print-button').addEventListener('click', function () { window.print(); });

      function getQuestionMax(question) {
        return question.type === 'single' ? 1 : Number(question.max || 1);
      }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ' を読み込めませんでした');
  return response.json();
}

function makeListSection(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return '<p><strong>' + escapeHtml(title) + '</strong></p>' +
    '<ul>' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>';
}

function makePrimaryResultCard(theme, consultationQuestions, modules) {
  return '<article class="result-card result-card-primary">' +
    '<div class="result-card-heading">' +
      '<span class="tag">あなたに近い学びタイプ</span>' +
      '<h3>' + escapeHtml(theme.label) + '</h3>' +
      '<p>' + escapeHtml(theme.lead) + '</p>' +
      '<div class="result-routing-grid">' +
        '<p><strong>関連しそうなコース</strong><span>' + escapeHtml(theme.route) + '</span></p>' +
        '<p><strong>関連しそうなモジュール</strong><span>' + escapeHtml(modules.join('、')) + '</span></p>' +
      '</div>' +
    '</div>' +
    '<div class="result-detail-grid">' +
      makeInsightCard('あなたに合う学びの特徴', theme.points || [], 'green') +
      makeInsightCard('関心に近いテーマ', theme.learningThemes || [], 'orange') +
      makeInsightCard('授業やゼミのイメージ', theme.relatedCourses || [], 'blue') +
      makeInsightCard('オープンキャンパスで聞くとよいこと', consultationQuestions.concat(theme.consultationMemo ? ['相談メモ: ' + theme.consultationMemo] : []), 'purple') +
    '</div>' +
  '</article>';
}

function makeSecondaryResultCard(theme, modules) {
  return '<article class="result-card result-card-secondary">' +
    '<span class="tag">組み合わせると広がる視点</span>' +
    '<h3>' + escapeHtml(theme.label) + '</h3>' +
    '<p>' + escapeHtml(theme.lead) + '</p>' +
    '<div class="secondary-result-grid">' +
      '<p><strong>関連しそうなコース</strong><span>' + escapeHtml(theme.route) + '</span></p>' +
      '<p><strong>関連しそうなモジュール</strong><span>' + escapeHtml(modules.join('、')) + '</span></p>' +
    '</div>' +
  '</article>';
}

function makeInsightCard(title, items, tone) {
  if (!Array.isArray(items) || !items.length) return '';
  return '<section class="insight-card insight-' + tone + '">' +
    '<div class="insight-title"><h4>' + escapeHtml(title) + '</h4></div>' +
    '<ul>' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>' +
  '</section>';
}

function uniqueItems(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getThemeIds(answerValues) {
  const ids = [];
  answerValues.forEach(function (value) {
    String(value).split(',').forEach(function (id) {
      const normalized = id.trim();
      if (normalized) ids.push(normalized);
    });
  });
  return ids;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showLoadError(error) {
  const target = document.getElementById('question-card') || document.body;
  target.textContent = window.location.protocol === 'file:' ? 'このページは、ファイルをダブルクリックして開くと動きません（ブラウザの制限）。GitHub Pages などに公開したURLから開いてください。' : 'データの読み込みに失敗しました。公開設定またはファイル配置を確認してください。';
  console.error(error);
}
