const fs = require('fs');
// 1. Патч сервера (открываем маршруты для manager и добавляем сохранение)
const sPath = '/var/www/learning-platform/server.ts';
let s = fs.readFileSync(sPath, 'utf8');

['get', 'post', 'delete'].forEach(m => {
  const re = new RegExp(`app\\.${m}\("\\/api\\/admin\\/invites(.*?)"(,\\s*authMiddleware,\\s*)requireRole\\("admin"\)`);
  s = s.replace(re, `app.${m}(["/api/admin/invites$1", "/api/manager/invites$1"]$2requireRole("admin", "manager")`);
});

s = s.replace(/db\.phoneInvites\.push\(inv\);/, 'db.phoneInvites.push(inv);\n  if (typeof (db as any).save === "function") (db as any).save();');
s = s.replace(/db\.phoneInvites = db\.phoneInvites\.filter\(\(i\) => i\.id !== inviteId\);/, 'db.phoneInvites = db.phoneInvites.filter((i) => i.id !== inviteId);\n  if (typeof (db as any).save === "function") (db as any).save();');
fs.writeFileSync(sPath, s, 'utf8');

// 2. Патч панели методиста
const mPath = '/var/www/learning-platform/src/pages/ManagerPanel.jsx';
let m = fs.readFileSync(mPath, 'utf8');
if (!m.includes('InvitesTab')) {
  m = 'import InvitesTab from "../components/InvitesTab";\n' + m;
  m = m.replace(/\{\s*id:\s*"students",\s*label:\s*"Ученики"\s*\}/, '{ id: "students", label: "Ученики" },\n  { id: "invites", label: "Приглашения" }');
  m = m.replace(/\{tab === "students"[\s\S]*?]*\/>\}/, '$&\n      {tab === "invites" && }');
  fs.writeFileSync(mPath, m, 'utf8');
}
console.log("Успех: Права добавлены, вкладка подключена!");
