// Қорытынды = аудиториялық * 0.4 + (модуль1 + модуль2) / 2 * 0.2 + емтихан * 0.4
const WEIGHTS = { audi: 0.4, module: 0.1, exam: 0.4 }; // әр модуль: 0.2 / 2
const MIN_SCORE = 0;
const MAX_SCORE = 100;
const HARD_SCORE = 90; // бұдан жоғары балл керек болса — «Өте қиын»
const DEFAULT_GUESS = 80; // белгісіз модульдің әдепкі болжамы
const STORAGE_KEY = 'grade-calculator:v1';

// ҚР кредиттік жүйесінің әріптік баға шкаласы (min — төменгі шегі)
const GRADE_SCALE = [
  { min: 95, letter: 'A', gpa: 4.0 },
  { min: 90, letter: 'A-', gpa: 3.67 },
  { min: 85, letter: 'B+', gpa: 3.33 },
  { min: 80, letter: 'B', gpa: 3.0 },
  { min: 75, letter: 'B-', gpa: 2.67 },
  { min: 70, letter: 'C+', gpa: 2.33 },
  { min: 65, letter: 'C', gpa: 2.0 },
  { min: 60, letter: 'C-', gpa: 1.67 },
  { min: 55, letter: 'D+', gpa: 1.33 },
  { min: 50, letter: 'D', gpa: 1.0 },
  { min: 25, letter: 'FX', gpa: 0 },
  { min: 0, letter: 'F', gpa: 0 },
];
const gradeOf = (score) => GRADE_SCALE.find((g) => score >= g.min - 1e-9);
const MOBILE_QUERY = '(max-width: 899px)';

const TEXT = {
  placeholder: 'Баллдарды енгізіп, «Есептеу» батырмасын басыңыз.',
  chartEmpty: 'Есептеуден кейін мұнда график шығады.',
  partsTitle: 'Баллдың құрамы',
  tipHint: 'Түсіндірме үшін диаграмманың бөлігіне меңзерді апарыңыз немесе басыңыз.',
};

const FIELDS = {
  audi: 'Аудиториялық',
  rk1: 'Модуль 1',
  rk2: 'Модуль 2',
  emtihan: 'Емтихан',
  qalau: 'Қалаған баға',
};

const $ = (id) => document.getElementById(id);
const form = $('calc');
const result = $('result');
const chart = $('chart');

function getScore(audi, rk1, rk2, exam) {
  return audi * WEIGHTS.audi + (rk1 + rk2) * WEIGHTS.module + exam * WEIGHTS.exam;
}

// Бос өріс → null, сан емес мәтін → NaN, әйтпесе сан. Үтір де қабылданады: «85,5» → 85.5
function readField(id) {
  const raw = $(id).value.trim().replace(',', '.');
  return raw === '' ? null : Number(raw);
}

// Қажетті баллды жоғары қарай 0.01-ге дейін дөңгелектеу
function formatNeed(value) {
  return String(Math.ceil(value * 100 - 1e-9) / 100);
}

