/* CSV stays on this device. Imported observations remain editable drafts. */
(() => {
  const fields = [
    ['plant', 'Растение', ['plant_id', 'plant', 'растение', 'куст']],
    ['week', 'Неделя', ['week', 'неделя']],
    ['date', 'Дата', ['date', 'дата']],
    ['ripe', 'Спелые ягоды', ['ripe_count', 'ripe', 'спелые', 'спелые ягоды']],
    ['green', 'Зелёные ягоды', ['green_count', 'green', 'зеленые', 'зелёные', 'зелёные ягоды']],
    ['flowers', 'Цветы', ['flower_count', 'flowers', 'цветы']],
    ['leaves', 'Листья', ['leaf_count', 'leaves', 'листья']],
    ['stems', 'Цветоносы', ['peduncle_count', 'stems', 'цветоносы']],
    ['weight', 'Вес ягоды, г · необязательно', ['berry_weight_g', 'weight', 'вес', 'вес ягоды']]
  ];
  let csv = null;
  let readToken = 0;
  const originalAction = action;

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    let quoted = false;
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && (ch === '\n' || ch === '\r')) break;
      else if (!quoted && ch in counts) counts[ch]++;
    }
    const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (!counts[delimiter]) throw new Error('Не найден разделитель колонок. Используйте «;», запятую или табуляцию.');
    const records = [];
    let row = [], cell = '', inQuotes = false, closed = false, line = 1, start = 1;
    function finishCell() { row.push(cell.trim()); cell = ''; closed = false; }
    function finishRow() {
      finishCell();
      if (row.some(value => value !== '')) records.push({ cells: row, line: start });
      row = [];
      if (records.length > 5001) throw new Error('В одном файле допускается не более 5000 записей.');
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { inQuotes = false; closed = true; }
        } else { cell += ch; if (ch === '\n') line++; }
        continue;
      }
      if (ch === delimiter) { finishCell(); if (row.length > 50) throw new Error('В файле слишком много колонок: максимум 50.'); }
      else if (ch === '\n' || ch === '\r') {
        finishRow();
        if (ch === '\r' && text[i + 1] === '\n') i++;
        line++; start = line;
      } else if (ch === '"') {
        if (cell.trim() || closed) throw new Error('Строка ' + line + ': некорректные кавычки.');
        cell = ''; inQuotes = true;
      } else {
        if (closed && ch.trim()) throw new Error('Строка ' + line + ': после закрывающей кавычки нужен разделитель.');
        cell += ch;
      }
    }
    if (inQuotes) throw new Error('Строка ' + start + ': кавычка не закрыта.');
    if (cell || row.length || closed) finishRow();
    if (!records.length) throw new Error('Файл пуст. Добавьте заголовки и хотя бы одну запись.');
    if (records.some(record => record.cells.length > 50)) throw new Error('В файле допускается не более 50 колонок.');
    return { records, delimiter };
  }

  function columnNames() {
    const width = Math.max(...csv.records.map(r => r.cells.length));
    return Array.from({ length: width }, (_, i) => csv.header ? csv.records[0].cells[i] || 'Колонка ' + (i + 1) : 'Колонка ' + (i + 1));
  }
  function suggestMapping() {
    const names = columnNames().map(name => name.trim().toLowerCase());
    csv.mapping = Object.fromEntries(fields.map(([key, , aliases], i) => [key, csv.header ? names.findIndex(name => aliases.includes(name)) : i < names.length ? i : -1]));
  }
  function checkImport() {
    if (!csv) return { rows: [], valid: [], errors: [], mappingError: 'Сначала выберите файл.' };
    const required = fields.filter(([key]) => key !== 'weight');
    const missing = required.filter(([key]) => csv.mapping[key] < 0);
    const mapped = Object.values(csv.mapping).filter(index => index >= 0);
    let mappingError = missing.length ? 'Выберите колонки: ' + missing.map(([, name]) => name).join(', ') + '.' : '';
    if (new Set(mapped).size !== mapped.length) mappingError = 'Одна колонка назначена нескольким полям. Выберите разные колонки.';
    if (mappingError) return { rows: [], valid: [], errors: [], mappingError };
    const data = csv.records.slice(csv.header ? 1 : 0);
    const rows = data.map(record => {
      const draft = Object.fromEntries(fields.map(([key]) => [key, record.cells[csv.mapping[key]] ?? '']));
      if (draft.weight) draft.weight = draft.weight.replace(',', '.');
      const plant = DATA.plants.find(p => p.id === draft.plant);
      let error = !plant ? 'Растение с таким ID не найдено.' : validateDraft(draft);
      const key = draft.plant + ':' + Number(draft.week);
      if (!error && state.drafts.some(d => d.plant === draft.plant && Number(d.week) === Number(draft.week))) error = 'Измерение этого растения и недели уже есть в черновике.';
      return { line: record.line, draft, key, error, imported: csv.imported.has(record.line) };
    });
    const frequencies = new Map();
    rows.filter(row => !row.imported).forEach(row => frequencies.set(row.key, (frequencies.get(row.key) || 0) + 1));
    rows.forEach(row => { if (!row.imported && frequencies.get(row.key) > 1) row.error = 'В файле несколько записей для этого растения и недели. Удалите повтор в исходном файле.'; });
    return { rows, valid: rows.filter(row => !row.error && !row.imported), errors: rows.filter(row => row.error && !row.imported), mappingError: data.length ? '' : 'В файле только заголовок. Добавьте записи измерений.' };
  }

  pickFile = async function(file) {
    if (!file) return;
    const token = ++readToken;
    if (!/\.csv$/i.test(file.name)) { toast('Здесь доступен импорт CSV. Сохраните XLSX как CSV UTF-8 в Excel.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('Файл слишком большой. Максимальный размер — 2 МБ.'); return; }
    try {
      const parsed = parseCSV(await file.text());
      if (token !== readToken) return;
      const names = parsed.records[0].cells.map(value => value.trim().toLowerCase());
      const header = fields.some(([, , aliases]) => names.some(name => aliases.includes(name)));
      csv = { ...parsed, header, mapping: {}, imported: new Set() };
      suggestMapping();
      state.importFile = { name: file.name, size: file.size };
      state.importStep = 2;
      renderImport();
      addEvent('Прочитан CSV: ' + file.name);
    } catch (error) { toast(error.message || 'Не удалось прочитать CSV. Проверьте кодировку UTF-8.'); }
  };

  importHTML = function() {
    if (!csv && state.importStep !== 1) state.importStep = 1;
    const step = state.importStep;
    const stepper = `<div class="stepper" aria-label="Этап импорта"><span class="${step === 1 ? 'active' : ''}"><i>1</i>Файл</span><span class="${step === 2 ? 'active' : ''}"><i>2</i>Колонки</span><span class="${step === 3 ? 'active' : ''}"><i>3</i>Проверка</span></div>`;
    if (step === 1) return stepper + `<div class="dropzone" id="dropzone"><div class="upload-icon">${icon('upload')}</div><h3>Ваши наблюдения — в одном файле</h3><p>Перетащите CSV UTF-8 или выберите файл · до 2 МБ</p><button class="btn primary" data-action="pickfile">Выбрать CSV</button><input type="file" id="fileInput" class="hidden" accept=".csv,text/csv"><p>Файл обрабатывается на устройстве. На сервер ничего не отправляется.</p></div><p class="compact-note">Разделители: точка с запятой, запятая или табуляция. Для XLSX выберите в Excel «Сохранить как → CSV UTF-8». Импорт добавит записи в черновик для проверки.</p>`;
    const fileNote = `<div class="notice">${icon('file')}<div><b>${esc(state.importFile.name)}</b><br><span class="muted">${csv.records.length - (csv.header ? 1 : 0)} записей · CSV · данные остаются на устройстве</span></div></div>`;
    if (step === 2) {
      const names = columnNames();
      const preview = csv.records.slice(csv.header ? 1 : 0, (csv.header ? 1 : 0) + 3);
      return stepper + fileNote + `<div class="switchline"><label for="csvHeader">Первая строка содержит названия колонок</label><input id="csvHeader" type="checkbox" ${csv.header ? 'checked' : ''}></div><div class="mapping">${fields.map(([key, label]) => `<label>${label}<select data-csv-field="${key}" aria-label="Колонка ${label}"><option value="-1">${key === 'weight' ? 'Не использовать' : 'Выберите колонку'}</option>${names.map((name, index) => `<option value="${index}" ${csv.mapping[key] === index ? 'selected' : ''}>${index + 1}. ${esc(name)}</option>`).join('')}</select></label>`).join('')}</div><p class="compact-note">Растение задаётся полным ID из паспорта, например ${esc(DATA.plants.find(p => p.season === Number($('season').value))?.id || '')}. Дата должна соответствовать неделе сезона. Пустое обязательное поле не считается нулём. Конфликты будут показаны перед импортом.</p><div class="table-scroll"><table class="data-table"><caption style="text-align:left;padding-top:18px">Первые строки файла</caption><thead><tr>${names.map(name => `<th>${esc(name)}</th>`).join('')}</tr></thead><tbody>${preview.map(record => `<tr>${names.map((_, index) => `<td>${esc(record.cells[index] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="actions section-gap"><button class="btn" data-import-step="1">Другой файл</button><button class="btn primary" data-import-step="3">Проверить данные</button></div>`;
    }
    const result = checkImport();
    return stepper + fileNote + (result.mappingError ? `<div class="notice amber" role="alert">${esc(result.mappingError)}</div>` : `<div class="actions section-gap"><span class="tag">Готово: ${result.valid.length}</span><span class="tag ${result.errors.length ? 'amber' : 'gray'}">С ошибками: ${result.errors.length}</span>${csv.imported.size ? `<span class="tag gray">Уже в черновике: ${csv.imported.size}</span>` : ''}</div><p class="compact-note section-gap">Будут добавлены только корректные строки. Строки с ошибками останутся в этом отчёте. История и модель не изменятся.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Строка</th><th>Растение</th><th>Неделя / дата</th><th>Спелые</th><th>Результат проверки</th></tr></thead><tbody>${result.rows.slice(0, 100).map(row => `<tr><td>${row.line}</td><td>${esc(row.draft.plant)}</td><td>${esc(row.draft.week)} / ${esc(row.draft.date)}</td><td>${esc(row.draft.ripe)}</td><td style="white-space:normal;min-width:180px"><span class="${row.error && !row.imported ? 'entry-error' : ''}">${row.imported ? 'Добавлено в черновик' : row.error ? esc(row.error) : 'Готово к импорту'}</span></td></tr>`).join('')}</tbody></table></div>${result.rows.length > 100 ? '<p class="compact-note">Показаны первые 100 строк. В проверке и импорте участвует весь файл.</p>' : ''}`) + `<div class="actions section-gap"><button class="btn" data-import-step="2">Назад к колонкам</button><button class="btn primary" data-action="confirmimport" ${!result.valid.length || result.mappingError ? 'disabled' : ''}>В черновик · ${result.valid.length}</button><button class="btn" data-action="importerrors" ${!result.errors.length ? 'disabled' : ''}>Скачать ошибки CSV</button><button class="btn" data-import-step="1">Другой файл</button></div>`;
  };

  action = function(name) {
    if (name === 'confirmimport') {
      const result = checkImport();
      if (result.mappingError || !result.valid.length) { toast(result.mappingError || 'Нет новых корректных строк.'); renderImport(); return; }
      result.valid.forEach(row => {
        state.drafts.push({ ...row.draft, week: Number(row.draft.week), source: 'csv_import' });
        csv.imported.add(row.line);
      });
      addEvent('CSV: в черновик добавлено ' + result.valid.length + ' записей.');
      state.measureTab = 'drafts';
      setView('measurements');
      toast('В черновике: ' + result.valid.length + '. ' + (result.errors.length ? 'Ошибок: ' + result.errors.length + '. Отчёт сохранён в разделе загрузки.' : 'Проверьте записи перед сохранением.'));
      return;
    }
    if (name === 'importerrors') {
      const result = checkImport();
      if (!result.errors.length) { toast('Ошибок нет.'); return; }
      const quote = value => {
        let text = String(value ?? '');
        if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      const rows = [['Строка', 'Растение', 'Неделя', 'Ошибка'], ...result.errors.map(row => [row.line, row.draft.plant, row.draft.week, row.error])];
      download('berry-import-errors.csv', rows.map(row => row.map(quote).join(';')).join('\r\n'));
      return;
    }
    return originalAction(name);
  };

  document.addEventListener('change', event => {
    if (!csv) return;
    if (event.target.matches('[data-csv-field]')) csv.mapping[event.target.dataset.csvField] = Number(event.target.value);
    if (event.target.id === 'csvHeader') {
      csv.header = event.target.checked;
      suggestMapping();
      renderImport();
    }
  });
  if (state.view === 'import') renderImport();
})();
