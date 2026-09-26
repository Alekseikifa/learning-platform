import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import {
  db,
  User,
  PhoneInvite,
  UploadedFile,
  ExtraMaterial,
  Material,
  StorageMaterial,
  getAllRolesOf,
  normalizePhone,
  notifyUsers,
} from "./src/server/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "dev-secret-change-me";
const ACCESS_TOKEN_MINUTES = parseInt(process.env.ACCESS_TOKEN_MINUTES || "1440", 10);

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(process.cwd(), "public")));

// Direct fallbacks for banner & warning graphics
app.get(["/Frame_28_1.png", "/Frame_28_1.svg"], (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "Frame_28_1.svg"));
});
app.get(["/Frame_34_1.png", "/Frame_34_1.svg"], (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "Frame_34_1.svg"));
});
app.get("/mku_logo.svg", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "mku_logo.svg"));
});

// Helper: JWT creation
function createToken(userId: number, activeRole: string, allRoles: string[]): string {
  return jwt.sign(
    {
      sub: String(userId),
      role: activeRole,
      roles: allRoles,
    },
    SECRET_KEY,
    { expiresIn: ACCESS_TOKEN_MINUTES * 60 }
  );
}

// Middleware: Auth
interface AuthRequest extends Request {
  user?: User;
  tokenPayload?: {
    sub: string;
    role: string;
    roles: string[];
  };
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Невалидный токен" });
  }
  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, SECRET_KEY) as {
      sub: string;
      role: string;
      roles: string[];
    };
    const user = db.users.find((u) => u.id === parseInt(payload.sub, 10));
    if (!user) {
      return res.status(401).json({ detail: "Пользователь не найден" });
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    return res.status(401).json({ detail: "Невалидный токен" });
  }
}

function hasRole(u: User, role: string): boolean {
  return getAllRolesOf(u).includes(role);
}

function isStudent(u: User): boolean {
  return u.role !== "admin" && hasRole(u, "student");
}

function isCurator(u: User): boolean {
  return u.role !== "admin" && hasRole(u, "teacher");
}

const ALLOWED_EXTRA_ROLES = ["teacher", "student", "manager"];

function normalizeExtraRoles(primaryRole: string, value: unknown): string {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(",")
    : [];
  const out: string[] = [];
  for (const item of raw) {
    const r = String(item).trim();
    if (!ALLOWED_EXTRA_ROLES.includes(r)) continue;
    if (r === primaryRole) continue;
    if (!out.includes(r)) out.push(r);
  }
  return out.join(",");
}

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.tokenPayload) {
      return res.status(401).json({ detail: "Необходима авторизация" });
    }
    const active = req.tokenPayload.role || req.user.role;
    const available = getAllRolesOf(req.user);
    if (!available.includes(active)) {
      return res.status(403).json({ detail: "Роль недоступна" });
    }
    if (!roles.some((r) => available.includes(r))) {
      return res.status(403).json({ detail: "Доступ запрещён" });
    }
    next();
  };
}

// -------------------------------------------------------------
// PUBLIC & HEALTH
// -------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/public/roles", (_req, res) => {
  const defaults: Record<string, string> = {
    role_admin_name: "Администратор",
    role_teacher_name: "Куратор",
    role_student_name: "Ученик",
    role_manager_name: "Методист",
  };
  const out: Record<string, string> = {};
  for (const [k, defaultVal] of Object.entries(defaults)) {
    const shortKey = k.replace("role_", "").replace("_name", "");
    out[shortKey] = db.settings[k] || defaultVal;
  }
  res.json(out);
});

app.get("/api/public/theme/:theme_id", (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) {
    return res.status(404).json({ detail: "Тема не найдена" });
  }
  const course = db.courses.find((c) => c.id === theme.course_id);
  res.json({
    id: theme.id,
    title: theme.title,
    order_index: theme.order_index,
    course_id: theme.course_id,
    course_title: course ? course.title : "",
  });
});

export function normalizeExtraMaterial(em: ExtraMaterial): ExtraMaterial {
  if (!Array.isArray(em.course_ids)) {
    em.course_ids = em.course_id ? [em.course_id] : [];
  }
  if (!Array.isArray(em.group_ids)) {
    em.group_ids = [];
  }
  return em;
}

export function getExtraMaterialDetails(em: ExtraMaterial) {
  normalizeExtraMaterial(em);
  const courses = db.courses
    .filter((c) => em.course_ids.includes(c.id) || (em.course_id && em.course_id === c.id))
    .map((c) => ({ id: c.id, title: c.title }));
  const groups = db.groups
    .filter((g) => em.group_ids.includes(g.id))
    .map((g) => ({ id: g.id, name: g.name, course_id: g.course_id }));

  const courseTitles = courses.map((c) => c.title);
  const groupNames = groups.map((g) => g.name);

  return {
    id: em.id,
    title: em.title,
    description: em.description || "",
    type: em.type,
    url: em.url,
    order_index: em.order_index,
    created_at: em.created_at,
    course_id: em.course_id || (em.course_ids[0] ?? null),
    course_title: courseTitles.join(", ") || "",
    course_ids: em.course_ids,
    group_ids: em.group_ids,
    courses,
    groups,
    course_titles: courseTitles,
    group_names: groupNames,
  };
}

export function canStudentAccessExtra(userId: number, em: ExtraMaterial): boolean {
  normalizeExtraMaterial(em);
  const myGids = db.groupStudents.filter((gs) => gs.user_id === userId).map((gs) => gs.group_id);
  if (em.group_ids.some((gid) => myGids.includes(gid))) return true;
  const myCourseIds = db.groups.filter((g) => myGids.includes(g.id)).map((g) => g.course_id);
  if (em.course_ids.some((cid) => myCourseIds.includes(cid))) return true;
  if (em.course_id && myCourseIds.includes(em.course_id)) return true;
  return false;
}

export function canTeacherAccessExtra(teacherId: number, em: ExtraMaterial): boolean {
  normalizeExtraMaterial(em);
  const tGids = db.groupTeachers.filter((gt) => gt.teacher_id === teacherId).map((gt) => gt.group_id);
  if (em.group_ids.some((gid) => tGids.includes(gid))) return true;
  const tCourseIds = db.groups.filter((g) => tGids.includes(g.id)).map((g) => g.course_id);
  if (em.course_ids.some((cid) => tCourseIds.includes(cid))) return true;
  if (em.course_id && tCourseIds.includes(em.course_id)) return true;
  return false;
}

app.get("/api/public/extra-material/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === id);
  if (!em) {
    return res.status(404).json({ detail: "Дополнительный материал не найден" });
  }
  res.json(getExtraMaterialDetails(em));
});

// -------------------------------------------------------------
// AUTH
// -------------------------------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ detail: "Неверный логин или пароль" });
  }
  const roles = getAllRolesOf(user);
  res.json({
    access_token: createToken(user.id, user.role, roles),
    role: user.role,
    roles,
    name: user.name,
  });
});

app.get("/api/auth/check-phone", (req, res) => {
  const phoneParam = req.query.phone as string;
  const phone = normalizePhone(phoneParam);
  if (!phone) {
    return res.status(400).json({ detail: "Введите номер телефона" });
  }
  const used = db.users.find((u) => u.username === phone);
  if (used) {
    return res.json({ available: false, reason: "already_registered" });
  }
  const invite = db.phoneInvites.find((i) => i.phone === phone);
  if (!invite) {
    return res.json({ available: false, reason: "no_invite" });
  }
  res.json({ available: true, role: invite.role });
});

app.post("/api/auth/register", (req, res) => {
  const { name, password, password_confirm, phone: rawPhone } = req.body;
  const cleanName = (name || "").trim();
  if (!cleanName) return res.status(400).json({ detail: "Введите ФИО" });
  if (password !== password_confirm) return res.status(400).json({ detail: "Пароли не совпадают" });
  if ((password || "").length < 4) return res.status(400).json({ detail: "Пароль слишком короткий" });

  const phone = normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ detail: "Введите номер телефона" });

  if (db.users.find((u) => u.username === phone)) {
    return res.status(400).json({ detail: "Этот номер уже зарегистрирован" });
  }

  const inviteIdx = db.phoneInvites.findIndex((i) => i.phone === phone);
  if (inviteIdx === -1) {
    return res.status(400).json({ detail: "Номер не найден в списке приглашений. Обратитесь к администратору." });
  }

  const invite = db.phoneInvites[inviteIdx];
  db.phoneInvites.splice(inviteIdx, 1);

  const newUser: User = {
    id: db.getId("user"),
    role: invite.role,
    extra_roles: "",
    username: phone,
    password_hash: bcrypt.hashSync(password, 10),
    name: cleanName,
  };
  db.users.push(newUser);

  const roles = getAllRolesOf(newUser);
  res.json({
    access_token: createToken(newUser.id, newUser.role, roles),
    role: newUser.role,
    roles,
    name: newUser.name,
  });
});

app.get("/api/auth/me", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const payload = req.tokenPayload!;
  res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    role: payload.role || user.role,
    roles: getAllRolesOf(user),
    extra_roles: user.extra_roles || "",
  });
});

app.post("/api/auth/switch-role", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { role } = req.body;
  const roles = getAllRolesOf(user);
  if (!roles.includes(role)) {
    return res.status(403).json({ detail: "Роль недоступна" });
  }
  res.json({
    access_token: createToken(user.id, role, roles),
    role,
    roles,
    name: user.name,
  });
});

// -------------------------------------------------------------
// NOTIFICATIONS
// -------------------------------------------------------------
app.get("/api/notifications", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const list = db.notifications
    .filter((n) => n.user_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)
    .map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read_at !== null,
      created_at: n.created_at,
    }));
  res.json(list);
});

app.get("/api/notifications/unread-count", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const count = db.notifications.filter((n) => n.user_id === user.id && n.read_at === null).length;
  res.json({ count });
});

app.post("/api/notifications/:notif_id/read", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const notifId = parseInt(req.params.notif_id, 10);
  const notif = db.notifications.find((n) => n.id === notifId && n.user_id === user.id);
  if (!notif) return res.status(404).json({ detail: "Уведомление не найдено" });
  if (!notif.read_at) notif.read_at = new Date().toISOString();
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const now = new Date().toISOString();
  for (const notif of db.notifications) {
    if (notif.user_id === user.id && !notif.read_at) {
      notif.read_at = now;
    }
  }
  res.json({ ok: true });
});

// -------------------------------------------------------------
// MESSAGES
// -------------------------------------------------------------
app.get("/api/messages/users", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const users = db.users
    .filter((u) => u.id !== user.id)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
    .map((u) => ({ id: u.id, name: u.name, role: u.role, username: u.username }));
  res.json(users);
});

app.get("/api/messages/conversations", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const otherIds = new Set<number>();
  for (const m of db.directMessages) {
    if (m.sender_id === user.id) otherIds.add(m.recipient_id);
    if (m.recipient_id === user.id) otherIds.add(m.sender_id);
  }

  const out = [];
  for (const oid of otherIds) {
    const other = db.users.find((u) => u.id === oid);
    if (!other) continue;
    const related = db.directMessages
      .filter(
        (m) =>
          (m.sender_id === user.id && m.recipient_id === oid) ||
          (m.sender_id === oid && m.recipient_id === user.id)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const last = related[0];
    const unread = db.directMessages.filter(
      (m) => m.sender_id === oid && m.recipient_id === user.id && m.read_at === null
    ).length;

    out.push({
      user_id: other.id,
      name: other.name,
      role: other.role,
      last_text: last ? last.text : "",
      last_at: last ? last.created_at : null,
      unread,
    });
  }

  out.sort((a, b) => new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime());
  res.json(out);
});

app.get("/api/messages/unread-count", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const count = db.directMessages.filter(
    (m) => m.recipient_id === user.id && m.read_at === null
  ).length;
  res.json({ count });
});

app.get("/api/messages/with/:other_id", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const otherId = parseInt(req.params.other_id, 10);
  const other = db.users.find((u) => u.id === otherId);
  if (!other) return res.status(404).json({ detail: "Пользователь не найден" });

  const messages = db.directMessages
    .filter(
      (m) =>
        (m.sender_id === user.id && m.recipient_id === otherId) ||
        (m.sender_id === otherId && m.recipient_id === user.id)
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const now = new Date().toISOString();
  for (const m of messages) {
    if (m.recipient_id === user.id && m.read_at === null) {
      m.read_at = now;
    }
  }

  res.json({
    other: { id: other.id, name: other.name, role: other.role },
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      created_at: m.created_at,
      is_mine: m.sender_id === user.id,
    })),
  });
});

app.post("/api/messages/with/:other_id", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const otherId = parseInt(req.params.other_id, 10);
  const other = db.users.find((u) => u.id === otherId);
  if (!other) return res.status(404).json({ detail: "Пользователь не найден" });

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Пустое сообщение" });

  const msgId = db.getId("directMessage");
  db.directMessages.push({
    id: msgId,
    sender_id: user.id,
    recipient_id: otherId,
    text,
    read_at: null,
    created_at: new Date().toISOString(),
  });

  const rolePath: Record<string, string> = {
    admin: "/admin",
    manager: "/manager",
    teacher: "/teacher",
    student: "/student",
  };
  const link = `${rolePath[other.role] || "/student"}?tab=messages&user=${user.id}`;
  notifyUsers([otherId], "dm", `Сообщение от ${user.name}`, text.slice(0, 160), link);

  res.json({ id: msgId });
});

// -------------------------------------------------------------
// ADMIN
// -------------------------------------------------------------
app.get("/api/admin/users", authMiddleware, requireRole("admin"), (_req, res) => {
  res.json(db.users.filter((u) => u.role !== "admin"));
});

app.post("/api/admin/users", authMiddleware, requireRole("admin"), (req, res) => {
  const { role, extra_roles, username, password, name } = req.body;
  if (!["teacher", "student", "manager"].includes(role)) {
    return res.status(400).json({ detail: "role must be teacher, student or manager" });
  }
  if (db.users.find((u) => u.username === username)) {
    return res.status(400).json({ detail: "Логин занят" });
  }
  const u: User = {
    id: db.getId("user"),
    role,
    extra_roles: normalizeExtraRoles(role, extra_roles),
    username,
    password_hash: bcrypt.hashSync(password, 10),
    name,
  };
  db.users.push(u);
  res.json(u);
});