function formatScore(value) {
  return String(Math.round(value * 100) / 100);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- Есептеу ---------- */

// Бір белгісіз балл үшін жауап: label — «Емтиханнан», «Модуль 2-ден» т.б.
function needView(need, label, maxScore) {
  const note = `ең жоғары баға ${maxScore.toFixed(2)}`;
  if (need <= MIN_SCORE) {
    return { label: `${label} кемінде`, value: '0', unit: 'балл', pill: { tone: 'ok', text: 'Қазірдің өзінде жеттіңіз ✓' }, note };
  }
  const pill = need > HARD_SCORE ? { tone: 'warn', text: 'Өте қиын' } : { tone: 'ok', text: 'Мүмкін ↑' };
  return { label: `${label} кемінде`, value: formatNeed(need), unit: 'балл', pill, note };
}

// Белгісіз модуль үшін шекаралар (басқа модуль — енгізілген немесе болжам):
// min — одан төмен болса, емтиханнан 100 алса да жетпейді; easy — одан жоғары болса, емтихан ≤ HARD_SCORE
function moduleThresholds(values, guesses, id) {
  const otherId = id === 'rk1' ? 'rk2' : 'rk1';
  const other = values[otherId] ?? guesses[otherId];
  const room = values.qalau - values.audi * WEIGHTS.audi - other * WEIGHTS.module;
  return {
    min: (room - MAX_SCORE * WEIGHTS.exam) / WEIGHTS.module,
    easy: (room - HARD_SCORE * WEIGHTS.exam) / WEIGHTS.module,
  };
}

// Модульдердің болжамды мәндерімен есептеу (слайдерлер үшін)
function whatIf(values, guesses) {
  const preview = compute({ ...values, ...guesses });
  const label = Object.entries(guesses)
    .map(([id, value]) => `${FIELDS[id].toLowerCase()} = ${value}`)
    .join(', ');
  const modules = preview.chart.rows[1];
  modules.guess = true;
  modules.tip = `Бұл — болжам (${label}), әлі енгізілген баға емес. ${modules.tip}`;
  preview.need.note = 'слайдердегі болжам бойынша';
  return preview;
}

function validate(values, silent) {
  for (const [id, label] of Object.entries(FIELDS)) {
    const value = values[id];
    const invalid = Number.isNaN(value) || (value !== null && (value < MIN_SCORE || value > MAX_SCORE));
    $(id).setAttribute('aria-invalid', String(invalid));
    if (invalid) {
      if (!silent) $(id).focus();
      return `«${label}» өрісі 0 мен 100 аралығындағы сан болуы керек.`;
    }
  }
  if (values.audi === null) {
    if (!silent) $('audi').focus();
    return 'Аудиториялық баллды енгізіңіз.';
  }
  return null;
}

// Нәтиже моделі: need — басты карточка, current/target — көрсеткіштер, chart — график
function compute(values) {
  const { audi, rk1, rk2, emtihan, qalau } = values;
  const maxScore = getScore(audi, rk1 ?? MAX_SCORE, rk2 ?? MAX_SCORE, emtihan ?? MAX_SCORE);
  const current = getScore(audi, rk1 ?? 0, rk2 ?? 0, emtihan ?? 0);
  const modulesKnown = rk1 !== null && rk2 !== null;

  const f = formatScore;
  const parts = [
    {
      label: 'Аудиториялық',
      max: MAX_SCORE * WEIGHTS.audi,
      value: audi * WEIGHTS.audi,
      tip: `Аудиториялық балл ${f(audi)} × 0.4 = ${f(audi * WEIGHTS.audi)}. Бұл бөлік қорытындыға ең көбі 40 балл қосады.`,
    },
    {
      label: 'Модульдер',
      max: MAX_SCORE * WEIGHTS.module * 2,
      value: modulesKnown ? (rk1 + rk2) * WEIGHTS.module : null,
      tip: modulesKnown
        ? `Модульдердің орташасы (${f(rk1)} + ${f(rk2)}) / 2 = ${f((rk1 + rk2) / 2)}, оны 0.2-ге көбейтеміз: ${f((rk1 + rk2) * WEIGHTS.module)}. Ең көбі 20 балл.`
        : 'Модульдер әлі толық енгізілмеген. Екеуі де белгілі болғанда, орташасы × 0.2 қорытындыға қосылады (ең көбі 20 балл).',
    },
    {
      label: 'Емтихан',
      max: MAX_SCORE * WEIGHTS.exam,
      value: emtihan !== null ? emtihan * WEIGHTS.exam : null,
      tip: emtihan !== null
        ? `Емтихан ${f(emtihan)} × 0.4 = ${f(emtihan * WEIGHTS.exam)}. Бұл бөлік қорытындыға ең көбі 40 балл қосады.`
        : 'Емтихан әлі енгізілмеген. Ол × 0.4 болып қорытындыға қосылады (ең көбі 40 балл).',
    },
  ];
  const model = { current, target: qalau, maxScore, chart: { type: 'parts', rows: parts } };

  if (modulesKnown && emtihan !== null) {
    const score = getScore(audi, rk1, rk2, emtihan);
    const grade = gradeOf(score);
    const gradeText = `${grade.letter} · GPA ${grade.gpa.toFixed(2)}`;
    model.need = { label: 'Қорытынды баға', value: score.toFixed(2) };
    if (qalau !== null) {
      model.need.pill = score >= qalau
        ? { tone: 'ok', text: 'Қалаған бағаға жеттіңіз ↑' }
        : { tone: 'bad', text: `${formatNeed(qalau - score)} балл жетпейді ↓` };
      model.need.note = gradeText;
    } else {
      model.need.pill = { tone: grade.gpa > 0 ? 'ok' : 'bad', text: gradeText };
    }
    return model;
  }

  if (qalau === null) {
    return { error: 'Қалаған бағаны енгізіңіз: сонда қанша балл керек екенін есептейміз.', focus: 'qalau' };
  }

  if (maxScore < qalau) {
    model.need = {
      label: 'Ең жоғары мүмкін баға',
      value: maxScore.toFixed(2),
      pill: { tone: 'bad', text: 'Мүмкін емес ↓' },
      note: `қалаған баға ${qalau}`,
    };
    if (emtihan === null) {
      parts[2].need = MAX_SCORE * WEIGHTS.exam;
      parts[2].needText = '100 болса да жетпейді';
      parts[2].bad = true;
      parts[2].tip = `Емтиханнан 100 алсаңыз да (100 × 0.4 = 40 балл), қорытынды ең көбі ${f(maxScore)} болады — бұл қалаған бағадан (${qalau}) аз.`;
    }
    return model;
  }

  const base = audi * WEIGHTS.audi;

  // Емтихан белгісіз
  if (emtihan === null) {
    const needExam = (m1, m2) => (qalau - base - (m1 + m2) * WEIGHTS.module) / WEIGHTS.exam;

    if (modulesKnown) {
      const need = Math.max(MIN_SCORE, needExam(rk1, rk2));
      model.need = needView(need, 'Емтиханнан', maxScore);
      model.chart.values = values;
      model.chart.single = { field: 'emtihan', need };
      // Модуль слайдерлері осы жолды көрсетеді (емтихан слайдері оны өз болжамымен ауыстырады)
      parts[2].need = need * WEIGHTS.exam;
      parts[2].needText = `керек ≥ ${formatNeed(need)}`;
      parts[2].tip = need <= MIN_SCORE
        ? `Емтихан әлі белгісіз. Басқа баллдар жеткілікті: емтиханнан 0 алсаңыз да, қалаған бағаға (${qalau}) жетесіз.`
        : `Емтихан әлі белгісіз. Қорытынды ${qalau} болу үшін емтиханнан кемінде ${formatNeed(need)} керек: ${formatNeed(need)} × 0.4 = ${f(need * WEIGHTS.exam)} балл қосылады.`;
      return model;
    }

    // Модуль(дер) де белгісіз: слайдермен болжам жасаймыз.
    // Әдепкі болжам — 80, бірақ мақсатқа жетуге болатын ең аз мәннен төмен емес
    const guesses = {};
    for (const id of ['rk1', 'rk2']) {
      if (values[id] === null) guesses[id] = DEFAULT_GUESS;
    }
    for (const id of Object.keys(guesses)) {
      const { min } = moduleThresholds(values, guesses, id);
      guesses[id] = Math.min(MAX_SCORE, Math.max(DEFAULT_GUESS, Math.ceil(min)));
    }
    model.need = whatIf(values, guesses).need;
    model.chart = { type: 'whatif', values, guesses };
    return model;
  }

  // Емтихан белгілі, модуль(дер) белгісіз
  const rest = qalau - base - emtihan * WEIGHTS.exam;
  model.chart.values = values;
  if (rk1 === null && rk2 === null) {
    const needAvg = Math.max(MIN_SCORE, rest / (2 * WEIGHTS.module));
    model.need = needView(needAvg, 'Модульдердің орташа балы', maxScore);
    model.chart.single = { field: 'avg', need: needAvg };
    return model;
  }
  const known = rk1 ?? rk2;
  const which = rk1 === null ? 'rk1' : 'rk2';
  const need = Math.max(MIN_SCORE, (rest - known * WEIGHTS.module) / WEIGHTS.module);
  model.need = needView(need, `${FIELDS[which]}-ден`, maxScore);
  model.chart.single = { field: which, need };
  return model;
}

/* ---------- Көрсету ---------- */

// view: { label, value, unit, pill: { tone: 'ok' | 'warn' | 'bad', text }, note } немесе { error }.
// quiet — слайдерден жаңартқанда экран оқу құралы әр қадамды оқымасын
function renderNeed(view, { quiet = false } = {}) {
  result.setAttribute('aria-live', quiet ? 'off' : 'polite');
  result.replaceChildren();
  if (view.error) {
    result.append(el('p', 'result-error', view.error));
    return;
  }
  result.append(el('p', 'result-label', view.label));

  const value = el('p', 'result-value', view.value);
  if (view.unit) value.append(' ', el('span', 'result-unit', view.unit));
  result.append(value);

  const meta = el('div', 'result-meta');
  if (view.pill) meta.append(el('span', `pill pill-${view.pill.tone}`, view.pill.text));
  if (view.note) meta.append(el('span', '', view.note));
  if (meta.childElementCount) result.append(meta);
}

function renderStats(model) {
  if (!model) {
    $('current-value').textContent = '—';
    $('current-bar').style.width = '0';
    $('current-note').textContent = 'Баллдарды енгізіңіз';
    $('target-value').textContent = '—';
    $('target-note').textContent = 'Енгізілмеген';
    return;
  }
  const hasTarget = model.target !== null;
  // Қалаған баға 0 болса — кез келген балл жеткілікті, жолақ толық
  const share = !hasTarget ? model.current / MAX_SCORE
    : model.target === 0 ? 1
    : Math.min(model.current / model.target, 1);
  $('current-value').textContent = formatScore(model.current);
  $('current-bar').style.width = `${share * 100}%`;
  $('current-note').textContent = hasTarget ? `қалаған бағаның ${Math.round(share * 100)}%` : '100 баллдан';
  $('target-value').textContent = model.target ?? '—';
  $('target-note').textContent = model.target === null
    ? 'Енгізсеңіз, қанша жетпейтінін көрсетеміз'
    : `ең жоғары мүмкін: ${model.maxScore.toFixed(2)}`;
}

// Түсіндірмесі бар элемент: меңзер, фокус немесе басу арқылы ашылады.
// label — экран оқу құралына арналған қысқа атау
function withTip(node, tip, label) {
  node.classList.add('has-tip');
  node.dataset.tip = tip;
  node.tabIndex = 0;
  node.setAttribute('aria-label', label);
  return node;
}

function renderParts(rows) {
  const ul = el('ul', 'parts');
  for (const row of rows) {
    let right = 'бос';
    if (row.value !== null) right = `${formatScore(row.value)} / ${row.max}${row.guess ? ' · болжам' : ''}`;
    else if (row.needText) right = row.needText;
    const li = withTip(el('li'), row.tip, `${row.label}: ${right}`);
    const head = el('div', 'parts-head');
    head.append(el('span', '', row.label), el('span', row.bad ? 'is-bad' : '', right));

    let fillClass = '';
    if (row.bad) fillClass = 'bar-bad';
    else if (row.guess) fillClass = 'bar-guess';
    else if (row.value === null && row.needText) fillClass = 'bar-need';
    const bar = el('div', 'bar');
    const fill = el('i', fillClass);
    const amount = row.value ?? row.need ?? 0;
    fill.style.width = `${Math.min(amount / row.max, 1) * 100}%`;
    bar.append(fill);

    li.append(head, bar);
    ul.append(li);
  }
  return ul;
}

function legendText(id, min, easy) {
  const name = FIELDS[id];
  if (min > MAX_SCORE) return `Екінші модуль осындай болса, ${name.toLowerCase()} 100 болса да жетпейді.`;
  const lines = [min > MIN_SCORE
    ? `Шекара — ${formatNeed(min)}: одан төмен болса, емтихан 100 болса да жетпейді.`
    : `${name} кез келген бағамен мүмкін.`];
  if (easy > MIN_SCORE && easy <= MAX_SCORE) {
    lines.push(`${formatNeed(easy)} және жоғары — емтихан ≤ ${HARD_SCORE}.`);
  }
  return lines.join(' ');
}

const clampScore = (v) => Math.min(Math.max(v, MIN_SCORE), MAX_SCORE);
const PART_COLORS = ['w-audi', 'w-modules', 'w-exam'];

// Слайдер + түсті зоналар (мүмкін емес / өте қиын / мүмкін)
function buildSlider(id, labelText, value, onInput) {
  const inputId = `guess-${id}`;
  const box = el('div', 'whatif-slider');

  const head = el('div', 'whatif-head');
  const label = el('label', '', labelText);
  label.htmlFor = inputId;
  const out = el('output', 'whatif-value');
  out.setAttribute('for', inputId);
  head.append(label, out);

  const track = el('div', 'whatif-track');
  const zones = el('div', 'zones');
  zones.setAttribute('aria-hidden', 'true');
  const bad = el('span', 'zone zone-bad');
  const warn = el('span', 'zone zone-warn');
  const ok = el('span', 'zone zone-ok');
  zones.append(bad, warn, ok);
  const input = el('input', 'range');
  Object.assign(input, { type: 'range', id: inputId, min: MIN_SCORE, max: MAX_SCORE, step: 1, value });
  // Жылдам жылжытқанда бір кадрға бір рет қана қайта есептейміз
  let frame = 0;
  input.addEventListener('input', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onInput(Number(input.value)));
  });
  track.append(zones, input);

  const legend = el('p', 'whatif-legend');
  box.append(head, track, legend);

  return {
    box,
    update(current, badEnd, warnEnd, legendLine, spoken = legendLine) {
      bad.style.width = `${badEnd}%`;
      warn.style.width = `${warnEnd - badEnd}%`;
      ok.style.width = `${MAX_SCORE - warnEnd}%`;
      out.textContent = current;
      legend.textContent = legendLine;
      input.setAttribute('aria-valuetext', `${current} балл. ${spoken}`);
    },
  };
}

