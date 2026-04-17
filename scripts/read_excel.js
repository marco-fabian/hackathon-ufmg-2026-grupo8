const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'Hackaton_Enter_Base_Candidatos.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== SHEETS ===');
console.log(workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== SHEET: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  
  if (data.length > 0) {
    console.log('COLUMNS:', Object.keys(data[0]));
    console.log('FIRST 5 ROWS:');
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
  } else {
    console.log('(empty sheet)');
  }
});
