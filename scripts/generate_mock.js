const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const wb = XLSX.readFile(path.join(__dirname, '..', 'data', 'Hackaton_Enter_Base_Candidatos.xlsx'));

// Sheet 1 - Processos
const procSheet = wb.Sheets['Resultados dos processos'];
const allProc = XLSX.utils.sheet_to_json(procSheet, { defval: null });

// Sheet 2 - Subsídios (read raw to handle header)
const subsSheet = wb.Sheets['Subsídios disponibilizados'];
const allSubs = XLSX.utils.sheet_to_json(subsSheet, { defval: null });

// Take first 20 processos
const sample = allProc.slice(0, 20);

// Extract subs for same processes (skip first row which is the real header row)
const subsData = allSubs.slice(1, 21); // rows 2-21 (skip the labels row)

console.log('SAMPLE PROC:', JSON.stringify(sample, null, 2));
console.log('\nSAMPLE SUBS:', JSON.stringify(allSubs.slice(0, 3), null, 2));