// Үш бөлік бір жолақта + қалаған бағаның белгісі
function renderTotal(rows, target) {
  const amounts = rows.map((row) => row.value ?? row.need ?? 0);
  const sum = Math.min(amounts.reduce((a, b) => a + b, 0), MAX_SCORE);
  const f = formatScore;
  const box = withTip(
    el('div', 'total'),
    `Үш бөлік бір жолақта: аудиториялық ${f(amounts[0])} + модульдер ${f(amounts[1])} + емтихан ${f(amounts[2])} = ${f(sum)}.`
      + (target !== null ? ` Ақ сызық — қалаған баға (${target}).` : ''),
    `Қорытынды баға: ${f(sum)} / 100`,
  );
  box.setAttribute('role', 'group');

  const head = el('div', 'total-head');
  head.append(el('span', '', 'Қорытынды баға'), el('b', '', `${f(sum)} / 100`));

  const bar = el('div', 'total-bar');
  rows.forEach((row, i) => {
    const classes = [PART_COLORS[i]];
    if (row.bad) classes.push('is-bad');
    else if (row.guess) classes.push('is-guess');
    else if (row.value === null) classes.push('is-need');
    const seg = el('span', classes.join(' '));
    seg.style.width = `${amounts[i]}%`;
    bar.append(seg);
  });
  if (target !== null) {
    const marker = el('i', 'total-target');
    marker.style.left = `${target}%`;
    // Шетке жақын болса, жазу карточкадан шығып кетпесін
    let edge = '';
    if (target < 10) edge = ' is-start';
    else if (target > 90) edge = ' is-end';
    const label = el('small', `total-target-label${edge}`, `қалаған ${target}`);
    label.style.left = `${target}%`;
    bar.append(marker, label);
  }
  box.append(head, bar);
  return { box, sum };
}