app.put("/api/admin/users/:user_id", authMiddleware, requireRole("admin"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ detail: "Пользователь не найден" });

  const { name, username, role, extra_roles } = req.body;
  if (name !== undefined) u.name = name;
  if (username !== undefined) {
    if (db.users.find((x) => x.username === username && x.id !== userId)) {
      return res.status(400).json({ detail: "Логин занят" });
    }
    u.username = username;
  }
  if (role !== undefined && u.role !== "admin") {
    if (!["teacher", "student", "manager"].includes(role)) {
      return res.status(400).json({ detail: "Недопустимая роль" });
    }
    u.role = role;
    u.extra_roles = normalizeExtraRoles(u.role, u.extra_roles);
  }
  if (extra_roles !== undefined) u.extra_roles = normalizeExtraRoles(u.role, extra_roles);

  res.json(u);
});

app.put("/api/admin/users/:user_id/password", authMiddleware, requireRole("admin"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ detail: "Пользователь не найден" });
  u.password_hash = bcrypt.hashSync(req.body.password, 10);
  if (typeof (db as any).save === "function") (db as any).save();
  console.log("[Auth] Пароль пользователя ID " + userId + " успешно изменён и сохранён в базу");
  res.json({ ok: true });
});

app.delete("/api/admin/users/:user_id", authMiddleware, requireRole("admin"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const idx = db.users.findIndex((x) => x.id === userId);
  if (idx === -1 || db.users[idx].role === "admin") {
    return res.status(404).json({ detail: "Пользователь не найден" });
  }
  db.users.splice(idx, 1);
  // cleanup attempts & answers
  const attIds = db.attempts.filter((a) => a.user_id === userId).map((a) => a.id);
  db.attemptAnswers = db.attemptAnswers.filter((aa) => !attIds.includes(aa.attempt_id));
  db.attempts = db.attempts.filter((a) => a.user_id !== userId);
  db.groupStudents = db.groupStudents.filter((gs) => gs.user_id !== userId);
  db.groupTeachers = db.groupTeachers.filter((gt) => gt.teacher_id !== userId);
  db.chatMessages = db.chatMessages.filter((cm) => cm.user_id !== userId);
  res.json({ ok: true });
});

app.put(["/api/admin/credentials", "/api/admin/admin/credentials"], authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const targetUser = db.users.find((x) => x.id === req.user?.id) || db.users.find((x) => x.role === "admin");
  if (!targetUser) return res.status(404).json({ detail: "Пользователь не найден" });
  const { old_password, username, password } = req.body;
  if (!bcrypt.compareSync(old_password, targetUser.password_hash)) {
    return res.status(400).json({ detail: "Неверный текущий пароль" });
  }
  if (username && username.trim() && username !== targetUser.username) {
    if (db.users.find((x) => x.username === username && x.id !== targetUser.id)) {
      return res.status(400).json({ detail: "Логин занят" });
    }
    targetUser.username = username.trim();
  }
  if (password && password.trim()) {
    targetUser.password_hash = bcrypt.hashSync(password.trim(), 10);
  }
  if (typeof (db as any).save === "function") (db as any).save();
  console.log("[Auth] Пароль администратора (" + targetUser.username + ") успешно обновлён и записан на диск!");
  res.json({ ok: true });
});

app.get(["/api/admin/invites", "/api/manager/invites"], authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  res.json([...db.phoneInvites].reverse());
});

app.post(["/api/admin/invites", "/api/manager/invites"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { phone: rawPhone, role, note } = req.body;
  if (!["teacher", "student", "manager"].includes(role)) {
    return res.status(400).json({ detail: "role must be teacher, student or manager" });
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ detail: "Введите номер телефона" });
  if (db.phoneInvites.find((i) => i.phone === phone)) {
    return res.status(400).json({ detail: "Этот номер уже приглашён" });
  }
  if (db.users.find((u) => u.username === phone)) {
    return res.status(400).json({ detail: "Этот номер уже зарегистрирован" });
  }
  const inv: PhoneInvite = {
    id: db.getId("phoneInvite"),
    phone,
    role,
    note: note || "",
    created_at: new Date().toISOString(),
  };
  db.phoneInvites.push(inv);
  if (typeof (db as any).save === "function") (db as any).save();
  res.json(inv);
});

app.delete(["/api/admin/invites/:invite_id", "/api/manager/invites/:invite_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const inviteId = parseInt(req.params.invite_id, 10);
  db.phoneInvites = db.phoneInvites.filter((i) => i.id !== inviteId);
  if (typeof (db as any).save === "function") (db as any).save();
  res.json({ ok: true });
});

app.get("/api/settings/public", (_req, res) => {
  const defaults: Record<string, string> = {
    college_name: "МКУ — Международные Курсы Ученичества",
    welcome_title: "Добро пожаловать в МКУ!",
    welcome_text: "Мы верим, что время обучения станет для вас поистине особенным временем.\nПусть Дух Святой работает с вашим сердцем на этом пути, а жизнь изменяется!",
    welcome_enabled: "true",
    warning_title: "Уважаемые студенты!",
    warning_text: "Обращаем ваше внимание, что копирование и распространение материалов обучения (конспекты, видео и аудио-уроки) запрещено.\nВы можете использовать материалы в целях собственного обучения, а также сохранять на личные устройства, без передачи третьим лицам. Надеемся на ваше понимание и благословляем на плодотворную учебу!",
    warning_enabled: "true",
    show_header_banner: "true",
    role_admin_name: "Администратор",
    role_teacher_name: "Куратор",
    role_student_name: "Ученик",
    role_manager_name: "Методист",
  };
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(defaults)) {
    out[k] = db.settings[k] || d;
  }
  res.json(out);
});

app.get("/api/admin/settings", authMiddleware, requireRole("admin"), (_req, res) => {
  const defaults: Record<string, string> = {
    college_name: "МКУ — Международные Курсы Ученичества",
    welcome_title: "Добро пожаловать в МКУ!",
    welcome_text: "Мы верим, что время обучения станет для вас поистине особенным временем.\nПусть Дух Святой работает с вашим сердцем на этом пути, а жизнь изменяется!",
    welcome_enabled: "true",
    warning_title: "Уважаемые студенты!",
    warning_text: "Обращаем ваше внимание, что копирование и распространение материалов обучения (конспекты, видео и аудио-уроки) запрещено.\nВы можете использовать материалы в целях собственного обучения, а также сохранять на личные устройства, без передачи третьим лицам. Надеемся на ваше понимание и благословляем на плодотворную учебу!",
    warning_enabled: "true",
    show_header_banner: "true",
    default_passing_score: "70",
    allow_review_answers: "true",
    notify_curators_on_test: "true",
    role_admin_name: "Администратор",
    role_teacher_name: "Куратор",
    role_student_name: "Ученик",
    role_manager_name: "Методист",
  };
  const settings: Record<string, string> = {};
  for (const [k, d] of Object.entries(defaults)) {
    settings[k] = db.settings[k] || d;
  }
  const stats = {
    total_students: db.users.filter((u) => isStudent(u)).length,
    total_curators: db.users.filter((u) => isCurator(u)).length,
    total_courses: db.courses.length,
    total_groups: db.groups.length,
    total_themes: db.themes.length,
    total_tests: db.tests.length,
    total_attempts: db.attempts.length,
  };
  res.json({ settings, stats });
});

app.put("/api/admin/settings", authMiddleware, requireRole("admin"), (req, res) => {
  const incoming = req.body || {};
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      db.settings[k] = String(v);
    }
  }
  res.json({ ok: true });
});

app.get("/api/admin/backup", authMiddleware, requireRole("admin"), (_req, res) => {
  const dump = {
    exported_at: new Date().toISOString(),
    settings: db.settings,
    courses: db.courses,
    groups: db.groups,
    groupTeachers: db.groupTeachers,
    groupStudents: db.groupStudents,
    themes: db.themes,
    materials: db.materials,
    extraMaterials: db.extraMaterials,
    storageMaterials: db.storageMaterials,
    tests: db.tests,
    questions: db.questions,
    answers: db.answers,
    attempts: db.attempts,
    attemptAnswers: db.attemptAnswers,
    announcements: db.announcements,
    announcementTargets: db.announcementTargets,
    chatMessages: db.chatMessages,
    uploadedFiles: db.uploadedFiles,
    phoneInvites: db.phoneInvites,
    notifications: db.notifications,
    directMessages: db.directMessages,
    themeUnlocks: db.themeUnlocks,
    users: db.users,
    nextId: (db as any).nextId,
  };
  res.setHeader("Content-Disposition", `attachment; filename=mku-backup-${Date.now()}.json`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(dump, null, 2));
});

// -------------------------------------------------------------
// RESTORE DATABASE FROM A BACKUP FILE (admin)
// -------------------------------------------------------------
const RESTORE_ARRAY_KEYS = [
  "courses", "groups", "groupTeachers", "groupStudents", "themes", "materials",
  "extraMaterials", "storageMaterials", "tests", "questions", "answers", "attempts",
  "attemptAnswers", "announcements", "announcementTargets", "chatMessages",
  "uploadedFiles", "phoneInvites", "notifications", "directMessages", "themeUnlocks", "users",
];
const RESTORE_ALL_KEYS = [...RESTORE_ARRAY_KEYS, "settings", "nextId"];

const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.post(
  "/api/admin/restore",
  authMiddleware,
  requireRole("admin"),
  restoreUpload.single("file"),
  (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ detail: "Файл не передан" });

    let parsed: any;
    try {
      parsed = JSON.parse(req.file.buffer.toString("utf-8"));
    } catch {
      return res.status(400).json({ detail: "Файл не является валидным JSON" });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return res.status(400).json({ detail: "Ожидался JSON-объект" });
    }

    const errors: string[] = [];
    for (const key of RESTORE_ARRAY_KEYS) {
      if (key in parsed && !Array.isArray(parsed[key])) {
        errors.push(`«${key}» должен быть массивом`);
      }
    }
    if ("settings" in parsed && (!parsed.settings || typeof parsed.settings !== "object" || Array.isArray(parsed.settings))) {
      errors.push("«settings» должен быть объектом");
    }
    if ("nextId" in parsed && (!parsed.nextId || typeof parsed.nextId !== "object" || Array.isArray(parsed.nextId))) {
      errors.push("«nextId» должен быть объектом");
    }

    if (Array.isArray(parsed.users)) {
      const seenIds = new Set<number>();
      const seenNames = new Set<string>();
      let noPassword = 0;
      parsed.users.forEach((u: any, i: number) => {
        if (!u || typeof u.id !== "number") errors.push(`users[${i}]: нет числового id`);
        else if (seenIds.has(u.id)) errors.push(`users[${i}]: дублируется id ${u.id}`);
        else seenIds.add(u.id);
        if (!u || !u.username) errors.push(`users[${i}]: нет username`);
        else if (seenNames.has(u.username)) errors.push(`users[${i}]: дубль username «${u.username}»`);
        else seenNames.add(u.username);
        if (!u || !u.password_hash) noPassword++;
      });
      if (noPassword) errors.push(`users: у ${noPassword} учёток нет пароля (выгрузка старой версии?)`);
    }

    for (const key of RESTORE_ARRAY_KEYS) {
      if (key === "users" || !Array.isArray(parsed[key])) continue;
      const seen = new Set<number>();
      for (const item of parsed[key]) {
        if (item && typeof item.id === "number") {
          if (seen.has(item.id)) {
            errors.push(`«${key}»: дублируется id ${item.id}`);
            break;
          }
          seen.add(item.id);
        }
      }
    }

    if (errors.length) {
      const shown = errors.slice(0, 3).join("; ");
      const rest = errors.length > 3 ? ` и ещё ${errors.length - 3}` : "";
      return res.status(400).json({ detail: `Файл не прошёл проверку: ${shown}${rest}`, errors });
    }

    const warnings: string[] = [];
    const userRefs = new Set((Array.isArray(parsed.users) ? parsed.users : []).map((u: any) => u.id));
    const testRefs = new Set((Array.isArray(parsed.tests) ? parsed.tests : []).map((t: any) => t.id));
    const groupRefs = new Set((Array.isArray(parsed.groups) ? parsed.groups : []).map((g: any) => g.id));
    const courseRefs = new Set((Array.isArray(parsed.courses) ? parsed.courses : []).map((c: any) => c.id));
    const danglingAttempts = (Array.isArray(parsed.attempts) ? parsed.attempts : [])
      .filter((a: any) => !testRefs.has(a.test_id) || !userRefs.has(a.user_id)).length;
    if (danglingAttempts) warnings.push(`попыток с несуществующими тестами/учениками: ${danglingAttempts}`);
    const danglingGs = (Array.isArray(parsed.groupStudents) ? parsed.groupStudents : [])
      .filter((gs: any) => !groupRefs.has(gs.group_id) || !userRefs.has(gs.user_id)).length;
    if (danglingGs) warnings.push(`привязок «группа↔ученик» с битыми ссылками: ${danglingGs}`);
    const danglingThemes = (Array.isArray(parsed.themes) ? parsed.themes : [])
      .filter((t: any) => !courseRefs.has(t.course_id)).length;
    if (danglingThemes) warnings.push(`тем с несуществующим курсом: ${danglingThemes}`);

    try {
      const src = "/var/www/learning-platform/data/database.json";
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, "/var/www/learning-platform/data/database.before-restore.json");
      }
    } catch (e) {
      console.error("[restore] Не удалось сохранить копию текущей базы:", e);
    }

    const dbAny = db as any;
    const restored: Record<string, number> = {};
    for (const key of RESTORE_ARRAY_KEYS) {
      if (Array.isArray(parsed[key])) {
        dbAny[key] = parsed[key];
        restored[key] = parsed[key].length;
      }
    }
    if (parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)) {
      dbAny.settings = parsed.settings;
      restored.settings = Object.keys(parsed.settings).length;
    }
    if (parsed.nextId && typeof parsed.nextId === "object" && !Array.isArray(parsed.nextId)) {
      dbAny.nextId = { ...dbAny.nextId, ...parsed.nextId };
    }
    const skipped = RESTORE_ALL_KEYS.filter((k) => !(k in parsed));
    dbAny.save();

    console.log(`[restore] База восстановлена из файла (${req.file.originalname}), затронуто ключей: ${Object.keys(restored).length}`);
    res.json({ ok: true, restored, skipped, warnings });
  }
);

