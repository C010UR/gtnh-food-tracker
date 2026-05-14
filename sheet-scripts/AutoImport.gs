const START_ROW = 5;

function checkFoodItems() {
  const html = HtmlService.createHtmlOutputFromFile('ImportDialog')
    .setWidth(600)
    .setHeight(400)
    .setTitle('Paste JSON (Spice of Life History)');
  SpreadsheetApp.getUi().showModalDialog(html, 'Import Foods');
}

function processImportedJson(rawInput) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('All');

  // --- Validate input ---
  if (typeof rawInput !== 'string' || rawInput.trim().length === 0) {
    ui.alert('❌ Invalid or empty input.');
    return;
  }

  let items;
  try {
    items = JSON.parse(rawInput.trim());
    if (!Array.isArray(items)) throw new Error('Expected a JSON array');
  } catch (e) {
    ui.alert('❌ Invalid JSON.\n' + e.message);
    return;
  }

  // --- Reset & populate 'All' sheet ---
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    ui.alert('No data rows found below row ' + START_ROW);
    return;
  }

  const rowCount = lastRow - START_ROW + 1;

  sheet.getRange(START_ROW, 2, rowCount)
    .setValues(Array.from({ length: rowCount }, () => [false]));

  const names = sheet.getRange(START_ROW, 3, rowCount).getValues().flat();
  const hungers = sheet.getRange(START_ROW, 5, rowCount).getValues().flat();

  const nameIndex = {};
  names.forEach((name, i) => {
    if (nameIndex[name] === undefined) nameIndex[name] = i;
  });

  const checks = Array(rowCount).fill(false);
  const warnings = [];

  items.forEach(item => {
    if (!item || typeof item.n !== 'string') return;
    const withMod = item.m ? `${item.n} ${item.m}` : null;
    const row = nameIndex[withMod] ?? nameIndex[item.n];

    if (row === undefined) {
      warnings.push(`Not found: ${item.n}${withMod ? ' / ' + withMod : ''}`);
      return;
    }

    if (item.h != null && !isNaN(item.h)) {
      const sheetHunger = Number(hungers[row]);
      if (sheetHunger !== Number(item.h)) {
        warnings.push(`Hunger mismatch: ${item.n} — JSON: ${item.h}, Sheet: ${sheetHunger}`);
      }
    }

    checks[row] = true;
  });

  sheet.getRange(START_ROW, 2, rowCount)
    .setValues(checks.map(v => [v]));

  // --- Reset & populate tier sheets ---
  const TIER_CONFIG = {
    'T1 (Raw)': { checkCols: [2, 7, 12, 17, 22], nameCols: [3, 8, 13, 18, 23] },
    'T2 (Basic)': { checkCols: [2, 7, 12, 17, 22, 27], nameCols: [3, 8, 13, 18, 23, 28] },
    'T3 (Intermediate)': { checkCols: [2, 7, 12, 17, 22], nameCols: [3, 8, 13, 18, 23] },
    'T4 (Advanced)': { checkCols: [2, 7, 12, 17, 22], nameCols: [3, 8, 13, 18, 23] },
    'Other': { checkCols: [2, 7, 12], nameCols: [3, 8, 13] },
  };

  Object.entries(TIER_CONFIG).forEach(([sheetName, { checkCols, nameCols }]) => {
    const target = ss.getSheetByName(sheetName);
    if (!target) return;

    const last = target.getLastRow();
    if (last < START_ROW) return;
    const rows = last - START_ROW + 1;

    const maps = nameCols.map(col => {
      const vals = target.getRange(START_ROW, col, rows).getValues().flat();
      const map = {};
      vals.forEach((name, i) => { if (name) map[name] = i; });
      return map;
    });

    const allChecks = checkCols.map(() => Array(rows).fill(false));

    items.forEach(item => {
      if (!item || typeof item.n !== 'string') return;
      const withMod = item.m ? `${item.n} ${item.m}` : null;

      maps.forEach((map, idx) => {
        const row = map[withMod] ?? map[item.n];
        if (row !== undefined) allChecks[idx][row] = true;
      });
    });

    checkCols.forEach((col, idx) => {
      target.getRange(START_ROW, col, rows)
        .setValues(allChecks[idx].map(v => [v]));
    });
  });

  // --- Report ---
  if (warnings.length) {
    ui.alert('⚠️ Issues:\n' + warnings.join('\n'));
  } else {
    ui.alert('✅ Import completed successfully!');
  }
}