// Әріптік баға шкаласы (50-ден төмені — бір бөлік)
const SCALE_FROM = 40;
function renderScale(score, caption) {
  const grade = gradeOf(score);
  const pos = (v) => ((Math.max(v, SCALE_FROM) - SCALE_FROM) / (MAX_SCORE - SCALE_FROM)) * 100;
  const box = withTip(
    el('div', 'scale'),
    `${formatScore(score)} балл → ${grade.letter} (GPA ${grade.gpa.toFixed(2)}). Шкала: A 95–100, A- 90–94, B+ 85–89, B 80–84, B- 75–79, C+ 70–74, C 65–69, C- 60–64, D+ 55–59, D 50–54, 50-ден төмен — FX/F.`,
    `Әріптік баға: ${grade.letter}, GPA ${grade.gpa.toFixed(2)}`,
  );
  box.setAttribute('role', 'group');

  const head = el('div', 'total-head');
  const title = el('span', '', 'Әріптік баға');
  if (caption) title.append(el('small', '', ` · ${caption}`));
  head.append(title, el('b', '', `${grade.letter} · GPA ${grade.gpa.toFixed(2)}`));

  const bar = el('div', 'scale-bar');
  const bands = GRADE_SCALE.filter((g) => g.min >= 50).reverse();
  const fail = el('span', 'band band-f', 'F');
  fail.style.width = `${pos(50)}%`;
  bar.append(fail);
  bands.forEach((g, i) => {
    const next = bands[i + 1]?.min ?? MAX_SCORE;
    const band = el('span', `band band-${g.letter[0].toLowerCase()}${g === grade ? ' is-current' : ''}`, g.letter);
    band.style.width = `${pos(next) - pos(g.min)}%`;
    bar.append(band);
  });
  const pointer = el('i', 'scale-pointer');
  pointer.style.left = `${pos(score)}%`;
  bar.append(pointer);

  box.append(head, bar);
  return box;
}