app.get("/api/admin/settings/roles", authMiddleware, requireRole("admin"), (_req, res) => {
  const defaults: Record<string, string> = {
    role_admin_name: "Администратор",
    role_teacher_name: "Куратор",
    role_student_name: "Ученик",
    role_manager_name: "Методист",
  };
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(defaults)) {
    out[k] = db.settings[k] || d;
  }
  res.json(out);
});

app.put("/api/admin/settings/roles", authMiddleware, requireRole("admin"), (req, res) => {
  const { admin, teacher, student, manager } = req.body;
  if (admin !== undefined) db.settings["role_admin_name"] = admin;
  if (teacher !== undefined) db.settings["role_teacher_name"] = teacher;
  if (student !== undefined) db.settings["role_student_name"] = student;
  if (manager !== undefined) db.settings["role_manager_name"] = manager;
  res.json({ ok: true });
});

app.get(["/api/admin/courses", "/api/manager/courses"], authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const out = [...db.courses]
    .sort((a, b) => (a.order_index ?? a.id) - (b.order_index ?? b.id))
    .map((c) => {
      const themes = db.themes
        .filter((t) => t.course_id === c.id)
        .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
        .map((t) => ({ id: t.id, title: t.title, order_index: t.order_index }));
      const extra_materials = db.extraMaterials
        .filter((em) => {
          normalizeExtraMaterial(em);
          return em.course_ids.includes(c.id) || em.course_id === c.id;
        })
        .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
        .map((em) => getExtraMaterialDetails(em));
      const groups = db.groups
        .filter((g) => g.course_id === c.id)
        .sort((a, b) => a.id - b.id)
        .map((g) => ({ id: g.id, name: g.name }));
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        order_index: c.order_index ?? c.id,
        themes,
        extra_materials,
        groups,
      };
    });
  res.json(out);
});

app.post(["/api/admin/courses", "/api/manager/courses"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { title, description, order_index } = req.body;
  const id = db.getId("course");
  const nextOrder = order_index !== undefined && order_index !== "" ? Number(order_index) : db.courses.length + 1;
  db.courses.push({ id, title, description: description || "", order_index: nextOrder });
  res.json({ id });
});

app.put(["/api/admin/courses/:course_id", "/api/manager/courses/:course_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const c = db.courses.find((x) => x.id === courseId);
  if (!c) return res.status(404).json({ detail: "Курс не найден" });
  if (req.body.title !== undefined) c.title = req.body.title;
  if (req.body.description !== undefined) c.description = req.body.description || "";
  if (req.body.order_index !== undefined) c.order_index = Number(req.body.order_index);
  res.json({ ok: true });
});

app.delete(["/api/admin/courses/:course_id", "/api/manager/courses/:course_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const themeIds = db.themes.filter((t) => t.course_id === courseId).map((t) => t.id);
  const testIds = db.tests.filter((t) => themeIds.includes(t.theme_id)).map((t) => t.id);
  const qIds = db.questions.filter((q) => testIds.includes(q.test_id)).map((q) => q.id);
  const attIds = db.attempts.filter((a) => testIds.includes(a.test_id)).map((a) => a.id);
  const groupIds = db.groups.filter((g) => g.course_id === courseId).map((g) => g.id);

  db.attemptAnswers = db.attemptAnswers.filter((aa) => !attIds.includes(aa.attempt_id));
  db.attempts = db.attempts.filter((a) => !testIds.includes(a.test_id));
  db.answers = db.answers.filter((a) => !qIds.includes(a.question_id));
  db.questions = db.questions.filter((q) => !testIds.includes(q.test_id));
  db.tests = db.tests.filter((t) => !themeIds.includes(t.theme_id));
  db.materials = db.materials.filter((m) => !themeIds.includes(m.theme_id));
  db.chatMessages = db.chatMessages.filter((cm) => !themeIds.includes(cm.theme_id));
  db.themes = db.themes.filter((t) => t.course_id !== courseId);

  const extraIds = db.extraMaterials.filter((em) => em.course_id === courseId).map((em) => em.id);
  db.chatMessages = db.chatMessages.filter((cm) => !extraIds.includes(cm.extra_material_id as number));
  db.extraMaterials = db.extraMaterials.filter((em) => em.course_id !== courseId);

  const annIds = db.announcementTargets.filter((at) => groupIds.includes(at.group_id)).map((at) => at.announcement_id);
  db.announcementTargets = db.announcementTargets.filter((at) => !groupIds.includes(at.group_id));
  db.announcements = db.announcements.filter((a) => !annIds.includes(a.id));
  db.groupTeachers = db.groupTeachers.filter((gt) => !groupIds.includes(gt.group_id));
  db.groupStudents = db.groupStudents.filter((gs) => !groupIds.includes(gs.group_id));
  db.groups = db.groups.filter((g) => g.course_id !== courseId);
  db.courses = db.courses.filter((c) => c.id !== courseId);

  res.json({ ok: true });
});

app.post(["/api/admin/themes", "/api/manager/themes"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { course_id, title, order_index } = req.body;
  const id = db.getId("theme");
  db.themes.push({ id, course_id, title, order_index: order_index || 0 });
  res.json({ id });
});

app.put(["/api/admin/themes/:theme_id", "/api/manager/themes/:theme_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const t = db.themes.find((x) => x.id === themeId);
  if (!t) return res.status(404).json({ detail: "Тема не найдена" });
  if (req.body.title !== undefined) t.title = req.body.title;
  if (req.body.order_index !== undefined) t.order_index = req.body.order_index;
  res.json({ ok: true });
});

app.delete(["/api/admin/themes/:theme_id", "/api/manager/themes/:theme_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const testIds = db.tests.filter((t) => t.theme_id === themeId).map((t) => t.id);
  const qIds = db.questions.filter((q) => testIds.includes(q.test_id)).map((q) => q.id);
  const attIds = db.attempts.filter((a) => testIds.includes(a.test_id)).map((a) => a.id);

  db.attemptAnswers = db.attemptAnswers.filter((aa) => !attIds.includes(aa.attempt_id));
  db.attempts = db.attempts.filter((a) => !testIds.includes(a.test_id));
  db.answers = db.answers.filter((a) => !qIds.includes(a.question_id));
  db.questions = db.questions.filter((q) => !testIds.includes(q.test_id));
  db.tests = db.tests.filter((t) => t.theme_id !== themeId);
  db.materials = db.materials.filter((m) => m.theme_id !== themeId);
  db.chatMessages = db.chatMessages.filter((cm) => cm.theme_id !== themeId);
  db.themes = db.themes.filter((t) => t.id !== themeId);
  res.json({ ok: true });
});

app.get("/api/admin/groups/:course_id", authMiddleware, requireRole("admin"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const groups = db.groups.filter((g) => g.course_id === courseId);
  const out = groups.map((g) => {
    const tIds = db.groupTeachers.filter((gt) => gt.group_id === g.id).map((gt) => gt.teacher_id);
    const sIds = db.groupStudents.filter((gs) => gs.group_id === g.id).map((gs) => gs.user_id);
    const teachers = db.users.filter((u) => tIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }));
    const students = db.users.filter((u) => sIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name, username: u.username }));
    return {
      id: g.id,
      name: g.name,
      course_id: g.course_id,
      teachers,
      students,
    };
  });
  res.json(out);
});

app.post("/api/admin/groups", authMiddleware, requireRole("admin"), (req, res) => {
  const { course_id, name } = req.body;
  const id = db.getId("group");
  db.groups.push({ id, course_id, name });
  res.json({ id });
});

app.put("/api/admin/groups/:group_id", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const g = db.groups.find((x) => x.id === groupId);
  if (!g) return res.status(404).json({ detail: "Группа не найдена" });
  g.name = req.body.name;
  res.json({ ok: true });
});

app.delete("/api/admin/groups/:group_id", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const annIds = db.announcementTargets.filter((at) => at.group_id === groupId).map((at) => at.announcement_id);
  db.announcementTargets = db.announcementTargets.filter((at) => at.group_id !== groupId);
  db.announcements = db.announcements.filter((a) => !annIds.includes(a.id));
  db.groupTeachers = db.groupTeachers.filter((gt) => gt.group_id !== groupId);
  db.groupStudents = db.groupStudents.filter((gs) => gs.group_id !== groupId);
  db.groups = db.groups.filter((g) => g.id !== groupId);
  res.json({ ok: true });
});

app.post("/api/admin/groups/:group_id/teachers", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const teacherId = req.body.teacher_id;
  const t = db.users.find((u) => u.id === teacherId);
  if (!t || t.role === "admin" || !hasRole(t, "teacher")) {
    return res.status(400).json({ detail: "У пользователя нет роли куратора" });
  }
  if (!db.groupTeachers.find((gt) => gt.group_id === groupId && gt.teacher_id === teacherId)) {
    db.groupTeachers.push({ group_id: groupId, teacher_id: teacherId });
  }
  res.json({ ok: true });
});

app.delete("/api/admin/groups/:group_id/teachers/:teacher_id", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const teacherId = parseInt(req.params.teacher_id, 10);
  db.groupTeachers = db.groupTeachers.filter(
    (gt) => !(gt.group_id === groupId && gt.teacher_id === teacherId)
  );
  res.json({ ok: true });
});

app.post("/api/admin/groups/:group_id/students", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const userId = req.body.user_id;
  const s = db.users.find((u) => u.id === userId);
  if (!s || s.role === "admin" || !hasRole(s, "student")) {
    return res.status(400).json({ detail: "У пользователя нет роли ученика" });
  }
  if (!db.groupStudents.find((gs) => gs.group_id === groupId && gs.user_id === userId)) {
    db.groupStudents.push({ group_id: groupId, user_id: userId });
  }
  res.json({ ok: true });
});

app.delete("/api/admin/groups/:group_id/students/:user_id", authMiddleware, requireRole("admin"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const userId = parseInt(req.params.user_id, 10);
  db.groupStudents = db.groupStudents.filter(
    (gs) => !(gs.group_id === groupId && gs.user_id === userId)
  );
  res.json({ ok: true });
});

app.get(["/api/admin/themes/:theme_id/materials", "/api/manager/themes/:theme_id/materials"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const mats = db.materials
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  res.json(mats);
});

app.post(["/api/admin/materials", "/api/manager/materials"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { theme_id, title, type, url, order_index } = req.body;
  const id = db.getId("material");
  db.materials.push({ id, theme_id, title, type, url, order_index: order_index || 0 });
  res.json({ id });
});

app.put(["/api/admin/materials/:material_id", "/api/manager/materials/:material_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const matId = parseInt(req.params.material_id, 10);
  const m = db.materials.find((x) => x.id === matId);
  if (!m) return res.status(404).json({ detail: "Материал не найден" });
  Object.assign(m, req.body);
  res.json({ ok: true });
});

app.delete(["/api/admin/materials/:material_id", "/api/manager/materials/:material_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const matId = parseInt(req.params.material_id, 10);
  db.materials = db.materials.filter((m) => m.id !== matId);
  res.json({ ok: true });
});

// -------------------------------------------------------------
// EXTRA MATERIALS (ADMIN & MANAGER)
// -------------------------------------------------------------
app.get("/api/admin/courses/:course_id/extra-materials", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const mats = db.extraMaterials
    .filter((em) => {
      normalizeExtraMaterial(em);
      return em.course_ids.includes(courseId) || em.course_id === courseId;
    })
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map((em) => getExtraMaterialDetails(em));
  res.json(mats);
});

app.post("/api/admin/courses/:course_id/link-extra-material", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const materialId = parseInt(req.body.material_id, 10);
  const em = db.extraMaterials.find((x) => x.id === materialId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);
  if (!em.course_ids.includes(courseId)) {
    em.course_ids.push(courseId);
  }
  res.json(getExtraMaterialDetails(em));
});

app.post("/api/admin/courses/:course_id/unlink-extra-material", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const materialId = parseInt(req.body.material_id, 10);
  const em = db.extraMaterials.find((x) => x.id === materialId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);
  em.course_ids = em.course_ids.filter((cid) => cid !== courseId);
  if (em.course_id === courseId) {
    em.course_id = em.course_ids[0] || undefined;
  }
  res.json(getExtraMaterialDetails(em));
});

app.get("/api/admin/extra-materials", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const out = db.extraMaterials
    .map((em) => getExtraMaterialDetails(em))
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  res.json(out);
});

const handleCreateAdminExtraMaterial = (req: AuthRequest, res: Response) => {
  const { title, description, type, url, order_index, course_ids, group_ids, course_id } = req.body;
  const courseParamId = req.params?.course_id ? parseInt(req.params.course_id, 10) : undefined;
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) return res.status(400).json({ detail: "Введите название материала" });

  let cids: number[] = Array.isArray(course_ids) ? course_ids.map(Number) : [];
  if (course_id && !cids.includes(Number(course_id))) {
    cids.push(Number(course_id));
  }
  if (courseParamId && !cids.includes(courseParamId)) {
    cids.push(courseParamId);
  }
  let gids: number[] = Array.isArray(group_ids) ? group_ids.map(Number) : [];

  const id = db.getId("extraMaterial");
  const newEm: ExtraMaterial = {
    id,
    course_id: cids[0] || undefined,
    course_ids: cids,
    group_ids: gids,
    title: cleanTitle,
    description: description || "",
    type: type || "note",
    url: url || "",
    order_index: order_index !== undefined ? Number(order_index) : 0,
    created_at: new Date().toISOString(),
  };
  db.extraMaterials.push(newEm);

  // Notify students and teachers across all linked courses and groups
  const targetGroupIds = new Set<number>(gids);
  for (const cid of cids) {
    for (const g of db.groups.filter((x) => x.course_id === cid)) {
      targetGroupIds.add(g.id);
    }
  }

  const recipients = new Set<number>();
  for (const gid of targetGroupIds) {
    for (const gs of db.groupStudents.filter((x) => x.group_id === gid)) recipients.add(gs.user_id);
    for (const gt of db.groupTeachers.filter((x) => x.group_id === gid)) recipients.add(gt.teacher_id);
  }
  recipients.delete(req.user!.id);

  notifyUsers(
    Array.from(recipients),
    "announcement",
    `Новый дополнительный материал: «${newEm.title}»`,
    `Добавлен новый материал без тестов с открытым чатом обсуждения.`,
    `/student?extra_material=${id}`
  );

  res.json(getExtraMaterialDetails(newEm));
};

