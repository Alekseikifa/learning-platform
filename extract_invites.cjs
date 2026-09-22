const fs = require('fs');
const path = '/var/www/learning-platform/src/pages/AdminPanel.jsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');

const start = lines.findIndex(l => l.includes('function InvitesTab() {'));
let end = start;
// Ищем закрывающую скобку функции
while (end < lines.length && !lines[end].startsWith('}')) {
  end++;
}

const componentCode = lines.slice(start, end + 1).join('\n');
const finalFile = 'import React, { useState, useEffect } from "react";\nimport { api } from "../api";\n\nexport default ' + componentCode;

fs.writeFileSync('/var/www/learning-platform/src/components/InvitesTab.jsx', finalFile, 'utf8');
console.log("Успех: файл InvitesTab.jsx полностью скопирован из файла админа!");