// «Баллдың құрамы» толық блогы: жалпы жолақ, бөліктер, әріптік баға
function renderSummary(rows, target) {
  const total = renderTotal(rows, target);
  let caption = '';
  if (rows.some((row) => row.bad)) caption = 'ең жоғары мүмкін';
  else if (rows.some((row) => row.guess)) caption = 'болжам бойынша';
  else if (rows.some((row) => row.value === null && row.need !== undefined)) caption = 'керек балл алсаңыз';
  return [total.box, renderParts(rows), renderScale(total.sum, caption)];
}

// Белгісіз модуль(дер) үшін слайдерлер; слайдер жылжыса, бәрі қайта есептеледі
function renderWhatIf({ values, guesses }) {
  const sliders = el('div', 'whatif-sliders');
  const slot = el('div', 'chart-body');

  const controls = Object.keys(guesses).map((id) => {
    const slider = buildSlider(id, `${FIELDS[id]} — болжам`, guesses[id], (v) => {
      guesses[id] = v;
      refresh(true); // слайдерден — үнсіз жаңарту
    });
    sliders.append(slider.box);
    return { id, slider };
  });

  // Телефонда басты карточка жоғарыда көрінбей қалады — жауапты слайдердің астында да қайталаймыз
  const answer = el('p', 'whatif-result');
  sliders.append(answer);

  function refresh(quiet) {
    const preview = whatIf(values, guesses);
    const { need } = preview;
    const summary = `Болжам бойынша: ${need.label.toLowerCase()} — ${need.value}${need.unit ? ` ${need.unit}` : ''}`
      + (need.pill ? ` (${need.pill.text.replace(/ [↑↓✓]$/, '')})` : '');
    answer.textContent = summary;
    for (const { id, slider } of controls) {
      const { min, easy } = moduleThresholds(values, guesses, id);
      const badEnd = clampScore(min);
      slider.update(guesses[id], badEnd, clampScore(Math.max(easy, min)), legendText(id, min, easy), summary);
    }
    renderNeed(need, { quiet });
    hideTip();
    slot.replaceChildren(...renderSummary(preview.chart.rows, values.qalau));
  }

  refresh(false);
  return [sliders, slot];
}