app.post("/api/admin/courses/:course_id/extra-materials", authMiddleware, requireRole("admin", "manager"), handleCreateAdminExtraMaterial);
app.post("/api/admin/extra-materials", authMiddleware, requireRole("admin", "manager"), handleCreateAdminExtraMaterial);

app.put("/api/admin/extra-materials/:id", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === id);
  if (!em) return res.status(404).json({ detail: "Дополнительный материал не найден" });
  normalizeExtraMaterial(em);

  if (req.body.title !== undefined) em.title = (req.body.title || "").trim();
  if (req.body.description !== undefined) em.description = req.body.description;
  if (req.body.type !== undefined) em.type = req.body.type;
  if (req.body.url !== undefined) em.url = req.body.url;
  if (req.body.order_index !== undefined) em.order_index = Number(req.body.order_index);
  if (Array.isArray(req.body.course_ids)) {
    em.course_ids = req.body.course_ids.map(Number);
    em.course_id = em.course_ids[0] || undefined;
  }
  if (Array.isArray(req.body.group_ids)) {
    em.group_ids = req.body.group_ids.map(Number);
  }
  res.json(getExtraMaterialDetails(em));
});

app.delete("/api/admin/extra-materials/:id", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.extraMaterials = db.extraMaterials.filter((x) => x.id !== id);
  db.chatMessages = db.chatMessages.filter((m) => m.extra_material_id !== id);
  res.json({ ok: true });
});

app.get(["/api/admin/themes/:theme_id/test", "/api/manager/themes/:theme_id/test"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const t = db.tests.find((x) => x.theme_id === themeId);
  if (!t) return res.json(null);
  const qs = db.questions
    .filter((q) => q.test_id === t.id)
    .map((q) => {
      const answers = db.answers
        .filter((a) => a.question_id === q.id)
        .map((a) => ({ id: a.id, text: a.text, is_correct: a.is_correct }));
      return { id: q.id, text: q.text, answers };
    });
  res.json({
    id: t.id,
    title: t.title,
    theme_id: t.theme_id,
    passing_score: t.passing_score,
    max_attempts: t.max_attempts,
    questions: qs,
  });
});

app.post(["/api/admin/tests", "/api/manager/tests"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { theme_id, title, passing_score, max_attempts } = req.body;
  if (db.tests.find((t) => t.theme_id === theme_id)) {
    return res.status(400).json({ detail: "У темы уже есть тест" });
  }
  const id = db.getId("test");
  db.tests.push({
    id,
    theme_id,
    title,
    passing_score: passing_score || 70,
    max_attempts: max_attempts || 0,
  });
  res.json({ id });
});

app.put(["/api/admin/tests/:test_id", "/api/manager/tests/:test_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const testId = parseInt(req.params.test_id, 10);
  const t = db.tests.find((x) => x.id === testId);
  if (!t) return res.status(404).json({ detail: "Тест не найден" });
  Object.assign(t, req.body);
  res.json({ ok: true });
});

app.delete(["/api/admin/tests/:test_id", "/api/manager/tests/:test_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const testId = parseInt(req.params.test_id, 10);
  const qIds = db.questions.filter((q) => q.test_id === testId).map((q) => q.id);
  const attIds = db.attempts.filter((a) => a.test_id === testId).map((a) => a.id);

  db.attemptAnswers = db.attemptAnswers.filter((aa) => !attIds.includes(aa.attempt_id));
  db.attempts = db.attempts.filter((a) => a.test_id !== testId);
  db.answers = db.answers.filter((a) => !qIds.includes(a.question_id));
  db.questions = db.questions.filter((q) => q.test_id !== testId);
  db.tests = db.tests.filter((t) => t.id !== testId);
  res.json({ ok: true });
});

app.post(["/api/admin/questions", "/api/manager/questions"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { test_id, text, answers } = req.body;
  if (!Array.isArray(answers) || answers.length < 2) {
    return res.status(400).json({ detail: "Должно быть минимум 2 ответа" });
  }
  if (answers.filter((a: any) => a.is_correct).length < 1) {
    return res.status(400).json({ detail: "Выберите хотя бы один правильный ответ" });
  }
  const qId = db.getId("question");
  db.questions.push({ id: qId, test_id, text });
  for (const a of answers) {
    db.answers.push({
      id: db.getId("answer"),
      question_id: qId,
      text: a.text,
      is_correct: !!a.is_correct,
    });
  }
  res.json({ id: qId });
});

app.put(["/api/admin/questions/:question_id", "/api/manager/questions/:question_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const questionId = parseInt(req.params.question_id, 10);
  const q = db.questions.find((x) => x.id === questionId);
  if (!q) return res.status(404).json({ detail: "Вопрос не найден" });
  if (req.body.text !== undefined) q.text = req.body.text;
  if (req.body.answers !== undefined) {
    const answers = req.body.answers;
    if (!Array.isArray(answers) || answers.length < 2 || answers.filter((a: any) => a.is_correct).length < 1) {
      return res.status(400).json({ detail: "Должно быть не менее 2 ответов и хотя бы один правильный" });
    }
    db.answers = db.answers.filter((a) => a.question_id !== questionId);
    for (const a of answers) {
      db.answers.push({
        id: db.getId("answer"),
        question_id: questionId,
        text: a.text,
        is_correct: !!a.is_correct,
      });
    }
  }
  res.json({ ok: true });
});

app.delete(["/api/admin/questions/:question_id", "/api/manager/questions/:question_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const questionId = parseInt(req.params.question_id, 10);
  db.answers = db.answers.filter((a) => a.question_id !== questionId);
  db.questions = db.questions.filter((q) => q.id !== questionId);
  res.json({ ok: true });
});

app.post("/api/admin/uploads", authMiddleware, requireRole("admin", "manager"), (upload.single("file") as any), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "Файл не загружен" });
  const rec: UploadedFile = {
    id: db.getId("uploadedFile"),
    filename: req.file.filename,
    original_name: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploaded_at: new Date().toISOString(),
  };
  db.uploadedFiles.push(rec);
  res.json(rec);
});

app.get("/api/admin/uploads", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  res.json([...db.uploadedFiles].reverse());
});

app.delete("/api/admin/uploads/:file_id", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const recIdx = db.uploadedFiles.findIndex((f) => f.id === fileId);
  if (recIdx === -1) return res.status(404).json({ detail: "Файл не найден" });
  const rec = db.uploadedFiles[recIdx];
  const filePath = path.join(UPLOAD_DIR, rec.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  db.uploadedFiles.splice(recIdx, 1);
  res.json({ ok: true });
});

// -------------------------------------------------------------
// MANAGER
// -------------------------------------------------------------
app.get("/api/manager/courses", authMiddleware, requireRole("manager"), (_req, res) => {
  const out = [...db.courses]
    .sort((a, b) => (a.order_index ?? a.id) - (b.order_index ?? b.id))
    .map((c) => {
      const themes = db.themes
        .filter((t) => t.course_id === c.id)
        .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
        .map((t) => ({ id: t.id, title: t.title, order_index: t.order_index }));
      const extra_materials = db.extraMaterials
        .filter((em) => {
          normalizeExtraMaterial(em);
          return em.course_ids.includes(c.id) || em.course_id === c.id;
        })
        .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
        .map((em) => getExtraMaterialDetails(em));
      const groups = db.groups
        .filter((g) => g.course_id === c.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ id: g.id, name: g.name }));
      return { id: c.id, title: c.title, description: c.description, order_index: c.order_index ?? c.id, themes, extra_materials, groups };
    });
  res.json(out);
});

app.get("/api/manager/users", authMiddleware, requireRole("manager"), (_req, res) => {
  const users = db.users
    .filter((u) => ["teacher", "student"].includes(u.role))
    .map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role }));
  res.json(users);
});

app.get("/api/manager/groups", authMiddleware, requireRole("manager"), (_req, res) => {
  const out = db.groups.map((g) => {
    const course = db.courses.find((c) => c.id === g.course_id);
    const tIds = db.groupTeachers.filter((gt) => gt.group_id === g.id).map((gt) => gt.teacher_id);
    const curators = db.users.filter((u) => tIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }));
    const sCount = db.groupStudents.filter((gs) => gs.group_id === g.id).length;
    return {
      id: g.id,
      name: g.name,
      course_id: g.course_id,
      course_title: course ? course.title : "",
      student_count: sCount,
      curators,
    };
  });
  res.json(out);
});

app.post("/api/manager/students", authMiddleware, requireRole("manager"), (req, res) => {
  const { name, username, password, group_ids } = req.body;
  const cleanName = (name || "").trim();
  const cleanUser = (username || "").trim();
  if (!cleanName || !cleanUser || !password) {
    return res.status(400).json({ detail: "Заполните ФИО, логин и пароль" });
  }
  if (db.users.find((u) => u.username === cleanUser)) {
    return res.status(400).json({ detail: "Логин занят" });
  }
  const id = db.getId("user");
  db.users.push({
    id,
    role: "student",
    extra_roles: "",
    username: cleanUser,
    password_hash: bcrypt.hashSync(password, 10),
    name: cleanName,
  });
  if (Array.isArray(group_ids)) {
    for (const gid of group_ids) {
      if (db.groups.find((g) => g.id === gid)) {
        db.groupStudents.push({ group_id: gid, user_id: id });
      }
    }
  }
  res.json({ id });
});

app.get("/api/manager/students", authMiddleware, requireRole("manager"), (_req, res) => {
  const students = db.users
    .filter((u) => isStudent(u))
    .sort((a, b) => a.name.localeCompare(b.name));
  const out = students.map((s) => {
    const gIds = db.groupStudents.filter((gs) => gs.user_id === s.id).map((gs) => gs.group_id);
    const groups = gIds
      .map((gid) => {
        const g = db.groups.find((x) => x.id === gid);
        if (!g) return null;
        const c = db.courses.find((x) => x.id === g.course_id);
        return { id: g.id, name: g.name, course: c ? c.title : "" };
      })
      .filter(Boolean);
    return { id: s.id, name: s.name, username: s.username, groups };
  });
  res.json(out);
});

app.put("/api/manager/students/:user_id", authMiddleware, requireRole("manager"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId && isStudent(x));
  if (!u) return res.status(404).json({ detail: "Ученик не найден" });
  if (req.body.name !== undefined) u.name = req.body.name;
  if (req.body.username !== undefined) {
    if (db.users.find((x) => x.username === req.body.username && x.id !== userId)) {
      return res.status(400).json({ detail: "Логин занят" });
    }
    u.username = req.body.username;
  }
  res.json({ ok: true });
});

app.put("/api/manager/students/:user_id/password", authMiddleware, requireRole("manager"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId && isStudent(x));
  if (!u) return res.status(404).json({ detail: "Ученик не найден" });
  u.password_hash = bcrypt.hashSync(req.body.password, 10);
  res.json({ ok: true });
});

app.post("/api/manager/students/:user_id/groups/:group_id", authMiddleware, requireRole("manager"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const groupId = parseInt(req.params.group_id, 10);
  const u = db.users.find((x) => x.id === userId && isStudent(x));
  const g = db.groups.find((x) => x.id === groupId);
  if (!u || !g) return res.status(404).json({ detail: "Не найдено" });
  if (!db.groupStudents.find((gs) => gs.group_id === groupId && gs.user_id === userId)) {
    db.groupStudents.push({ group_id: groupId, user_id: userId });
  }
  res.json({ ok: true });
});

app.delete("/api/manager/students/:user_id/groups/:group_id", authMiddleware, requireRole("manager"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const groupId = parseInt(req.params.group_id, 10);
  db.groupStudents = db.groupStudents.filter(
    (gs) => !(gs.group_id === groupId && gs.user_id === userId)
  );
  res.json({ ok: true });
});

app.get("/api/manager/themes/:theme_id/materials", authMiddleware, requireRole("manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const mats = db.materials
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  res.json(mats);
});

app.post("/api/manager/materials", authMiddleware, requireRole("manager"), (req, res) => {
  const { theme_id, title, type, url, order_index } = req.body;
  const id = db.getId("material");
  db.materials.push({ id, theme_id, title, type, url, order_index: order_index || 0 });
  res.json({ id });
});

app.put("/api/manager/materials/:material_id", authMiddleware, requireRole("manager"), (req, res) => {
  const matId = parseInt(req.params.material_id, 10);
  const m = db.materials.find((x) => x.id === matId);
  if (!m) return res.status(404).json({ detail: "Материал не найден" });
  Object.assign(m, req.body);
  res.json({ ok: true });
});

app.delete("/api/manager/materials/:material_id", authMiddleware, requireRole("manager"), (req, res) => {
  const matId = parseInt(req.params.material_id, 10);
  db.materials = db.materials.filter((m) => m.id !== matId);
  res.json({ ok: true });
});

app.get("/api/manager/extra-materials", authMiddleware, requireRole("manager"), (_req, res) => {
  const out = db.extraMaterials
    .map((em) => getExtraMaterialDetails(em))
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  res.json(out);
});

app.get("/api/manager/courses/:course_id/extra-materials", authMiddleware, requireRole("manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const mats = db.extraMaterials
    .filter((em) => {
      normalizeExtraMaterial(em);
      return em.course_ids.includes(courseId) || em.course_id === courseId;
    })
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map((em) => getExtraMaterialDetails(em));
  res.json(mats);
});

app.post("/api/manager/courses/:course_id/link-extra-material", authMiddleware, requireRole("manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const materialId = parseInt(req.body.material_id, 10);
  const em = db.extraMaterials.find((x) => x.id === materialId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);
  if (!em.course_ids.includes(courseId)) {
    em.course_ids.push(courseId);
  }
  res.json(getExtraMaterialDetails(em));
});