// Бір ғана белгісіз балл (емтихан, бір модуль немесе модульдердің орташасы): слайдермен «өлшеп көру»
const SINGLE_FIELDS = {
  emtihan: { name: 'Емтихан', row: 2 },
  rk1: { name: 'Модуль 1', row: 1 },
  rk2: { name: 'Модуль 2', row: 1 },
  avg: { name: 'Модульдер орташасы', short: 'Модульдер', row: 1 },
};

function renderSingleWhatIf({ values, rows, single }) {
  const { field, need } = single;
  const { name, short = name, row } = SINGLE_FIELDS[field];
  const sliders = el('div', 'whatif-sliders');
  const slot = el('div', 'chart-body');
  const f = formatScore;
  const qalau = values.qalau;
  let guess = clampScore(Math.ceil(need - 1e-9));

  const fill = (v) => (field === 'avg' ? { ...values, rk1: v, rk2: v } : { ...values, [field]: v });

  const slider = buildSlider(field, `${name} — болжам`, guess, (v) => {
    guess = v;
    refresh(true);
  });
  sliders.append(slider.box);

  function refresh(quiet) {
    const filled = fill(guess);
    const score = getScore(filled.audi, filled.rk1, filled.rk2, filled.emtihan);
    const reached = score >= qalau - 1e-9;
    // Слайдер атауы мен мәні жоғарыда жазылған — мұнда тек нәтиже (бір жолға сыйсын)
    const legend = reached
      ? `Қорытынды ${f(score)}: қалаған бағаға жетесіз.`
      : `Қорытынды ${f(score)}: ${formatNeed(qalau - score)} балл жетпейді.`;
    const needEnd = clampScore(need);
    slider.update(guess, needEnd, needEnd, legend);

    // Басты карточка да слайдерге ілеседі; ең аз керек балл — ескертпеде
    renderNeed({
      label: `${short} ${guess} болса, қорытынды`, // карточкада бір жолға сыйсын
      value: score.toFixed(2),
      pill: reached
        ? { tone: 'ok', text: 'Қалаған бағаға жетесіз ↑' }
        : { tone: 'bad', text: `${formatNeed(qalau - score)} балл жетпейді ↓` },
      note: need <= MIN_SCORE
        ? `${name.toLowerCase()} 0 болса да жетесіз`
        : `керек: ${name.toLowerCase()} ≥ ${formatNeed(need)}`,
    }, { quiet });

    const guessed = rows.map((r) => ({ ...r }));
    const value = row === 2 ? filled.emtihan * WEIGHTS.exam : (filled.rk1 + filled.rk2) * WEIGHTS.module;
    guessed[row] = {
      ...rows[row],
      value,
      guess: true,
      tip: `Бұл — болжам: ${name.toLowerCase()} = ${guess}, қорытындыға ${f(value)} балл қосады. Қалаған бағаға жету үшін кемінде ${formatNeed(need)} керек.`,
    };
    hideTip();
    slot.replaceChildren(...renderSummary(guessed, qalau));
  }

  refresh(false);
  return [sliders, slot];
}

function renderChart(model) {
  hideTip();
  chart.replaceChildren();
  if (!model) {
    $('chart-title-text').textContent = TEXT.partsTitle;
    chart.append(el('p', 'muted', TEXT.chartEmpty));
    return;
  }
  const { chart: data, target } = model;
  if (data.type === 'whatif') {
    const ids = Object.keys(data.guesses);
    $('chart-title-text').textContent = ids.length > 1 ? 'Модульдер болжамы' : `${FIELDS[ids[0]]} болжамы`;
    chart.append(...renderWhatIf(data));
  } else if (data.single) {
    $('chart-title-text').textContent = `${SINGLE_FIELDS[data.single.field].name} болжамы`;
    chart.append(...renderSingleWhatIf(data));
  } else {
    $('chart-title-text').textContent = TEXT.partsTitle;
    const body = el('div', 'chart-body');
    body.append(...renderSummary(data.rows, target));
    chart.append(body);
  }
  chart.append(el('p', 'chart-hint', TEXT.tipHint));
}

/* ---------- Түсіндірме (tooltip) ---------- */

const tooltip = $('tooltip');
let tipTarget = null;
const TIP_GAP = 10;
const TIP_EDGE = 8;

function showTip(target) {
  if (tipTarget && tipTarget !== target) tipTarget.removeAttribute('aria-describedby');
  tipTarget = target;
  tooltip.textContent = target.dataset.tip;
  tooltip.hidden = false;
  target.setAttribute('aria-describedby', 'tooltip');
  positionTip();
}