app.post("/api/manager/courses/:course_id/unlink-extra-material", authMiddleware, requireRole("manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const materialId = parseInt(req.body.material_id, 10);
  const em = db.extraMaterials.find((x) => x.id === materialId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);
  em.course_ids = em.course_ids.filter((cid) => cid !== courseId);
  if (em.course_id === courseId) {
    em.course_id = em.course_ids[0] || undefined;
  }
  res.json(getExtraMaterialDetails(em));
});

app.post("/api/manager/courses/:course_id/extra-materials", authMiddleware, requireRole("manager"), handleCreateAdminExtraMaterial);
app.post("/api/manager/extra-materials", authMiddleware, requireRole("manager"), handleCreateAdminExtraMaterial);

app.put("/api/manager/extra-materials/:id", authMiddleware, requireRole("manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === id);
  if (!em) return res.status(404).json({ detail: "Дополнительный материал не найден" });
  normalizeExtraMaterial(em);

  if (req.body.title !== undefined) em.title = (req.body.title || "").trim();
  if (req.body.description !== undefined) em.description = req.body.description;
  if (req.body.type !== undefined) em.type = req.body.type;
  if (req.body.url !== undefined) em.url = req.body.url;
  if (req.body.order_index !== undefined) em.order_index = Number(req.body.order_index);
  if (Array.isArray(req.body.course_ids)) {
    em.course_ids = req.body.course_ids.map(Number);
    em.course_id = em.course_ids[0] || undefined;
  }
  if (Array.isArray(req.body.group_ids)) {
    em.group_ids = req.body.group_ids.map(Number);
  }
  res.json(getExtraMaterialDetails(em));
});

app.delete("/api/manager/extra-materials/:id", authMiddleware, requireRole("manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.extraMaterials = db.extraMaterials.filter((x) => x.id !== id);
  db.chatMessages = db.chatMessages.filter((m) => m.extra_material_id !== id);
  res.json({ ok: true });
});

app.post("/api/manager/uploads", authMiddleware, requireRole("manager"), (upload.single("file") as any), (req, res) => {
  if (!req.file) return res.status(400).json({ detail: "Файл не загружен" });
  const rec: UploadedFile = {
    id: db.getId("uploadedFile"),
    filename: req.file.filename,
    original_name: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploaded_at: new Date().toISOString(),
  };
  db.uploadedFiles.push(rec);
  res.json(rec);
});

app.get("/api/manager/uploads", authMiddleware, requireRole("manager"), (_req, res) => {
  res.json([...db.uploadedFiles].reverse());
});

app.delete("/api/manager/uploads/:file_id", authMiddleware, requireRole("manager"), (req, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const recIdx = db.uploadedFiles.findIndex((f) => f.id === fileId);
  if (recIdx === -1) return res.status(404).json({ detail: "Файл не найден" });
  const rec = db.uploadedFiles[recIdx];
  const filePath = path.join(UPLOAD_DIR, rec.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  db.uploadedFiles.splice(recIdx, 1);
  res.json({ ok: true });
});

// -------------------------------------------------------------
// TEACHER
// -------------------------------------------------------------
function teacherGroupIds(teacherId: number): number[] {
  return db.groupTeachers.filter((gt) => gt.teacher_id === teacherId).map((gt) => gt.group_id);
}

function ownTeacherGroup(teacherId: number, groupId: number): boolean {
  const u = db.users.find((x) => x.id === teacherId);
  if (u && u.role === "admin") return true;
  return db.groupTeachers.some((gt) => gt.teacher_id === teacherId && gt.group_id === groupId);
}

function testIdsForGroups(groupIds: number[]): number[] {
  const courseIds = db.groups.filter((g) => groupIds.includes(g.id)).map((g) => g.course_id);
  const themeIds = db.themes.filter((t) => courseIds.includes(t.course_id)).map((t) => t.id);
  return db.tests.filter((t) => themeIds.includes(t.theme_id)).map((t) => t.id);
}

app.get("/api/teacher/courses", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const gids = teacherGroupIds(req.user!.id);
  const courseIds = [...new Set(db.groups.filter((g) => gids.includes(g.id)).map((g) => g.course_id))];
  const courses = db.courses
    .filter((c) => courseIds.includes(c.id))
    .map((c) => ({ id: c.id, title: c.title, description: c.description }));
  res.json(courses);
});

app.get("/api/teacher/groups", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const gids = teacherGroupIds(req.user!.id);
  const out = db.groups
    .filter((g) => gids.includes(g.id))
    .map((g) => {
      const c = db.courses.find((x) => x.id === g.course_id);
      return { id: g.id, name: g.name, course_id: g.course_id, course_title: c ? c.title : "" };
    });
  res.json(out);
});

app.get("/api/teacher/groups/:group_id/students", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (!ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const testIds = testIdsForGroups([groupId]);
  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);
  const students = db.users.filter((u) => sIds.includes(u.id));

  const out = students.map((s) => {
    let passed = 0;
    let lastActivity: string | null = null;
    if (testIds.length > 0) {
      const passedTestIds = new Set(
        db.attempts
          .filter((a) => a.user_id === s.id && testIds.includes(a.test_id) && a.passed)
          .map((a) => a.test_id)
      );
      passed = passedTestIds.size;
      const atts = db.attempts
        .filter((a) => a.user_id === s.id && testIds.includes(a.test_id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (atts.length > 0) lastActivity = atts[0].created_at;
    }
    const progress = testIds.length > 0 ? Math.round((100 * passed) / testIds.length) : 0;
    return {
      id: s.id,
      name: s.name,
      username: s.username,
      progress,
      passed_tests: passed,
      total_tests: testIds.length,
      last_activity: lastActivity,
    };
  });
  res.json(out);
});

app.get("/api/teacher/groups/:group_id/progress", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (!ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const group = db.groups.find((g) => g.id === groupId);
  if (!group) return res.status(404).json({ detail: "Группа не найдена" });

  const themes = db.themes
    .filter((t) => t.course_id === group.course_id)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);
  const students = db.users.filter((u) => sIds.includes(u.id));

  const themesOut = themes.map((th) => {
    const test = db.tests.find((t) => t.theme_id === th.id);
    return {
      id: th.id,
      title: th.title,
      order_index: th.order_index,
      test_id: test ? test.id : null,
      test_title: test ? test.title : null,
    };
  });

  const studentsOut = students.map((s) => {
    const cells = themes.map((th) => {
      const test = db.tests.find((t) => t.theme_id === th.id);
      if (!test) return { theme_id: th.id, status: "no_test" };
      const attempts = db.attempts
        .filter((a) => a.user_id === s.id && a.test_id === test.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (attempts.length === 0) {
        return { theme_id: th.id, status: "not_started", attempts: 0 };
      }
      const bestScore = Math.max(...attempts.map((a) => a.score));
      return {
        theme_id: th.id,
        status: attempts.some((a) => a.passed) ? "passed" : "failed",
        attempts: attempts.length,
        best_score: bestScore,
        last_attempt_id: attempts[0].id,
        last_passed: attempts[0].passed,
        last_score: attempts[0].score,
      };
    });
    return { id: s.id, name: s.name, cells };
  });

  res.json({ themes: themesOut, students: studentsOut });
});

app.get("/api/teacher/groups/:group_id/attempts", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (!ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const testIds = testIdsForGroups([groupId]);
  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);

  const attempts = db.attempts
    .filter((a) => testIds.includes(a.test_id) && sIds.includes(a.user_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 500)
    .map((a) => {
      const student = db.users.find((u) => u.id === a.user_id);
      const test = db.tests.find((t) => t.id === a.test_id);
      const theme = test ? db.themes.find((th) => th.id === test.theme_id) : null;
      return {
        id: a.id,
        student: student ? student.name : "",
        test: test ? test.title : "",
        theme_id: theme ? theme.id : null,
        theme_title: theme ? theme.title : "",
        theme_order_index: theme ? theme.order_index : null,
        score: a.score,
        passed: a.passed,
        created_at: a.created_at,
      };
    });
  res.json(attempts);
});

app.get("/api/teacher/attempts/:attempt_id/details", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const attemptId = parseInt(req.params.attempt_id, 10);
  const a = db.attempts.find((x) => x.id === attemptId);
  if (!a) return res.status(404).json({ detail: "Попытка не найдена" });

  const test = db.tests.find((t) => t.id === a.test_id);
  const theme = test ? db.themes.find((th) => th.id === test.theme_id) : null;
  const course = theme ? db.courses.find((c) => c.id === theme.course_id) : null;

  const gids = teacherGroupIds(req.user!.id);
  const myCourseIds = db.groups.filter((g) => gids.includes(g.id)).map((g) => g.course_id);
  if (req.user!.role !== "admin" && (!course || !myCourseIds.includes(course.id))) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const student = db.users.find((u) => u.id === a.user_id);
  const questions = db.questions.filter((q) => q.test_id === a.test_id);
  const aaMap = new Map(
    db.attemptAnswers.filter((aa) => aa.attempt_id === a.id).map((aa) => [aa.question_id, aa])
  );

  const out = questions.map((q) => {
    const answers = db.answers.filter((ans) => ans.question_id === q.id);
    const right = answers.find((ans) => ans.is_correct);
    const aa = aaMap.get(q.id);
    const chosenId = aa ? aa.answer_id : null;
    const isCorrect = aa ? aa.is_correct : false;
    return {
      question: q.text,
      answers: answers.map((ans) => ({
        id: ans.id,
        text: ans.text,
        is_correct: ans.is_correct,
        chosen: chosenId === ans.id,
      })),
      chosen_answer_id: chosenId,
      right_answer_id: right ? right.id : null,
      is_correct: isCorrect,
    };
  });

  res.json({
    attempt_id: a.id,
    score: a.score,
    passed: a.passed,
    created_at: a.created_at,
    test_title: test ? test.title : "",
    theme_title: theme ? theme.title : "",
    student_name: student ? student.name : "",
    questions: out,
  });
});

app.get("/api/teacher/announcements", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const myGids = teacherGroupIds(req.user!.id);
  const targetAnnIds = new Set(
    db.announcementTargets.filter((at) => myGids.includes(at.group_id)).map((at) => at.announcement_id)
  );
  const myAnnIds = new Set(
    db.announcements.filter((a) => a.author_id === req.user!.id).map((a) => a.id)
  );
  const allIds = new Set([...targetAnnIds, ...myAnnIds]);

  const rows = db.announcements
    .filter((a) => allIds.has(a.id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const out = rows.map((a) => {
    const author = db.users.find((u) => u.id === a.author_id);
    const targets = db.announcementTargets.filter((at) => at.announcement_id === a.id).map((at) => at.group_id);
    const groupsInfo = targets
      .map((gid) => {
        const g = db.groups.find((x) => x.id === gid);
        if (!g) return null;
        const c = db.courses.find((x) => x.id === g.course_id);
        return { id: g.id, name: g.name, course: c ? c.title : "" };
      })
      .filter(Boolean);

    return {
      id: a.id,
      title: a.title,
      body: a.body,
      author: author ? author.name : "",
      author_id: a.author_id,
      is_mine: a.author_id === req.user!.id,
      created_at: a.created_at,
      updated_at: a.updated_at,
      group_ids: targets,
      groups: groupsInfo,
    };
  });
  res.json(out);
});

app.post("/api/teacher/announcements", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const { title, body, group_ids } = req.body;
  if (!Array.isArray(group_ids) || group_ids.length === 0) {
    return res.status(400).json({ detail: "Нужно выбрать хотя бы одну группу" });
  }
  for (const gid of group_ids) {
    if (!ownTeacherGroup(req.user!.id, gid)) {
      return res.status(403).json({ detail: "Доступ запрещён" });
    }
  }

  const id = db.getId("announcement");
  const now = new Date().toISOString();
  db.announcements.push({ id, author_id: req.user!.id, title, body, created_at: now, updated_at: now });
  for (const gid of group_ids) {
    db.announcementTargets.push({ announcement_id: id, group_id: gid });
  }

  const studentIds = db.groupStudents.filter((gs) => group_ids.includes(gs.group_id)).map((gs) => gs.user_id);
  const teacherIds = db.groupTeachers
    .filter((gt) => group_ids.includes(gt.group_id) && gt.teacher_id !== req.user!.id)
    .map((gt) => gt.teacher_id);

  notifyUsers(studentIds, "announcement", `Объявление: ${title}`, (body || "").slice(0, 160), "/student?tab=announcements");
  notifyUsers(teacherIds, "announcement", `Объявление от ${req.user!.name}: ${title}`, (body || "").slice(0, 160), "/teacher?tab=announcements");

  res.json({ id });
});

app.put("/api/teacher/announcements/:ann_id", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const annId = parseInt(req.params.ann_id, 10);
  const a = db.announcements.find((x) => x.id === annId);
  if (!a || a.author_id !== req.user!.id) {
    return res.status(404).json({ detail: "Объявление не найдено" });
  }
  if (req.body.title !== undefined) a.title = req.body.title;
  if (req.body.body !== undefined) a.body = req.body.body;
  if (Array.isArray(req.body.group_ids)) {
    for (const gid of req.body.group_ids) {
      if (!ownTeacherGroup(req.user!.id, gid)) {
        return res.status(403).json({ detail: "Доступ запрещён" });
      }
    }
    db.announcementTargets = db.announcementTargets.filter((at) => at.announcement_id !== annId);
    for (const gid of req.body.group_ids) {
      db.announcementTargets.push({ announcement_id: annId, group_id: gid });
    }
  }
  a.updated_at = new Date().toISOString();
  res.json({ ok: true });
});

app.delete("/api/teacher/announcements/:ann_id", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const annId = parseInt(req.params.ann_id, 10);
  const a = db.announcements.find((x) => x.id === annId);
  if (!a || a.author_id !== req.user!.id) {
    return res.status(404).json({ detail: "Объявление не найдено" });
  }
  db.announcementTargets = db.announcementTargets.filter((at) => at.announcement_id !== annId);
  db.announcements = db.announcements.filter((x) => x.id !== annId);
  res.json({ ok: true });
});