// Элементтің үстіне, ортасына; орын болмаса — астына
function positionTip() {
  if (!tipTarget) return;
  const box = tipTarget.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(TIP_EDGE, box.left + box.width / 2 - tip.width / 2),
    window.innerWidth - tip.width - TIP_EDGE,
  );
  let top = box.top - tip.height - TIP_GAP;
  if (top < TIP_EDGE) top = box.bottom + TIP_GAP;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTip() {
  if (!tipTarget) return;
  tipTarget.removeAttribute('aria-describedby');
  tipTarget = null;
  tooltip.hidden = true;
}

const tipOf = (event) => event.target.closest('[data-tip]');

chart.addEventListener('pointerover', (event) => {
  const target = tipOf(event);
  if (event.pointerType === 'mouse' && target) showTip(target);
});
chart.addEventListener('pointerout', (event) => {
  const target = tipOf(event);
  if (event.pointerType === 'mouse' && target && !target.contains(event.relatedTarget)) hideTip();
});
chart.addEventListener('focusin', (event) => {
  const target = tipOf(event);
  if (target) showTip(target);
});
chart.addEventListener('focusout', hideTip);
// Сенсорлы экранда — басқанда ашылады
chart.addEventListener('click', (event) => {
  const target = tipOf(event);
  if (target) showTip(target);
});
document.addEventListener('click', (event) => {
  if (tipTarget && !chart.contains(event.target)) hideTip();
});
window.addEventListener('scroll', positionTip, { passive: true });
window.addEventListener('resize', positionTip);

function showPlaceholder() {
  result.replaceChildren(el('p', 'muted', TEXT.placeholder));
  renderStats(null);
  renderChart(null);
}

/* ---------- Іске қосу ---------- */

function run({ silent = false } = {}) {
  const values = {};
  for (const id of Object.keys(FIELDS)) values[id] = readField(id);

  const error = validate(values, silent);
  const model = error ? { error } : compute(values);

  if (model.error) {
    // Ашылғанда: сақталған мән қате болса — себебін көрсетеміз, тек мақсат жоқ болса — бастапқы мәтін
    if (silent && !error) return showPlaceholder();
    if (model.focus && !silent) $(model.focus).focus();
    renderNeed({ error: model.error });
    renderStats(null);
    renderChart(null);
  } else {
    renderNeed(model.need);
    renderStats(model);
    renderChart(model);
  }

  if (!silent) {
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    result.closest('.panel').scrollIntoView({ behavior: 'smooth', block: mobile ? 'start' : 'nearest' });
  }
}

function saveValues() {
  const data = {};
  for (const id of Object.keys(FIELDS)) data[id] = $(id).value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage қолжетімсіз (жеке режим) — сақтамаймыз
  }
}

// true — кемінде бір мән қалпына келтірілді
function restoreValues() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || typeof data !== 'object') return false;
    let restored = false;
    for (const id of Object.keys(FIELDS)) {
      if (typeof data[id] === 'string' && data[id] !== '') {
        $(id).value = data[id];
        restored = true;
      }
    }
    return restored;
  } catch {
    // бүлінген деректер немесе localStorage қолжетімсіз
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // елемейміз
    }
    return false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  run();
});

form.addEventListener('input', saveValues);

form.addEventListener('reset', () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // елемейміз
  }
  for (const id of Object.keys(FIELDS)) $(id).removeAttribute('aria-invalid');
  showPlaceholder();
  // Телефонда пернетақта өздігінен ашылмасын
  if (!window.matchMedia(MOBILE_QUERY).matches) $('audi').focus();
});

// Формула терезесін сыртқа басқанда немесе Esc арқылы жабу
const formula = document.querySelector('.formula');
document.addEventListener('click', (event) => {
  if (formula.open && !formula.contains(event.target)) formula.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideTip();
  if (event.key === 'Escape' && formula.open) {
    formula.open = false;
    formula.querySelector('summary').focus();
  }
});

if (restoreValues()) run({ silent: true });