app.get("/api/teacher/groups/:group_id/analytics", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (!ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const testIds = testIdsForGroups([groupId]);
  const tests = db.tests.filter((t) => testIds.includes(t.id));

  const perTest = tests.map((t) => {
    const attempts = db.attempts.filter((a) => a.test_id === t.id);
    const n = attempts.length;
    const avg = n > 0 ? Math.round((attempts.reduce((sum, a) => sum + a.score, 0) / n) * 10) / 10 : 0;
    const pr = n > 0 ? Math.round((attempts.filter((a) => a.passed).length / n) * 1000) / 10 : 0;
    return { test: t.title, avg_score: avg, pass_rate: pr, attempts: n };
  });

  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);
  const students = db.users.filter((u) => sIds.includes(u.id));

  const perStudent = students.map((s) => {
    let passed = 0;
    let avg = 0;
    if (testIds.length > 0) {
      const myAtts = db.attempts.filter((a) => a.user_id === s.id && testIds.includes(a.test_id));
      passed = new Set(myAtts.filter((a) => a.passed).map((a) => a.test_id)).size;
      avg = myAtts.length > 0 ? Math.round((myAtts.reduce((sum, a) => sum + a.score, 0) / myAtts.length) * 10) / 10 : 0;
    }
    const prog = testIds.length > 0 ? Math.round((100 * passed) / testIds.length) : 0;
    return { name: s.name, progress: prog, avg_score: avg, passed, total: testIds.length };
  });

  // timeline
  const timelineMap: Record<string, { count: number; sum: number }> = {};
  for (const a of db.attempts) {
    if (testIds.includes(a.test_id)) {
      const date = a.created_at.split("T")[0];
      if (!timelineMap[date]) timelineMap[date] = { count: 0, sum: 0 };
      timelineMap[date].count++;
      timelineMap[date].sum += a.score;
    }
  }
  const timeline = Object.keys(timelineMap).sort().map((d) => ({
    date: d,
    attempts: timelineMap[d].count,
    avg_score: Math.round((timelineMap[d].sum / timelineMap[d].count) * 10) / 10,
  }));

  res.json({ per_test: perTest, per_student: perStudent, timeline });
});

app.get("/api/teacher/themes/:theme_id/chat", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const rows = db.chatMessages
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/teacher/themes/:theme_id/chat", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
  });

  const gids = teacherGroupIds(req.user!.id);
  const targetGroups = db.groups.filter((g) => gids.includes(g.id) && g.course_id === theme.course_id).map((g) => g.id);
  const studentIds = db.groupStudents.filter((gs) => targetGroups.includes(gs.group_id)).map((gs) => gs.user_id);
  notifyUsers(
    studentIds,
    "chat",
    `Новое сообщение в теме «${theme.title}»`,
    (req.body.text || "").slice(0, 160),
    `/student?course=${theme.course_id}&theme=${themeId}`
  );

  res.json({ id: msgId });
});

app.get("/api/teacher/course/:course_id/extra-materials", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  const gids = teacherGroupIds(req.user!.id);
  const myCourseIds = db.groups.filter((g) => gids.includes(g.id)).map((g) => g.course_id);
  if (!myCourseIds.includes(courseId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const mats = db.extraMaterials
    .filter((em) => {
      normalizeExtraMaterial(em);
      const isCourseMatch = em.course_ids.includes(courseId) || em.course_id === courseId;
      const isGroupMatch = em.group_ids.some((gid) => {
        const g = db.groups.find((x) => x.id === gid);
        return g && g.course_id === courseId && gids.includes(gid);
      });
      return isCourseMatch || isGroupMatch;
    })
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map((em) => getExtraMaterialDetails(em));
  res.json(mats);
});

app.get("/api/teacher/extra-materials/:id/chat", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  if (!canTeacherAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages
    .filter((m) => m.extra_material_id === extraId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/teacher/extra-materials/:id/chat", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  if (!canTeacherAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
  });

  // Find all student recipients who have access to this extra material across teacher's groups
  const gids = teacherGroupIds(req.user!.id);
  const targetGroupIds = new Set<number>();
  for (const gid of gids) {
    const g = db.groups.find((x) => x.id === gid);
    if (!g) continue;
    if (em.group_ids.includes(gid) || em.course_ids.includes(g.course_id) || em.course_id === g.course_id) {
      targetGroupIds.add(gid);
    }
  }

  const studentIds = db.groupStudents
    .filter((gs) => targetGroupIds.has(gs.group_id))
    .map((gs) => gs.user_id);
  const adminIds = db.users.filter((u) => hasRole(u, "admin") || hasRole(u, "manager")).map((u) => u.id);

  notifyUsers(
    Array.from(new Set(studentIds)),
    "chat",
    `Сообщение от куратора ${req.user!.name} в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/student?extra_material=${extraId}`
  );

  notifyUsers(
    Array.from(new Set(adminIds)),
    "chat",
    `Сообщение от куратора ${req.user!.name} в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/admin?tab=chats&extra_material=${extraId}`
  );

  res.json({ id: msgId });
});

// -------------------------------------------------------------
// STUDENT
// -------------------------------------------------------------
function studentCourseIds(userId: number): number[] {
  const gids = db.groupStudents.filter((gs) => gs.user_id === userId).map((gs) => gs.group_id);
  return [...new Set(db.groups.filter((g) => gids.includes(g.id)).map((g) => g.course_id))];
}

function inStudentCourse(userId: number, courseId: number): boolean {
  return studentCourseIds(userId).includes(courseId);
}

function themeGrants(userId: number): Set<number> {
  return new Set(db.themeUnlocks.filter((gu) => gu.user_id === userId).map((gu) => gu.theme_id));
}

app.get("/api/student/courses", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const cids = studentCourseIds(req.user!.id);
  const courses = db.courses
    .filter((c) => cids.includes(c.id))
    .map((c) => ({ id: c.id, title: c.title, description: c.description }));
  res.json(courses);
});

app.get("/api/student/course/:course_id/themes", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  if (!inStudentCourse(req.user!.id, courseId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const themes = db.themes
    .filter((t) => t.course_id === courseId)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);

  const out = [];
  let chain = true;
  const grants = themeGrants(req.user!.id);
  for (const th of themes) {
    const materials = db.materials
      .filter((m) => m.theme_id === th.id)
      .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
      .map((m) => ({ id: m.id, title: m.title, type: m.type, url: m.url, order_index: m.order_index }));

    const test = db.tests.find((t) => t.theme_id === th.id);
    let testPassed = false;
    let attemptsUsed = 0;
    if (test) {
      const attempts = db.attempts.filter((a) => a.user_id === req.user!.id && a.test_id === test.id);
      attemptsUsed = attempts.length;
      testPassed = attempts.some((a) => a.passed);
    }
    const maxAtt = test ? test.max_attempts : 0;
    const attemptsLeft = !test || maxAtt === 0 ? null : Math.max(0, maxAtt - attemptsUsed);
    const granted = grants.has(th.id);

    out.push({
      id: th.id,
      title: th.title,
      order_index: th.order_index,
      unlocked: chain || granted,
      unlock_granted: granted && !(test && testPassed),
      materials,
      test: test
        ? {
            id: test.id,
            title: test.title,
            passing_score: test.passing_score,
            max_attempts: maxAtt,
            attempts_used: attemptsUsed,
            attempts_left: attemptsLeft,
            passed: testPassed,
          }
        : null,
    });
    chain = (chain && (!test || testPassed)) || granted;
  }
  res.json(out);
});

// -------------------------------------------------------------
// OPEN NEXT THEME FOR A STUDENT (admin/manager manual unlock)
// -------------------------------------------------------------
app.get(
  ["/api/admin/students/:user_id/unlockable-themes", "/api/teacher/students/:user_id/unlockable-themes"],
  authMiddleware,
  requireRole("admin", "teacher"),
  (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.user_id, 10);
    const u = db.users.find((x) => x.id === userId && isStudent(x));
    if (!u) return res.status(404).json({ detail: "Ученик не найден" });
    const grants = themeGrants(userId);
    const out = [];
    for (const cid of studentCourseIds(userId)) {
      const course = db.courses.find((c) => c.id === cid);
      if (!course) continue;
      const themes = db.themes
        .filter((t) => t.course_id === cid)
        .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
      const items = [];
      let chain = true;
      for (const th of themes) {
        const test = db.tests.find((t) => t.theme_id === th.id);
        const passed = test
          ? db.attempts.some((a) => a.user_id === userId && a.test_id === test.id && a.passed)
          : false;
        const granted = grants.has(th.id);
        const open = chain || granted;
        if (!open || granted) {
          items.push({
            id: th.id,
            title: th.title,
            order_index: th.order_index,
            locked: !open,
            granted,
          });
        }
        chain = (chain && (!test || passed)) || granted;
      }
      if (items.length) out.push({ course_id: cid, course_title: course.title, themes: items });
    }
    res.json(out);
  }
);

app.post(
  ["/api/admin/students/:user_id/unlock-theme", "/api/teacher/students/:user_id/unlock-theme"],
  authMiddleware,
  requireRole("admin", "teacher"),
  (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.user_id, 10);
    const themeId = parseInt(req.body?.theme_id, 10);
    const u = db.users.find((x) => x.id === userId && isStudent(x));
    const th = db.themes.find((x) => x.id === themeId);
    if (!u || !th) return res.status(404).json({ detail: "Не найдено" });
    if (!inStudentCourse(userId, th.course_id)) {
      return res.status(400).json({ detail: "Ученик не состоит в курсе этой темы" });
    }
    if (!db.themeUnlocks.find((gu) => gu.user_id === userId && gu.theme_id === themeId)) {
      db.themeUnlocks.push({
        id: db.getId("themeUnlock"),
        user_id: userId,
        theme_id: themeId,
        granted_by: req.user!.id,
        created_at: new Date().toISOString(),
      });
      (db as any).save();
    }
    res.json({ ok: true });
  }
);

app.delete(
  ["/api/admin/students/:user_id/unlock-theme", "/api/teacher/students/:user_id/unlock-theme"],
  authMiddleware,
  requireRole("admin", "teacher"),
  (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.user_id, 10);
    const themeId = parseInt(req.query?.theme_id as string, 10);
    db.themeUnlocks = db.themeUnlocks.filter((gu) => !(gu.user_id === userId && gu.theme_id === themeId));
    (db as any).save();
    res.json({ ok: true });
  }
);

app.get("/api/student/test/:test_id", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const testId = parseInt(req.params.test_id, 10);
  const test = db.tests.find((t) => t.id === testId);
  if (!test) return res.status(404).json({ detail: "Тест не найден" });

  const theme = db.themes.find((t) => t.id === test.theme_id);
  if (!theme || !inStudentCourse(req.user!.id, theme.course_id)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  if (test.max_attempts > 0) {
    const used = db.attempts.filter((a) => a.user_id === req.user!.id && a.test_id === test.id).length;
    if (used >= test.max_attempts) {
      return res.status(400).json({ detail: "Лимит попыток исчерпан" });
    }
  }

  const questions = db.questions
    .filter((q) => q.test_id === test.id)
    .map((q) => {
      const answers = db.answers
        .filter((a) => a.question_id === q.id)
        .map((a) => ({ id: a.id, text: a.text }));
      return { id: q.id, text: q.text, answers };
    });

  res.json({
    test: { id: test.id, title: test.title, passing_score: test.passing_score },
    questions,
  });
});

app.post("/api/student/test/:test_id/submit", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const testId = parseInt(req.params.test_id, 10);
  const test = db.tests.find((t) => t.id === testId);
  if (!test) return res.status(404).json({ detail: "Тест не найден" });

  const theme = db.themes.find((t) => t.id === test.theme_id);
  if (!theme || !inStudentCourse(req.user!.id, theme.course_id)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  if (test.max_attempts > 0) {
    const used = db.attempts.filter((a) => a.user_id === req.user!.id && a.test_id === test.id).length;
    if (used >= test.max_attempts) {
      return res.status(400).json({ detail: "Лимит попыток исчерпан" });
    }
  }

  const userAnswers: Record<string, number> = req.body.answers || {};
  const questions = db.questions.filter((q) => q.test_id === test.id);
  let correct = 0;
  const aaRows: { qid: number; chosen: number | null; is_correct: boolean }[] = [];

  for (const q of questions) {
    const rights = db.answers.filter((a) => a.question_id === q.id && a.is_correct);
    const chosen = userAnswers[String(q.id)] || userAnswers[q.id as any] || null;
    const isCorrect = !!(chosen && rights.some((r) => r.id === chosen));
    if (isCorrect) correct++;
    aaRows.push({ qid: q.id, chosen, is_correct: isCorrect });
  }

  const total = questions.length || 1;
  const score = Math.round((100 * correct) / total);
  const passed = score >= test.passing_score;

  const attemptId = db.getId("attempt");
  db.attempts.push({
    id: attemptId,
    user_id: req.user!.id,
    test_id: test.id,
    score,
    passed,
    created_at: new Date().toISOString(),
  });

  for (const item of aaRows) {
    db.attemptAnswers.push({
      id: db.getId("attemptAnswer"),
      attempt_id: attemptId,
      question_id: item.qid,
      answer_id: item.chosen,
      is_correct: item.is_correct,
    });
  }

  // Notify curators
  const gids = db.groupStudents.filter((gs) => gs.user_id === req.user!.id).map((gs) => gs.group_id);
  const teacherIds = db.groupTeachers.filter((gt) => gids.includes(gt.group_id)).map((gt) => gt.teacher_id);
  notifyUsers(
    teacherIds,
    "attempt",
    `${req.user!.name}: тест «${test.title}» — ${score}%`,
    passed ? "сдан" : "не сдан",
    "/teacher?tab=attempts"
  );

  res.json({
    attempt_id: attemptId,
    score,
    passed,
    correct,
    total,
    passing_score: test.passing_score,
  });
});

app.get("/api/student/attempts/:attempt_id/details", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const attemptId = parseInt(req.params.attempt_id, 10);
  const a = db.attempts.find((x) => x.id === attemptId && x.user_id === req.user!.id);
  if (!a) return res.status(404).json({ detail: "Попытка не найдена" });

  const test = db.tests.find((t) => t.id === a.test_id);
  const theme = test ? db.themes.find((th) => th.id === test.theme_id) : null;
  const questions = db.questions.filter((q) => q.test_id === a.test_id);
  const aaMap = new Map(
    db.attemptAnswers.filter((aa) => aa.attempt_id === a.id).map((aa) => [aa.question_id, aa])
  );

  const out = questions.map((q) => {
    const answers = db.answers.filter((ans) => ans.question_id === q.id);
    const right = answers.find((ans) => ans.is_correct);
    const aa = aaMap.get(q.id);
    const chosenId = aa ? aa.answer_id : null;
    const isCorrect = aa ? aa.is_correct : false;
    return {
      question: q.text,
      answers: answers.map((ans) => ({
        id: ans.id,
        text: ans.text,
        is_correct: ans.is_correct,
        chosen: chosenId === ans.id,
      })),
      chosen_answer_id: chosenId,
      right_answer_id: right ? right.id : null,
      is_correct: isCorrect,
    };
  });

  res.json({
    attempt_id: a.id,
    score: a.score,
    passed: a.passed,
    created_at: a.created_at,
    test_title: test ? test.title : "",
    theme_title: theme ? theme.title : "",
    questions: out,
  });
});

app.get("/api/student/history", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const attempts = db.attempts
    .filter((a) => a.user_id === req.user!.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100)
    .map((a) => {
      const test = db.tests.find((t) => t.id === a.test_id);
      return {
        id: a.id,
        test: test ? test.title : "",
        score: a.score,
        passed: a.passed,
        created_at: a.created_at,
      };
    });
  res.json(attempts);
});

app.get("/api/student/announcements", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const gids = db.groupStudents.filter((gs) => gs.user_id === req.user!.id).map((gs) => gs.group_id);
  const rows = db.announcements
    .filter((a) => {
      const targets = db.announcementTargets.filter((at) => at.announcement_id === a.id);
      if (targets.length === 0) return true; // global
      return targets.some((at) => gids.includes(at.group_id));
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const out = rows.map((a) => {
    const author = db.users.find((u) => u.id === a.author_id);
    const targets = db.announcementTargets.filter((at) => at.announcement_id === a.id);
    const targetGroupNames = targets
      .filter((at) => gids.includes(at.group_id))
      .map((at) => {
        const g = db.groups.find((x) => x.id === at.group_id);
        return g ? g.name : "";
      })
      .filter(Boolean);

    return {
      id: a.id,
      title: a.title,
      body: a.body,
      author: author ? author.name : "Администрация",
      created_at: a.created_at,
      updated_at: a.updated_at,
      groups: targets.length === 0 ? ["Для всех групп"] : targetGroupNames,
    };
  });
  res.json(out);
});

app.get("/api/student/themes/:theme_id/chat", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme || !inStudentCourse(req.user!.id, theme.course_id)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/student/themes/:theme_id/chat", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme || !inStudentCourse(req.user!.id, theme.course_id)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
  });

  const myGids = db.groupStudents
    .filter((gs) => gs.user_id === req.user!.id)
    .map((gs) => gs.group_id)
    .filter((gid) => {
      const g = db.groups.find((x) => x.id === gid);
      return g && g.course_id === theme.course_id;
    });

  const teacherIds = db.groupTeachers.filter((gt) => myGids.includes(gt.group_id)).map((gt) => gt.teacher_id);
  notifyUsers(
    teacherIds,
    "chat",
    `Новое сообщение от ${req.user!.name} в «${theme.title}»`,
    (req.body.text || "").slice(0, 160),
    `/teacher?theme=${themeId}`
  );

  res.json({ id: msgId });
});

app.get("/api/student/course/:course_id/extra-materials", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  if (!inStudentCourse(req.user!.id, courseId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const myGids = db.groupStudents.filter((gs) => gs.user_id === req.user!.id).map((gs) => gs.group_id);

  const mats = db.extraMaterials
    .filter((em) => {
      normalizeExtraMaterial(em);
      const isCourseMatch = em.course_ids.includes(courseId) || em.course_id === courseId;
      const isGroupMatch = em.group_ids.some((gid) => {
        const g = db.groups.find((x) => x.id === gid);
        return g && g.course_id === courseId && myGids.includes(gid);
      });
      return isCourseMatch || isGroupMatch;
    })
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map((em) => getExtraMaterialDetails(em));
  res.json(mats);
});

app.get("/api/student/extra-materials/:id/chat", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em || !canStudentAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages
    .filter((m) => m.extra_material_id === extraId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/student/extra-materials/:id/chat", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em || !canStudentAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
  });

  // Notify curators of student's groups, admins, and group members across this material
  const myGids = db.groupStudents
    .filter((gs) => gs.user_id === req.user!.id)
    .map((gs) => gs.group_id);

  const teacherIds = db.groupTeachers
    .filter((gt) => myGids.includes(gt.group_id))
    .map((gt) => gt.teacher_id);
  const adminIds = db.users.filter((u) => hasRole(u, "admin") || hasRole(u, "manager")).map((u) => u.id);
  const peerStudentIds = db.groupStudents
    .filter((gs) => myGids.includes(gs.group_id) && gs.user_id !== req.user!.id)
    .map((gs) => gs.user_id);

  notifyUsers(
    Array.from(new Set(teacherIds)),
    "chat",
    `Сообщение от ученика ${req.user!.name} в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/teacher?extra_material=${extraId}`
  );

  notifyUsers(
    Array.from(new Set(adminIds)),
    "chat",
    `Сообщение от ${req.user!.name} в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/admin?tab=chats&extra_material=${extraId}`
  );

  notifyUsers(
    Array.from(new Set(peerStudentIds)),
    "chat",
    `Новое сообщение в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/student?extra_material=${extraId}`
  );

  res.json({ id: msgId });
});

// -------------------------------------------------------------
// STAFF (admin or manager)
// -------------------------------------------------------------
app.get("/api/staff/groups", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const out = db.groups.map((g) => {
    const c = db.courses.find((x) => x.id === g.course_id);
    return { id: g.id, name: g.name, course_id: g.course_id, course_title: c ? c.title : "" };
  });
  res.json(out);
});

app.get(["/api/staff/announcements", "/api/admin/announcements"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const rows = [...db.announcements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const out = rows.map((a) => {
    const author = db.users.find((u) => u.id === a.author_id);
    const targets = db.announcementTargets
      .filter((at) => at.announcement_id === a.id)
      .map((at) => at.group_id);
    const groupsInfo = targets
      .map((gid) => {
        const g = db.groups.find((x) => x.id === gid);
        if (!g) return null;
        const c = db.courses.find((x) => x.id === g.course_id);
        return { id: g.id, name: g.name, course: c ? c.title : "" };
      })
      .filter(Boolean);

    return {
      id: a.id,
      title: a.title,
      body: a.body,
      author: author ? author.name : (a.author_id ? `Пользователь #${a.author_id}` : "Администрация"),
      author_id: a.author_id,
      is_mine: a.author_id === req.user!.id || req.user!.role === "admin",
      created_at: a.created_at,
      updated_at: a.updated_at,
      group_ids: targets,
      groups: groupsInfo,
    };
  });
  res.json(out);
});

app.post(["/api/staff/announcements", "/api/admin/announcements"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  let { title, body, group_ids, to_all_groups } = req.body;
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ detail: "Заполните заголовок объявления" });
  }
  if (!body || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ detail: "Заполните текст объявления" });
  }

  // If explicitly flagged or all groups requested, or if no groups selected but groups exist
  if (to_all_groups || !Array.isArray(group_ids) || group_ids.length === 0) {
    if (db.groups.length > 0) {
      group_ids = db.groups.map((g) => g.id);
    } else {
      group_ids = [];
    }
  }

  const id = db.getId("announcement");
  const now = new Date().toISOString();
  db.announcements.push({ id, author_id: req.user!.id, title: title.trim(), body: body.trim(), created_at: now, updated_at: now });
  for (const gid of group_ids) {
    if (db.groups.find((g) => g.id === gid)) {
      db.announcementTargets.push({ announcement_id: id, group_id: gid });
    }
  }

  const studentIds = group_ids.length > 0
    ? db.groupStudents.filter((gs) => group_ids.includes(gs.group_id)).map((gs) => gs.user_id)
    : db.users.filter((u) => isStudent(u)).map((u) => u.id);
  const teacherIds = group_ids.length > 0
    ? db.groupTeachers.filter((gt) => group_ids.includes(gt.group_id)).map((gt) => gt.teacher_id)
    : db.users.filter((u) => isCurator(u)).map((u) => u.id);

  notifyUsers(studentIds, "announcement", `Объявление: ${title}`, (body || "").slice(0, 160), "/student?tab=announcements");
  notifyUsers(teacherIds, "announcement", `Объявление: ${title}`, (body || "").slice(0, 160), "/teacher?tab=announcements");

  res.json({ id });
});

app.put(["/api/staff/announcements/:ann_id", "/api/admin/announcements/:ann_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const annId = parseInt(req.params.ann_id, 10);
  const a = db.announcements.find((x) => x.id === annId);
  if (!a) return res.status(404).json({ detail: "Объявление не найдено" });
  if (req.user!.role !== "admin" && a.author_id !== req.user!.id) {
    return res.status(403).json({ detail: "Можно редактировать только свои объявления" });
  }
  if (req.body.title !== undefined) a.title = req.body.title.trim();
  if (req.body.body !== undefined) a.body = req.body.body.trim();
  if (Array.isArray(req.body.group_ids)) {
    db.announcementTargets = db.announcementTargets.filter((at) => at.announcement_id !== annId);
    for (const gid of req.body.group_ids) {
      if (db.groups.find((g) => g.id === gid)) {
        db.announcementTargets.push({ announcement_id: annId, group_id: gid });
      }
    }
  }
  a.updated_at = new Date().toISOString();
  res.json({ ok: true });
});

app.delete(["/api/staff/announcements/:ann_id", "/api/admin/announcements/:ann_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const annId = parseInt(req.params.ann_id, 10);
  const a = db.announcements.find((x) => x.id === annId);
  if (!a) return res.status(404).json({ detail: "Объявление не найдено" });
  if (req.user!.role !== "admin" && a.author_id !== req.user!.id) {
    return res.status(403).json({ detail: "Можно удалять только свои объявления" });
  }
  db.announcementTargets = db.announcementTargets.filter((at) => at.announcement_id !== annId);
  db.announcements = db.announcements.filter((x) => x.id !== annId);
  res.json({ ok: true });
});

app.get("/api/staff/themes", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const out = db.themes
    .map((t) => {
      const c = db.courses.find((x) => x.id === t.course_id);
      return { id: t.id, title: t.title, order_index: t.order_index, course_id: t.course_id, course_title: c ? c.title : "" };
    })
    .sort((a, b) => a.course_title.localeCompare(b.course_title) || a.order_index - b.order_index);
  res.json(out);
});

app.get("/api/staff/themes/:theme_id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const rows = db.chatMessages
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/staff/themes/:theme_id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
  });

  const gids = db.groups.filter((g) => g.course_id === theme.course_id).map((g) => g.id);
  const recipients = new Set<number>();
  for (const gid of gids) {
    for (const gs of db.groupStudents.filter((x) => x.group_id === gid)) recipients.add(gs.user_id);
    for (const gt of db.groupTeachers.filter((x) => x.group_id === gid)) recipients.add(gt.teacher_id);
  }
  recipients.delete(req.user!.id);

  notifyUsers(
    Array.from(recipients),
    "chat",
    `Сообщение от ${req.user!.name} в теме «${theme.title}»`,
    (req.body.text || "").slice(0, 160),
    `/student?course=${theme.course_id}&theme=${themeId}`
  );

  res.json({ id: msgId });
});

app.get("/api/staff/extra-materials", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const out = db.extraMaterials
    .map((em) => getExtraMaterialDetails(em))
    .sort((a, b) => (a.course_titles[0] || "").localeCompare(b.course_titles[0] || "") || a.order_index - b.order_index);
  res.json(out);
});

app.post("/api/staff/extra-materials", authMiddleware, requireRole("admin", "manager"), handleCreateAdminExtraMaterial);

app.put("/api/staff/extra-materials/:id", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === id);
  if (!em) return res.status(404).json({ detail: "Дополнительный материал не найден" });
  normalizeExtraMaterial(em);

  if (req.body.title !== undefined) em.title = (req.body.title || "").trim();
  if (req.body.description !== undefined) em.description = req.body.description;
  if (req.body.type !== undefined) em.type = req.body.type;
  if (req.body.url !== undefined) em.url = req.body.url;
  if (req.body.order_index !== undefined) em.order_index = Number(req.body.order_index);
  if (Array.isArray(req.body.course_ids)) {
    em.course_ids = req.body.course_ids.map(Number);
    em.course_id = em.course_ids[0] || undefined;
  }
  if (Array.isArray(req.body.group_ids)) {
    em.group_ids = req.body.group_ids.map(Number);
  }
  res.json(getExtraMaterialDetails(em));
});

app.delete("/api/staff/extra-materials/:id", authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.extraMaterials = db.extraMaterials.filter((x) => x.id !== id);
  db.chatMessages = db.chatMessages.filter((m) => m.extra_material_id !== id);
  res.json({ ok: true });
});

app.get("/api/staff/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });

  const rows = db.chatMessages
    .filter((m) => m.extra_material_id === extraId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/staff/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
  });

  // Notify students and teachers in all attached courses and groups
  const targetGroupIds = new Set<number>(em.group_ids);
  for (const cid of em.course_ids) {
    for (const g of db.groups.filter((x) => x.course_id === cid)) {
      targetGroupIds.add(g.id);
    }
  }

  const studentRecipients = new Set<number>();
  const teacherRecipients = new Set<number>();
  for (const gid of targetGroupIds) {
    for (const gs of db.groupStudents.filter((x) => x.group_id === gid)) studentRecipients.add(gs.user_id);
    for (const gt of db.groupTeachers.filter((x) => x.group_id === gid)) teacherRecipients.add(gt.teacher_id);
  }
  studentRecipients.delete(req.user!.id);
  teacherRecipients.delete(req.user!.id);

  notifyUsers(
    Array.from(studentRecipients),
    "chat",
    `Сообщение от администрации (${req.user!.name}) в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/student?extra_material=${extraId}`
  );

  notifyUsers(
    Array.from(teacherRecipients),
    "chat",
    `Сообщение от администрации (${req.user!.name}) в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/teacher?extra_material=${extraId}`
  );

  res.json({ id: msgId });
});

// Admin aliases
app.get("/api/admin/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });

  const rows = db.chatMessages
    .filter((m) => m.extra_material_id === extraId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === req.user!.id,
      };
    });
  res.json(rows);
});

app.post("/api/admin/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
  });

  const gids = db.groups.filter((g) => g.course_id === em.course_id).map((g) => g.id);
  const studentRecipients = new Set<number>();
  const teacherRecipients = new Set<number>();
  for (const gid of gids) {
    for (const gs of db.groupStudents.filter((x) => x.group_id === gid)) studentRecipients.add(gs.user_id);
    for (const gt of db.groupTeachers.filter((x) => x.group_id === gid)) teacherRecipients.add(gt.teacher_id);
  }
  studentRecipients.delete(req.user!.id);
  teacherRecipients.delete(req.user!.id);

  notifyUsers(
    Array.from(studentRecipients),
    "chat",
    `Сообщение от администрации (${req.user!.name}) в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/student?course=${em.course_id}&extra_material=${extraId}`
  );

  notifyUsers(
    Array.from(teacherRecipients),
    "chat",
    `Сообщение от администрации (${req.user!.name}) в доп. материале «${em.title}»`,
    text.slice(0, 160),
    `/teacher?extra_material=${extraId}`
  );

  res.json({ id: msgId });
});

// -------------------------------------------------------------
// UNIFIED MATERIALS REPOSITORY (STORAGE / НАКОПИТЕЛЬ МАТЕРИАЛОВ)
// -------------------------------------------------------------
app.get(["/api/staff/repository/materials", "/api/admin/repository/materials", "/api/manager/repository/materials"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  let list = [...db.storageMaterials];
  const playlist = (req.query.playlist as string || req.query.theme as string || "").trim().toLowerCase();
  const search = (req.query.search as string || "").trim().toLowerCase();
  const type = (req.query.type as string || "").trim().toLowerCase();

  if (playlist) {
    list = list.filter((m) => (m.playlist_name || "").trim().toLowerCase() === playlist);
  }
  if (type && type !== "all") {
    list = list.filter((m) => m.type === type);
  }
  if (search) {
    list = list.filter(
      (m) =>
        m.title.toLowerCase().includes(search) ||
        (m.playlist_name || "").toLowerCase().includes(search) ||
        (m.description || "").toLowerCase().includes(search) ||
        (m.url || "").toLowerCase().includes(search)
    );
  }

  list.sort((a, b) => {
    const tComp = (a.playlist_name || "").localeCompare(b.playlist_name || "", "ru");
    if (tComp !== 0) return tComp;
    return (a.order_index || 0) - (b.order_index || 0) || a.id - b.id;
  });

  res.json(list);
});

app.get(["/api/staff/repository/playlists", "/api/admin/repository/playlists", "/api/manager/repository/playlists"], authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const map = new Map<string, StorageMaterial[]>();
  for (const m of db.storageMaterials) {
    const key = (m.playlist_name || "Общие материалы").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }

  const playlists = Array.from(map.entries()).map(([playlist_name, items]) => {
    items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
    return {
      playlist_name,
      count: items.length,
      materials: items,
    };
  }).sort((a, b) => a.playlist_name.localeCompare(b.playlist_name, "ru"));

  res.json(playlists);
});

// Legacy alias: repository/themes → repository/playlists
app.get(["/api/staff/repository/themes", "/api/admin/repository/themes", "/api/manager/repository/themes"], authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  const map = new Map<string, StorageMaterial[]>();
  for (const m of db.storageMaterials) {
    const key = (m.playlist_name || "Общие материалы").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }

  const playlists = Array.from(map.entries()).map(([playlist_name, items]) => {
    items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
    return {
      playlist_name,
      count: items.length,
      materials: items,
    };
  }).sort((a, b) => a.playlist_name.localeCompare(b.playlist_name, "ru"));

  res.json(playlists);
});

app.post(["/api/staff/repository/materials", "/api/admin/repository/materials", "/api/manager/repository/materials"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { title, playlist_name, type, url, description, order_index, file_name, file_size } = req.body;
  const cleanTitle = (title || "").trim();
  const cleanPlaylist = (playlist_name || "").trim() || "Общие материалы";
  const cleanType = (type || "video").trim();
  const cleanUrl = (url || "").trim();

  if (!cleanTitle) {
    return res.status(400).json({ detail: "Введите название материала / урока" });
  }

  const existingInPlaylist = db.storageMaterials.filter(
    (m) => m.playlist_name.trim().toLowerCase() === cleanPlaylist.toLowerCase()
  );
  const nextOrder = order_index !== undefined && order_index !== "" 
    ? Number(order_index) 
    : (existingInPlaylist.length + 1);

  const id = db.getId("storageMaterial");
  const newMat: StorageMaterial = {
    id,
    title: cleanTitle,
    playlist_name: cleanPlaylist,
    type: cleanType,
    url: cleanUrl,
    description: (description || "").trim(),
    order_index: nextOrder,
    file_name: file_name || "",
    file_size: file_size || 0,
    created_at: new Date().toISOString(),
  };

  db.storageMaterials.push(newMat);
  res.json({ id, ok: true, material: newMat });
});

app.put(["/api/staff/repository/materials/:id", "/api/admin/repository/materials/:id", "/api/manager/repository/materials/:id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = db.storageMaterials.find((x) => x.id === id);
  if (!item) return res.status(404).json({ detail: "Материал не найден в накопителе" });

  const oldTitle = item.title;
  if (req.body.title !== undefined) item.title = (req.body.title || "").trim();
  if (req.body.playlist_name !== undefined) item.playlist_name = (req.body.playlist_name || "").trim() || "Общие материалы";
  if (req.body.type !== undefined) item.type = req.body.type;
  if (req.body.url !== undefined) item.url = req.body.url;
  if (req.body.description !== undefined) item.description = req.body.description;
  if (req.body.order_index !== undefined) item.order_index = Number(req.body.order_index);
  if (req.body.file_name !== undefined) item.file_name = req.body.file_name;

  // Автоматическая синхронизация с уроками учеников
  db.materials.forEach((m: any) => {
    if (m.repository_material_id === id || m.storage_id === id || m.title === oldTitle || m.title === item.title) {
      m.repository_material_id = id;
      m.storage_id = id;
      m.title = item.title;
      m.type = item.type;
      m.url = item.url;
    }
  });

  if (typeof (db as any).save === "function") (db as any).save();
  console.log("[Repository] Материал ID " + id + " обновлён и синхронизирован с уроками курса!");
  res.json({ ok: true, material: item });
});

app.delete(["/api/staff/repository/materials/:id", "/api/admin/repository/materials/:id", "/api/manager/repository/materials/:id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const id = parseInt(req.params.id, 10);

  // 1. Находим материал ДО удаления, чтобы знать url/имя файла
  const repoItem = db.storageMaterials.find((x) => x.id === id);

  // 2. Удаляем из накопителя
  db.storageMaterials = db.storageMaterials.filter((x) => x.id !== id);

  // 3. Автосинхронизация: удаляем все привязанные копии из уроков учеников
  const before = db.materials.length;
  db.materials = db.materials.filter((m) => m.repository_material_id !== id && m.storage_id !== id);
  const removed = before - db.materials.length;

  // 4. Удаляем физический файл с диска (если он есть)
  if (repoItem && repoItem.url) {
    const urlPath = String(repoItem.url).trim();
    if (urlPath.startsWith("/uploads/")) {
      const fileName = urlPath.replace("/uploads/", "");
      const filePath = path.join(UPLOAD_DIR, fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log("[Repository] Файл удалён с диска: " + filePath);
        } catch (err: any) {
          console.log("[Repository] Не удалось удалить файл " + filePath + ": " + err.message);
        }
      }
    }
  }

  console.log("[Repository] Удалён материал ID " + id + ". Удалено копий у учеников: " + removed);

  if (typeof (db as any).save === "function") (db as any).save();
  res.json({ ok: true, removed_copies: removed });
});

// Import entire playlist from repository into course themes
const importPlaylistHandler = (req: Request, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  const course = db.courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ detail: "Курс не найден" });

  const playlistName = (req.body.playlist_name || "").trim();
  if (!playlistName) return res.status(400).json({ detail: "Выберите плейлист из накопителя" });

  const customTitle = (req.body.title || "").trim() || playlistName;
  const existingThemes = db.themes.filter((t) => t.course_id === courseId);
  const nextThemeOrder = req.body.order_index !== undefined && req.body.order_index !== ""
    ? Number(req.body.order_index)
    : (existingThemes.length + 1);

  const themeId = db.getId("theme");
  const newTheme = {
    id: themeId,
    course_id: courseId,
    title: customTitle,
    order_index: nextThemeOrder,
  };
  db.themes.push(newTheme);

  // Find all materials in repository for this playlist
  const repoItems = db.storageMaterials
    .filter((m) => m.playlist_name.trim().toLowerCase() === playlistName.toLowerCase())
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);

  for (const item of repoItems) {
    db.materials.push({
      id: db.getId("material"),
      theme_id: themeId,
      repository_material_id: item.id,
      storage_id: item.id,
      title: item.title,
      type: item.type,
      url: item.url,
      order_index: item.order_index || 0,
    });
  }

  res.json({
    ok: true,
    theme: newTheme,
    imported_count: repoItems.length,
  });
};

// Register import-playlist routes (legacy import-theme kept as alias)
for (const base of ["/api/staff", "/api/admin", "/api/manager"]) {
  app.post(
    [`${base}/courses/:course_id/import-playlist`, `${base}/courses/:course_id/import-theme`],
    authMiddleware,
    requireRole("admin", "manager"),
    importPlaylistHandler
  );
}

// Attach single material from repository to course theme
app.post(["/api/staff/courses/:course_id/themes/:theme_id/attach-material", "/api/admin/courses/:course_id/themes/:theme_id/attach-material", "/api/manager/courses/:course_id/themes/:theme_id/attach-material"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема курса не найдена" });

  const repoMatId = Number(req.body.repository_material_id);
  const repoItem = db.storageMaterials.find((x) => x.id === repoMatId);
  if (!repoItem) return res.status(404).json({ detail: "Материал не найден в накопителе" });

  if (db.materials.find((m) => m.repository_material_id === repoMatId && m.theme_id === themeId)) {
    return res.status(400).json({ detail: "Материал уже привязан к этой теме" });
  }

  const existing = db.materials.filter((m) => m.theme_id === themeId);
  const nextOrder = req.body.order_index !== undefined && req.body.order_index !== ""
    ? Number(req.body.order_index)
    : (existing.length + 1);

  const newMat: Material = {
    id: db.getId("material"),
    theme_id: themeId,
    repository_material_id: repoItem.id,
    title: repoItem.title,
    type: repoItem.type,
    url: repoItem.url,
    order_index: nextOrder,
  };
  db.materials.push(newMat);

  res.json({ ok: true, material: newMat });
});

// Import playlist from repository into course extra-materials
const importExtraPlaylistHandler = (req: Request, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  const course = db.courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ detail: "Курс не найден" });

  const playlistName = (req.body.playlist_name || "").trim();
  if (!playlistName) return res.status(400).json({ detail: "Выберите плейлист из накопителя" });

  const repoItems = db.storageMaterials
    .filter((m) => m.playlist_name.trim().toLowerCase() === playlistName.toLowerCase())
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);

  const existing = db.extraMaterials.filter((em) => {
    normalizeExtraMaterial(em);
    return em.course_ids.includes(courseId);
  });
  let curOrder = existing.length + 1;
  const created = [];

  for (const item of repoItems) {
    const emId = db.getId("extraMaterial");
    const em: ExtraMaterial = {
      id: emId,
      course_id: courseId,
      course_ids: [courseId],
      group_ids: [],
      title: item.title,
      description: item.description || "",
      type: item.type,
      url: item.url,
      order_index: curOrder++,
      created_at: new Date().toISOString(),
    };
    db.extraMaterials.push(em);
    created.push(em);
  }

  res.json({ ok: true, count: created.length });
};

// Register import-extra-playlist routes (legacy import-extra-theme kept as alias)
for (const base of ["/api/staff", "/api/admin", "/api/manager"]) {
  app.post(
    [`${base}/courses/:course_id/import-extra-playlist`, `${base}/courses/:course_id/import-extra-theme`],
    authMiddleware,
    requireRole("admin", "manager"),
    importExtraPlaylistHandler
  );
}

// Attach single material from repository into course extra-materials
app.post(["/api/staff/courses/:course_id/attach-extra-material", "/api/admin/courses/:course_id/attach-extra-material", "/api/manager/courses/:course_id/attach-extra-material"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const courseId = parseInt(req.params.course_id, 10);
  const course = db.courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ detail: "Курс не найден" });

  const repoMatId = Number(req.body.repository_material_id);
  const repoItem = db.storageMaterials.find((x) => x.id === repoMatId);
  if (!repoItem) return res.status(404).json({ detail: "Материал не найден в накопителе" });

  const existing = db.extraMaterials.filter((em) => {
    normalizeExtraMaterial(em);
    return em.course_ids.includes(courseId);
  });
  const nextOrder = req.body.order_index !== undefined && req.body.order_index !== ""
    ? Number(req.body.order_index)
    : (existing.length + 1);

  const emId = db.getId("extraMaterial");
  const em: ExtraMaterial = {
    id: emId,
    course_id: courseId,
    course_ids: [courseId],
    group_ids: [],
    title: repoItem.title,
    description: repoItem.description || "",
    type: repoItem.type,
    url: repoItem.url,
    order_index: nextOrder,
    created_at: new Date().toISOString(),
  };
  db.extraMaterials.push(em);

  res.json({ ok: true, material: getExtraMaterialDetails(em) });
});

app.get("/api/public/extra-material/:id", (req: Request, res: Response) => {
  const em = db.extraMaterials.find((x) => x.id === parseInt(req.params.id, 10));
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  res.json({ id: em.id, title: em.title, course_id: em.course_id });
});

// -------------------------------------------------------------
// VITE / STATIC FALLBACK & START
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
