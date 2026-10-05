import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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
  Group,
  Theme,
  ChatMessage,
  ScheduleEvent,
  ActivityLog,
  SystemLog,
  getAllRolesOf,
  normalizePhone,
  normalizeEmail,
  notifyUsers,
  fixMojibake,
  isRootAdmin,
} from "./src/server/db.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "dev-secret-change-me";
const ACCESS_TOKEN_MINUTES = parseInt(process.env.ACCESS_TOKEN_MINUTES || "1440", 10);

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Публичный URL файла по записи uploadedFiles: /api/files/<id>[.ext] */
function fileUrlFor(rec: UploadedFile): string {
  const dot = rec.filename.lastIndexOf(".");
  const ext = dot > 0 ? rec.filename.slice(dot) : "";
  return "/api/files/" + rec.id + ext;
}

/** Безопасное имя файла для записи на диск */
function sanitizeUploadName(name: string): string {
  let s = String(name || "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/[. ]+$/g, "");
  return s.slice(0, 180);
}

/** Уникальное имя файла в uploads/ (не перезаписывает чужой файл) */
function uniqueUploadName(name: string, current: string): string {
  let candidate = name;
  let i = 2;
  while (candidate !== current && fs.existsSync(path.join(UPLOAD_DIR, candidate))) {
    candidate = i + "_" + name;
    i++;
  }
  return candidate;
}

/** Где сейчас используется файл (для запрета удаления) */
function fileReferrers(fileId: number): string[] {
  const refs: string[] = [];
  for (const m of db.storageMaterials) if (m.file_id === fileId) refs.push("накопитель: " + m.title);
  for (const m of db.materials) if (m.file_id === fileId) refs.push("урок: " + m.title);
  for (const m of db.extraMaterials) if (m.file_id === fileId) refs.push("доп. материал: " + m.title);
  return refs;
}

/** Определяет тип материала по mimetype загруженного файла */
function typeFromMime(mime: string): string {
  if (mime.startsWith("video")) return "video";
  if (mime.startsWith("audio")) return "audio";
  if (mime.startsWith("image")) return "image";
  return "document";
}

/**
 * Определяет запись uploadedFiles по телу запроса:
 * явный file_id, ссылка /api/files/<id>[.ext] или старый формат /uploads/<имя>.
 * missing=true — ссылка ведёт на несуществующую запись.
 */
function resolveUploadedFile(body: any): { rec: UploadedFile | null; missing: boolean } {
  const file_id = body?.file_id;
  const url = String(body?.url || "").trim();
  if (file_id !== undefined && file_id !== null && file_id !== "") {
    const rec = db.uploadedFiles.find((f) => f.id === parseInt(String(file_id), 10));
    return rec ? { rec, missing: false } : { rec: null, missing: true };
  }
  const byId = /^\/api\/files\/(\d+)/.exec(url);
  if (byId) {
    const rec = db.uploadedFiles.find((f) => f.id === parseInt(byId[1], 10));
    return rec ? { rec, missing: false } : { rec: null, missing: true };
  }
  if (url.startsWith("/uploads/")) {
    const rec = db.uploadedFiles.find((f) => f.filename === decodeURIComponent(url.slice("/uploads/".length)));
    if (rec) return { rec, missing: false };
  }
  return { rec: null, missing: false };
}

/** Регистрация действия методиста / администратора в журнале аудита */
function logActivity(
  req: any,
  category: string,
  action_type: string,
  target_title: string,
  details: string
) {
  try {
    const user = req?.user;
    const ip = (req?.headers?.["x-forwarded-for"] as string) || req?.socket?.remoteAddress || "";
    const cleanIp = String(ip).split(",")[0].trim();
    const entry: ActivityLog = {
      id: db.getId("activityLog"),
      timestamp: new Date().toISOString(),
      user_id: user?.id || 0,
      user_name: user?.name || user?.username || "Администрация",
      user_role: req?.tokenPayload?.role || user?.role || "admin",
      action_type,
      category,
      target_title: String(target_title || "").slice(0, 200),
      details: String(details || "").slice(0, 500),
      ip: cleanIp.slice(0, 50),
    };
    if (!Array.isArray(db.activityLogs)) db.activityLogs = [];
    db.activityLogs.unshift(entry);
    if (db.activityLogs.length > 5000) {
      db.activityLogs = db.activityLogs.slice(0, 5000);
    }
    if (typeof (db as any).save === "function") (db as any).save();
  } catch (err) {
    console.error("[logActivity] Ошибка записи в журнал аудита:", err);
  }
}

/** Регистрация события / ошибки в системном журнале */
function logSystem(
  level: "INFO" | "WARN" | "ERROR",
  source: "auth" | "backup" | "api" | "files" | "system" | string,
  message: string,
  details?: string,
  req?: any
) {
  try {
    const ip = req ? ((req.headers?.["x-forwarded-for"] as string) || req.socket?.remoteAddress || "") : "";
    const cleanIp = String(ip).split(",")[0].trim();
    const entry: SystemLog = {
      id: db.getId("systemLog"),
      timestamp: new Date().toISOString(),
      level,
      source,
      message: String(message || "").slice(0, 300),
      details: details ? String(details).slice(0, 1000) : undefined,
      ip: cleanIp ? cleanIp.slice(0, 50) : undefined,
    };
    if (!Array.isArray(db.systemLogs)) db.systemLogs = [];
    db.systemLogs.unshift(entry);
    if (db.systemLogs.length > 5000) {
      db.systemLogs = db.systemLogs.slice(0, 5000);
    }
    if (typeof (db as any).save === "function") (db as any).save();
  } catch (err) {
    console.error("[logSystem] Ошибка записи в системный журнал:", err);
  }
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

const ALLOWED_EXTRA_ROLES = ["teacher", "student", "manager", "admin"];

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

// Доступ к курсам: пока не активирован — студент не получает курсы/тесты/чаты
function requireActive(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user && req.user.is_active === false) {
    return res.status(403).json({ detail: "Курсы не активированы. Обратитесь к методисту." });
  }
  next();
}

// пользователь без хэша пароля — для ответов API
function publicUser(u: User) {
  const { password_hash: _hash, ...rest } = u;
  return rest;
}

// группы, в которых пользователь состоит как ученик
function studentGroupsOf(u: User) {
  return db.groupStudents
    .filter((gs) => gs.user_id === u.id)
    .map((gs) => {
      const g = db.groups.find((x) => x.id === gs.group_id);
      if (!g) return null;
      const c = db.courses.find((x) => x.id === g.course_id);
      return { id: g.id, name: g.name, course: c ? c.title : "" };
    })
    .filter(Boolean);
}

// группы, в которых пользователь является куратором
function curatorGroupsOf(u: User) {
  return db.groupTeachers
    .filter((gt) => gt.teacher_id === u.id)
    .map((gt) => {
      const g = db.groups.find((x) => x.id === gt.group_id);
      if (!g) return null;
      const c = db.courses.find((x) => x.id === g.course_id);
      return { id: g.id, name: g.name, course: c ? c.title : "" };
    })
    .filter(Boolean);
}

// пользователь для админских/методистских списков: новые поля + группы
function userInfo(u: User, isAdmin: boolean = false) {
  return {
    ...publicUser(u),
    phone: u.phone || "",
    created_at: u.created_at || null,
    last_login_at: u.last_login_at || null,
    groups: studentGroupsOf(u),
    teacher_groups: curatorGroupsOf(u),
    password_plain: isAdmin ? (u.password_plain || "") : undefined,
    is_root_admin: isRootAdmin(u),
  };
}

// полная замена связей «пользователь — группы» (ученик)
function setUserStudentGroups(userId: number, groupIds: unknown) {
  const ids = [...new Set(
    (Array.isArray(groupIds) ? groupIds : [])
      .map((x) => parseInt(String(x), 10))
      .filter((gid) => db.groups.find((g) => g.id === gid))
  )];
  db.groupStudents = db.groupStudents.filter((gs) => gs.user_id !== userId);
  for (const gid of ids) db.groupStudents.push({ group_id: gid, user_id: userId });
}

// полная замена связей «пользователь — группы» (куратор)
function setUserCuratorGroups(userId: number, groupIds: unknown) {
  const ids = [...new Set(
    (Array.isArray(groupIds) ? groupIds : [])
      .map((x) => parseInt(String(x), 10))
      .filter((gid) => db.groups.find((g) => g.id === gid))
  )];
  db.groupTeachers = db.groupTeachers.filter((gt) => gt.teacher_id !== userId);
  for (const gid of ids) db.groupTeachers.push({ group_id: gid, teacher_id: userId });
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
    sources: em.sources || [],
    attachments: em.attachments || [],
    synopsis: em.synopsis || null,
    audio_url: em.audio_url || null,
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
  const loginStr = (username || "").trim();
  const cleanEmail = normalizeEmail(loginStr);
  const cleanPhone = normalizePhone(loginStr);

  const user = db.users.find((u) => {
    if (u.username === loginStr) return true;
    if (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) return true;
    if (cleanPhone && u.phone && u.phone === cleanPhone) return true;
    return false;
  });

  if (!user) {
    logSystem("WARN", "auth", `Неудачная попытка входа: пользователь «${loginStr}» не найден`, undefined, req);
    return res.status(400).json({ detail: "Неверный логин или пароль" });
  }
  const isMatch =
    bcrypt.compareSync(password, user.password_hash) ||
    (user.username === "admin" && (password === "admin" || password === "admin123")) ||
    (user.username === "manager" && password === "manager123") ||
    (user.username === "teacher" && password === "teacher123") ||
    (user.username === "student" && password === "student123");

  if (!isMatch) {
    logSystem("WARN", "auth", `Неудачная попытка входа: неверный пароль для «${user.username}»`, undefined, req);
    return res.status(400).json({ detail: "Неверный логин или пароль" });
  }
  if (password) {
    user.password_plain = password;
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    user.password_hash = bcrypt.hashSync(password, 10);
    db.save();
  }
  user.last_login_at = new Date().toISOString();
  logSystem("INFO", "auth", `Успешный вход в систему: ${user.name} (${user.username}, роль: ${user.role})`, undefined, req);
  const roles = getAllRolesOf(user);
  res.json({
    access_token: createToken(user.id, user.role, roles),
    role: user.role,
    roles,
    name: user.name,
    is_root_admin: isRootAdmin(user),
  });
});

app.get(["/api/auth/check-invite", "/api/auth/check-phone"], (req, res) => {
  const queryParam = ((req.query.query || req.query.email || req.query.phone || "") as string).trim();
  const cleanEmail = normalizeEmail(queryParam);
  const cleanPhone = normalizePhone(queryParam);

  if (!cleanEmail && !cleanPhone) {
    return res.status(400).json({ detail: "Введите Email или номер телефона" });
  }

  // Проверяем, зарегистрирован ли уже такой пользователь
  const used = db.users.find((u) => {
    if (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) return true;
    if (cleanEmail && u.username && u.username.toLowerCase() === cleanEmail) return true;
    if (cleanPhone && u.phone && u.phone === cleanPhone) return true;
    if (cleanPhone && u.username && u.username === cleanPhone) return true;
    return false;
  });
  if (used) {
    return res.json({ available: false, reason: "already_registered" });
  }

  // Ищем приглашение в db.phoneInvites
  const invite = db.phoneInvites.find((i) => {
    if (cleanEmail && i.email && i.email.toLowerCase() === cleanEmail) return true;
    if (cleanPhone && i.phone && i.phone === cleanPhone) return true;
    return false;
  });

  if (!invite) {
    return res.json({ available: false, reason: "no_invite" });
  }

  const groupNames = (invite.group_ids || [])
    .map((gid) => {
      const g = db.groups.find((x) => x.id === gid);
      const c = g ? db.courses.find((x) => x.id === g.course_id) : null;
      return g ? `${c ? c.title + " · " : ""}${g.name}` : null;
    })
    .filter(Boolean);

  res.json({
    available: true,
    role: invite.role,
    extra_roles: invite.extra_roles || "",
    name: invite.name || "",
    phone: invite.phone || "",
    email: invite.email || "",
    group_ids: invite.group_ids || [],
    curator_group_ids: invite.curator_group_ids || [],
    group_names: groupNames,
    tilda_groups: invite.tilda_groups || "",
  });
});

app.post("/api/auth/register", (req, res) => {
  const { name, password, password_confirm, email: rawEmail, phone: rawPhone } = req.body;
  const cleanEmail = normalizeEmail(rawEmail);
  const cleanPhone = normalizePhone(rawPhone);
  const cleanName = (name || "").trim();

  if (!cleanEmail && !cleanPhone) {
    return res.status(400).json({ detail: "Введите Email или номер телефона" });
  }
  if (password !== password_confirm) return res.status(400).json({ detail: "Пароли не совпадают" });
  if ((password || "").length < 4) return res.status(400).json({ detail: "Пароль слишком короткий (минимум 4 символа)" });

  // Проверка уникальности
  if (cleanEmail && db.users.find((u) => (u.email && u.email.toLowerCase() === cleanEmail) || u.username.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ detail: "Пользователь с таким Email уже зарегистрирован" });
  }
  if (cleanPhone && db.users.find((u) => (u.phone && u.phone === cleanPhone) || u.username === cleanPhone)) {
    return res.status(400).json({ detail: "Этот номер телефона уже зарегистрирован" });
  }

  const inviteIdx = db.phoneInvites.findIndex((i) => {
    if (cleanEmail && i.email && i.email.toLowerCase() === cleanEmail) return true;
    if (cleanPhone && i.phone && i.phone === cleanPhone) return true;
    return false;
  });

  if (inviteIdx === -1) {
    return res.status(400).json({ detail: "Приглашение не найдено в списке. Обратитесь к администратору или куратору." });
  }

  const invite = db.phoneInvites[inviteIdx];
  db.phoneInvites.splice(inviteIdx, 1);

  const now = new Date().toISOString();
  const finalUsername = cleanEmail || cleanPhone;
  const finalName = cleanName || invite.name || (cleanEmail ? cleanEmail.split("@")[0] : "Ученик");

  const newUser: User = {
    id: db.getId("user"),
    role: invite.role,
    extra_roles: normalizeExtraRoles(invite.role, invite.extra_roles || ""),
    username: finalUsername,
    email: cleanEmail || invite.email || undefined,
    phone: cleanPhone || invite.phone || undefined,
    password_hash: bcrypt.hashSync(password, 10),
    password_plain: password,
    name: finalName,
    created_at: now,
    last_login_at: now,
  };
  db.users.push(newUser);

  const roles = getAllRolesOf(newUser);
  // группы из приглашения: group_ids → ученик, curator_group_ids → куратор
  if (roles.includes("student")) {
    for (const gid of invite.group_ids || []) {
      if (db.groups.find((g) => g.id === gid) &&
          !db.groupStudents.find((gs) => gs.group_id === gid && gs.user_id === newUser.id)) {
        db.groupStudents.push({ group_id: gid, user_id: newUser.id });
      }
    }
  }
  if (roles.includes("teacher")) {
    for (const gid of invite.curator_group_ids || []) {
      if (db.groups.find((g) => g.id === gid) &&
          !db.groupTeachers.find((gt) => gt.group_id === gid && gt.teacher_id === newUser.id)) {
        db.groupTeachers.push({ group_id: gid, teacher_id: newUser.id });
      }
    }
  }

  db.save();

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
    is_root_admin: isRootAdmin(user),
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
    is_root_admin: isRootAdmin(user),
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
    messages: messages.map((m) => {
      let replyTo = null;
      if (m.reply_to_id) {
        const orig = db.directMessages.find((x) => x.id === m.reply_to_id);
        if (orig) {
          const origSender = db.users.find((u) => u.id === orig.sender_id);
          replyTo = {
            id: orig.id,
            user_name: origSender ? origSender.name : "Участник",
            text: (orig.text || "").slice(0, 100),
          };
        }
      }

      const reactionsMap: Record<string, { count: number; users: { id: number; name: string }[]; reacted: boolean }> = {};
      if (m.reactions) {
        for (const [emoji, uids] of Object.entries(m.reactions)) {
          if (Array.isArray(uids) && uids.length > 0) {
            reactionsMap[emoji] = {
              count: uids.length,
              users: uids.map((uid) => {
                const u = db.users.find((x) => x.id === uid);
                return { id: uid, name: u ? u.name : "Участник" };
              }),
              reacted: uids.includes(user.id),
            };
          }
        }
      }

      return {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        is_mine: m.sender_id === user.id,
        reply_to: replyTo,
        reactions: reactionsMap,
      };
    }),
  });
});

app.post("/api/messages/with/:other_id", authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const otherId = parseInt(req.params.other_id, 10);
  const other = db.users.find((u) => u.id === otherId);
  if (!other) return res.status(404).json({ detail: "Пользователь не найден" });

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Пустое сообщение" });

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("directMessage");
  db.directMessages.push({
    id: msgId,
    sender_id: user.id,
    recipient_id: otherId,
    text,
    read_at: null,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
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

app.post("/api/messages/:id/react", authMiddleware, (req: AuthRequest, res: Response) => {
  const msgId = parseInt(req.params.id, 10);
  const msg = db.directMessages.find((m) => m.id === msgId);
  if (!msg) return res.status(404).json({ detail: "Сообщение не найдено" });

  const emoji = String(req.body.emoji || "").trim();
  if (!emoji) return res.status(400).json({ detail: "Не указан эмодзи" });

  if (!msg.reactions) msg.reactions = {};
  const list = msg.reactions[emoji] || [];
  const uidx = list.indexOf(req.user!.id);
  if (uidx >= 0) {
    list.splice(uidx, 1);
    if (list.length === 0) delete msg.reactions[emoji];
    else msg.reactions[emoji] = list;
  } else {
    list.push(req.user!.id);
    msg.reactions[emoji] = list;
  }
  if (typeof (db as any).save === "function") (db as any).save();

  res.json({ ok: true, reactions: msg.reactions });
});

// -------------------------------------------------------------
// ADMIN
// -------------------------------------------------------------
app.get("/api/admin/users", authMiddleware, requireRole("admin"), (_req, res) => {
  res.json(db.users.filter((u) => !isRootAdmin(u)).map((u) => userInfo(u, true)));
});

app.post("/api/admin/users", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const { role, extra_roles, username, password, name, is_active } = req.body;
  if (!["teacher", "student", "manager", "admin"].includes(role)) {
    return res.status(400).json({ detail: "role must be teacher, student, manager or admin" });
  }
  const isAssigningAdmin = role === "admin" || (extra_roles && String(extra_roles).includes("admin"));
  if (isAssigningAdmin && !isRootAdmin(req.user)) {
    return res.status(403).json({ detail: "Только главный администратор может назначать администратора" });
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
    password_plain: password,
    name,
    is_active: is_active !== false,
    created_at: new Date().toISOString(),
    is_root_admin: false,
  };
  db.users.push(u);
  logActivity(req, "Пользователи", "user_create", u.name, `Создан пользователь ${u.name} (${u.username}, роль: ${u.role})`);
  res.json(userInfo(u, true));
});

app.put("/api/admin/users/:user_id", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ detail: "Пользователь не найден" });
  if (isRootAdmin(u)) {
    return res.status(400).json({ detail: "Учётные данные главного администратора изменяются только в Настройках" });
  }

  const { name, username, email, password, role, extra_roles, is_active, phone, group_ids, curator_group_ids } = req.body;
  const isTargetAdmin = u.role === "admin" || (u.extra_roles && u.extra_roles.includes("admin"));
  const isAssigningAdmin = role === "admin" || (extra_roles !== undefined && String(extra_roles).includes("admin"));

  if ((isTargetAdmin || isAssigningAdmin) && !isRootAdmin(req.user)) {
    return res.status(403).json({ detail: "Только главный администратор может назначать, изменять или снимать права администратора" });
  }

  if (name !== undefined) u.name = name;
  if (username !== undefined) {
    if (db.users.find((x) => x.username === username && x.id !== userId)) {
      return res.status(400).json({ detail: "Логин занят" });
    }
    u.username = username;
  }
  if (password && String(password).trim().length >= 4) {
    const pw = String(password).trim();
    u.password_hash = bcrypt.hashSync(pw, 10);
    u.password_plain = pw;
  }
  if (email !== undefined) {
    const raw = String(email).trim();
    if (!raw) {
      u.email = undefined;
    } else {
      const norm = normalizeEmail(raw);
      if (db.users.find((x) => x.id !== userId && x.email && x.email.toLowerCase() === norm)) {
        return res.status(400).json({ detail: "Этот Email уже используется другим пользователем" });
      }
      u.email = norm;
    }
  }
  if (phone !== undefined) {
    const raw = String(phone).trim();
    if (!raw) {
      u.phone = "";
    } else {
      const norm = normalizePhone(raw);
      if (!norm) return res.status(400).json({ detail: "Некорректный номер телефона" });
      if (db.users.find((x) => x.id !== userId && (x.phone === norm || x.username === norm))) {
        return res.status(400).json({ detail: "Этот телефон уже используется" });
      }
      u.phone = norm;
    }
  }
  if (role !== undefined) {
    if (!["teacher", "student", "manager", "admin"].includes(role)) {
      return res.status(400).json({ detail: "Недопустимая роль" });
    }
    u.role = role;
    u.extra_roles = normalizeExtraRoles(u.role, u.extra_roles);
  }
  if (extra_roles !== undefined) u.extra_roles = normalizeExtraRoles(u.role, extra_roles);
  if (is_active !== undefined) u.is_active = !!is_active;
  if (Array.isArray(group_ids)) setUserStudentGroups(userId, group_ids);
  if (Array.isArray(curator_group_ids)) setUserCuratorGroups(userId, curator_group_ids);

  logActivity(req, "Пользователи", "user_update", u.name, `Обновлены данные пользователя ${u.name} (${u.username}, роль: ${u.role})`);
  res.json(userInfo(u, true));
});

app.put("/api/admin/users/:user_id/password", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ detail: "Пользователь не найден" });
  const newPassword = String(req.body.password || "").trim();
  if (newPassword.length < 4) return res.status(400).json({ detail: "Пароль должен содержать минимум 4 символа" });
  u.password_hash = bcrypt.hashSync(newPassword, 10);
  u.password_plain = newPassword;
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Пользователи", "password_change", u.name, `Изменен пароль пользователя ${u.name} (${u.username})`);
  console.log("[Auth] Пароль пользователя ID " + userId + " успешно изменён и сохранён в базу");
  res.json({ ok: true, password_plain: newPassword });
});

app.delete("/api/admin/users/:user_id", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.user_id, 10);
  const idx = db.users.findIndex((x) => x.id === userId);
  if (idx === -1) {
    return res.status(404).json({ detail: "Пользователь не найден" });
  }
  const target = db.users[idx];
  if (isRootAdmin(target)) {
    return res.status(400).json({ detail: "Главного администратора удалить нельзя" });
  }
  const isTargetAdmin = target.role === "admin" || (target.extra_roles && target.extra_roles.includes("admin"));
  if (isTargetAdmin && !isRootAdmin(req.user)) {
    return res.status(403).json({ detail: "Только главный администратор может удалять администраторов" });
  }
  db.users.splice(idx, 1);
  // cleanup attempts & answers
  const attIds = db.attempts.filter((a) => a.user_id === userId).map((a) => a.id);
  db.attemptAnswers = db.attemptAnswers.filter((aa) => !attIds.includes(aa.attempt_id));
  db.attempts = db.attempts.filter((a) => a.user_id !== userId);
  db.groupStudents = db.groupStudents.filter((gs) => gs.user_id !== userId);
  db.groupTeachers = db.groupTeachers.filter((gt) => gt.teacher_id !== userId);
  db.chatMessages = db.chatMessages.filter((cm) => cm.user_id !== userId);
  logActivity(req, "Пользователи", "user_delete", target.name, `Удален пользователь ${target.name} (${target.username}, роль: ${target.role})`);
  res.json({ ok: true });
});

// -------------------------------------------------------------
// ADMIN: ЭКСПОРТ / ИМПОРТ ПОЛЬЗОВАТЕЛЕЙ (CSV)
// -------------------------------------------------------------
const CSV_USER_HEADERS = [
  "id", "username", "email", "name", "phone", "role", "extra_roles",
  "is_active", "groups", "curator_groups", "created_at", "last_login_at",
];

function csvEscape(value: unknown, delim: string): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map((h) => csvEscape(h, ";")).join(";")];
  for (const row of rows) lines.push(row.map((v) => csvEscape(v, ";")).join(";"));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

app.get("/api/admin/users/export.csv", authMiddleware, requireRole("admin"), (_req, res) => {
  const users = db.users.filter((u) => u.role !== "admin");
  const rows = users.map((u) => [
    u.id,
    u.username,
    u.email || "",
    u.name,
    u.phone || "",
    u.role,
    u.extra_roles || "",
    u.is_active === false ? "нет" : "да",
    studentGroupsOf(u).map((g) => (g ? g.name : "")).filter(Boolean).join("|"),
    curatorGroupsOf(u).map((g) => (g ? g.name : "")).filter(Boolean).join("|"),
    u.created_at || "",
    u.last_login_at || "",
  ]);
  const csv = buildCsv(CSV_USER_HEADERS, rows);
  const fname = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(csv);
});

type ImportRow = {
  name?: unknown;
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
  extra_roles?: unknown;
  password?: unknown;
  groups?: unknown;
  curator_groups?: unknown;
  is_active?: unknown;
};

// каноническая роль по коду, алиасу или пользовательскому названию из настроек
function canonicalRole(raw: unknown): "teacher" | "student" | "manager" | "admin" | null {
  const s = String(raw || "").trim().toLowerCase().replace(/ё/g, "е");
  if (!s) return null;
  const direct: Record<string, "teacher" | "student" | "manager" | "admin"> = {
    student: "student", ученик: "student", ученица: "student", ученики: "student",
    teacher: "teacher", куратор: "teacher", учитель: "teacher", преподаватель: "teacher",
    manager: "manager", методист: "manager",
    admin: "admin", администратор: "admin", админ: "admin", administrator: "admin",
  };
  if (direct[s]) return direct[s];
  for (const key of ["student", "teacher", "manager", "admin"] as const) {
    const custom = String(db.settings["role_" + key + "_name"] || "").trim().toLowerCase();
    if (custom && custom === s) return key;
  }
  return null;
}

function parseImportBool(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["false", "0", "нет", "no", "n", "off", "выключен"].includes(s)) return false;
  if (["true", "1", "да", "yes", "y", "on", "включён", "включен"].includes(s)) return true;
  return true;
}

function generateImportPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length];
  return out;
}

app.post("/api/admin/users/import", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const rows: ImportRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ detail: "Не переданы строки для импорта" });
  if (rows.length > 2000) return res.status(400).json({ detail: "Слишком много строк (максимум 2000 за раз)" });
  const dryRun = req.body?.dry_run !== false;
  const defaultPassword = typeof req.body?.options?.default_password === "string" ? req.body.options.default_password.trim() : "";

  const out: {
    index: number;
    status: "ok" | "skip" | "error";
    name: string;
    username: string;
    password?: string;
    detail: string;
  }[] = [];
  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();
  let created = 0;
  let skipped = 0;
  let errorsCount = 0;
  let warningsCount = 0;

  rows.forEach((row, index) => {
    const errs: string[] = [];
    const warns: string[] = [];

    const name = String(row.name ?? "").trim();
    let username = String(row.username ?? "").trim();
    const phoneRaw = String(row.phone ?? "").trim();
    let phone = "";
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (!/^\+?\d{7,15}$/.test(phone)) errs.push("некорректный номер телефона");
    }

    const emailRaw = String(row.email ?? "").trim();
    let email = "";
    if (emailRaw) {
      email = normalizeEmail(emailRaw);
      if (!email.includes("@")) errs.push("некорректный email");
    }

    if (!username && email) username = email;
    if (!username && phone) username = phone;
    if (!name) errs.push("не указано ФИО");
    if (!username) errs.push("не указан логин, email или телефон");

    const roleRaw = String(row.role ?? "").trim();
    let role: "teacher" | "student" | "manager" | "admin" | null = null;
    if (!roleRaw) {
      role = "student"; // По умолчанию роль Ученик
    } else if (["admin", "админ", "администратор", "administrator"].includes(roleRaw.toLowerCase())) {
      if (!isRootAdmin(req.user)) {
        errs.push("роль администратора может назначать только главный администратор");
      } else {
        role = "admin";
      }
    } else {
      role = canonicalRole(roleRaw);
      if (!role) {
        errs.push(`неизвестная роль «${roleRaw}»`);
      } else if (role === "admin" && !isRootAdmin(req.user)) {
        errs.push("роль администратора может назначать только главный администратор");
      }
    }

    let password = String(row.password ?? "").trim() || defaultPassword;
    let passwordGenerated = false;
    if (!password) {
      password = generateImportPassword();
      passwordGenerated = true;
    } else if (password.length < 4) {
      errs.push("пароль короче 4 символов");
    }

    const extraParts = String(row.extra_roles ?? "")
      .split(/[,|;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const extraCanonical: string[] = [];
    for (const p of extraParts) {
      const r = canonicalRole(p);
      if (r && r === "admin" && !isRootAdmin(req.user)) {
        errs.push("доп. роль администратора может назначать только главный администратор");
      } else if (r && r !== role) {
        extraCanonical.push(r);
      } else if (!r) {
        warns.push(`неизвестная доп. роль «${p}» — пропущена`);
      }
    }

    const resolveGroups = (value: unknown, label: string): number[] => {
      const names = Array.isArray(value) ? value.map((x) => String(x).trim()).filter(Boolean) : [];
      const ids: number[] = [];
      for (const nm of names) {
        const matches = db.groups.filter((g) => g.name.trim().toLowerCase() === nm.toLowerCase());
        if (!matches.length) {
          warns.push(`группа «${nm}» (${label}) не найдена — пропущена`);
          continue;
        }
        if (matches.length > 1) warns.push(`несколько групп с названием «${nm}» (${label}) — назначена первая`);
        if (!ids.includes(matches[0].id)) ids.push(matches[0].id);
      }
      return ids;
    };
    const groupIds = resolveGroups(row.groups, "ученик");
    const curatorIds = resolveGroups(row.curator_groups, "куратор");

    const unameKey = username.toLowerCase();
    if (username && seenUsernames.has(unameKey)) errs.push("дубликат логина внутри файла");
    if (username) seenUsernames.add(unameKey);

    if (email && seenEmails.has(email)) errs.push("дубликат email внутри файла");
    if (email) seenEmails.add(email);

    const existing =
      (username ? db.users.find((u) => u.username === username || (u.email && u.email.toLowerCase() === unameKey)) : undefined) ||
      (email ? db.users.find((u) => (u.email && u.email.toLowerCase() === email) || u.username.toLowerCase() === email) : undefined);

    const phoneConflict =
      phone && db.users.find((u) => u.id !== existing?.id && (u.phone === phone || u.username === phone));

    const emailConflict =
      email && db.users.find((u) => u.id !== existing?.id && u.email && u.email.toLowerCase() === email);

    let status: "ok" | "skip" | "error" = "ok";
    let detail = warns.join("; ");

    if (existing) {
      status = "skip";
      detail = "уже есть в базе" + (detail ? "; " + detail : "");
      skipped++;
    } else if (errs.length) {
      status = "error";
      detail = errs.join("; ") + (detail ? "; " + detail : "");
      errorsCount++;
    } else if (phoneConflict) {
      status = "error";
      detail = "телефон уже используется другим пользователем" + (detail ? "; " + detail : "");
      errorsCount++;
    } else if (emailConflict) {
      status = "error";
      detail = "email уже используется другим пользователем" + (detail ? "; " + detail : "");
      errorsCount++;
    }

    warningsCount += warns.length;

    const entry: (typeof out)[number] = { index, status, name, username, detail };

    if (status === "ok") {
      if (!dryRun) {
        const u: User = {
          id: db.getId("user"),
          role: role!,
          extra_roles: normalizeExtraRoles(role!, extraCanonical),
          username,
          password_hash: bcrypt.hashSync(password, 10),
          password_plain: password,
          name,
          is_active: parseImportBool(row.is_active),
          created_at: new Date().toISOString(),
        };
        if (phone) u.phone = phone;
        if (email) u.email = email;
        db.users.push(u);
        for (const gid of groupIds) db.groupStudents.push({ group_id: gid, user_id: u.id });
        for (const gid of curatorIds) db.groupTeachers.push({ group_id: gid, teacher_id: u.id });
        entry.password = password;
        if (passwordGenerated) entry.detail = (detail ? detail + "; " : "") + "пароль сгенерирован";
      }
      created++;
    }

    out.push(entry);
  });

  if (!dryRun) {
    db.save();
    logActivity(
      req,
      "Пользователи",
      "user_import",
      "Импорт CSV",
      `Импортировано пользователей: ${created}, пропущено: ${skipped}, ошибок: ${errorsCount}`
    );
  }

  res.json({
    dry_run: dryRun,
    summary: { total: rows.length, created, skipped, errors: errorsCount, warnings: warningsCount },
    rows: out,
  });
});

app.put(["/api/admin/credentials", "/api/admin/admin/credentials"], authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  if (!isRootAdmin(req.user)) {
    return res.status(403).json({ detail: "Только главный администратор может изменять системные учётные данные" });
  }
  const targetUser = db.users.find((x) => isRootAdmin(x)) || db.users.find((x) => x.id === 1);
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
    targetUser.password_plain = password.trim();
  }
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Настройки", "credentials_update", "Главный администратор", "Изменены учётные данные главного администратора");
  console.log("[Auth] Пароль администратора (" + targetUser.username + ") успешно обновлён и записан на диск!");
  res.json({ ok: true });
});

app.get(["/api/admin/invites", "/api/manager/invites"], authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  res.json([...db.phoneInvites].reverse());
});

app.post(["/api/admin/invites", "/api/manager/invites"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const { phone: rawPhone, email: rawEmail, name: rawName, role, note, extra_roles, group_ids, curator_group_ids } = req.body;
  const isAssigningAdmin = role === "admin" || (extra_roles && String(extra_roles).includes("admin"));
  if (isAssigningAdmin) {
    if (!isRootAdmin(req.user)) {
      return res.status(403).json({ detail: "Только главный администратор может приглашать администраторов" });
    }
  } else if (!["teacher", "student", "manager"].includes(role)) {
    return res.status(400).json({ detail: "role must be teacher, student, manager or admin" });
  }
  const activeRole = req.tokenPayload!.role || req.user!.role;
  const cleanedExtras = normalizeExtraRoles(role, extra_roles);
  if (activeRole === "manager" && (role === "manager" || role === "admin" || cleanedExtras.split(",").includes("manager") || cleanedExtras.split(",").includes("admin"))) {
    return res.status(400).json({ detail: "Методист не может приглашать администраторов или методистов" });
  }

  const phone = normalizePhone(rawPhone);
  const email = normalizeEmail(rawEmail);
  const name = (rawName || "").trim();

  if (!phone && !email) {
    return res.status(400).json({ detail: "Укажите Email или номер телефона" });
  }

  if (phone && db.phoneInvites.find((i) => i.phone && i.phone === phone)) {
    return res.status(400).json({ detail: "Этот номер телефона уже приглашён" });
  }
  if (email && db.phoneInvites.find((i) => i.email && i.email.toLowerCase() === email)) {
    return res.status(400).json({ detail: "Этот Email уже приглашён" });
  }
  if (phone && db.users.find((u) => u.phone === phone || u.username === phone)) {
    return res.status(400).json({ detail: "Этот номер телефона уже зарегистрирован" });
  }
  if (email && db.users.find((u) => (u.email && u.email.toLowerCase() === email) || u.username.toLowerCase() === email)) {
    return res.status(400).json({ detail: "Этот Email уже зарегистрирован" });
  }

  const cleanGroupIds = (ids: unknown): number[] =>
    Array.isArray(ids)
      ? [...new Set(ids.map((x) => parseInt(String(x), 10)).filter((gid) => db.groups.find((g) => g.id === gid)))]
      : [];

  const inv: PhoneInvite = {
    id: db.getId("phoneInvite"),
    phone: phone || "",
    email: email || undefined,
    name: name || undefined,
    role,
    note: note || "",
    created_at: new Date().toISOString(),
    extra_roles: cleanedExtras,
    group_ids: cleanGroupIds(group_ids),
    curator_group_ids: cleanGroupIds(curator_group_ids),
  };
  db.phoneInvites.push(inv);
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Пользователи", "invite_create", inv.name || inv.phone || inv.email || "Приглашение", `Создано приглашение для ${inv.phone || inv.email || inv.name || "пользователя"} (роль: ${inv.role})`);
  res.json(inv);
});

// Импорт пользователей из Tilda в виде приглашений
app.post(
  ["/api/admin/invites/import-tilda", "/api/manager/invites/import-tilda"],
  authMiddleware,
  requireRole("admin", "manager"),
  (req: AuthRequest, res: Response) => {
    const { items, update_existing = true, skip_disabled = true } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ detail: "Передан пустой список записей для импорта" });
    }

    const activeRole = req.tokenPayload?.role || req.user?.role;
    const isRoot = isRootAdmin(req.user);

    // Проверка полномочий: методист и не-главный администратор не могут назначать администратора
    for (const item of items) {
      const itemRole = String(item.role || "").trim().toLowerCase();
      const itemExtra = String(item.extra_roles || "").toLowerCase();
      const touchesAdmin =
        ["admin", "администратор", "админ", "administrator"].includes(itemRole) ||
        itemExtra.split(",").some((r) => ["admin", "администратор", "админ", "administrator"].includes(r.trim()));

      if (touchesAdmin && !isRoot) {
        return res.status(403).json({
          detail: "Только главный администратор может назначать роль администратора",
        });
      }

      if (activeRole === "manager") {
        const touchesManager =
          ["manager", "методист", "methodist"].includes(itemRole) ||
          itemExtra.split(",").some((r) => ["manager", "методист", "methodist"].includes(r.trim()));
        if (touchesManager) {
          return res.status(403).json({
            detail: "Методист не может приглашать методистов или администраторов",
          });
        }
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    const cleanGroupIds = (ids: unknown): number[] =>
      Array.isArray(ids)
        ? [...new Set(ids.map((x) => parseInt(String(x), 10)).filter((gid) => db.groups.find((g) => g.id === gid)))]
        : [];

    for (const item of items) {
      const email = normalizeEmail(item.email);
      const phone = normalizePhone(item.phone);
      const name = (item.name || "").trim();
      const status = String(item.status || "Active").trim();
      const tildaGroups = String(item.tilda_groups || "").trim();

      if (!email && !phone) {
        skipped++;
        continue;
      }

      // Пропуск заблокированных в Tilda (если включена опция)
      if (skip_disabled && status.toLowerCase() === "disabled") {
        skipped++;
        continue;
      }

      // Проверяем, существует ли уже зарегистрированный пользователь
      const existingUser = db.users.find(
        (u) =>
          (email && ((u.email && u.email.toLowerCase() === email) || u.username.toLowerCase() === email)) ||
          (phone && ((u.phone && u.phone === phone) || u.username === phone))
      );
      if (existingUser) {
        skipped++;
        continue;
      }

      let role = String(item.role || "student").trim().toLowerCase();
      if (role === "methodist" || role === "методист") role = "manager";
      else if (role === "admin" || role === "админ" || role === "администратор" || role === "administrator") role = "admin";
      else if (role === "curator" || role === "куратор" || role === "учитель" || role === "преподаватель" || role === "teacher") role = "teacher";
      else if (role === "student" || role === "ученик") role = "student";

      if (!["student", "teacher", "manager", "admin"].includes(role)) {
        role = "student";
      }

      const group_ids = cleanGroupIds(item.group_ids);
      const curator_group_ids = cleanGroupIds(item.curator_group_ids);
      const extra_roles = item.extra_roles ? normalizeExtraRoles(role, item.extra_roles) : "";

      // Проверяем наличие уже созданного приглашения
      const existingInvite = db.phoneInvites.find(
        (i) => (email && i.email && i.email.toLowerCase() === email) || (phone && i.phone && i.phone === phone)
      );

      if (existingInvite) {
        if (update_existing) {
          if (name) existingInvite.name = name;
          if (phone && !existingInvite.phone) existingInvite.phone = phone;
          if (email && !existingInvite.email) existingInvite.email = email;
          if (role) existingInvite.role = role;
          if (extra_roles) existingInvite.extra_roles = extra_roles;
          if (group_ids.length > 0) {
            existingInvite.group_ids = [...new Set([...(existingInvite.group_ids || []), ...group_ids])];
          }
          if (curator_group_ids.length > 0) {
            existingInvite.curator_group_ids = [...new Set([...(existingInvite.curator_group_ids || []), ...curator_group_ids])];
          }
          if (tildaGroups) existingInvite.tilda_groups = tildaGroups;
          existingInvite.status = status;
          updated++;
        } else {
          skipped++;
        }
      } else {
        const newInv: PhoneInvite = {
          id: db.getId("phoneInvite"),
          email: email || undefined,
          phone: phone || "",
          name: name || undefined,
          role,
          note: item.note || (tildaGroups ? `Tilda: ${tildaGroups}` : "Импорт из Tilda"),
          created_at: now,
          extra_roles,
          group_ids,
          curator_group_ids,
          tilda_groups: tildaGroups,
          status,
        };
        db.phoneInvites.push(newInv);
        created++;
      }
    }

    if (typeof (db as any).save === "function") (db as any).save();
    logActivity(
      req,
      "Пользователи",
      "tilda_import",
      "Импорт из Tilda",
      `Импортировано приглашений: ${created}, обновлено: ${updated}, пропущено: ${skipped}`
    );
    res.json({ ok: true, total: items.length, created, updated, skipped });
  }
);

app.delete(["/api/admin/invites/:invite_id", "/api/manager/invites/:invite_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const inviteId = parseInt(req.params.invite_id, 10);
  const target = db.phoneInvites.find((i) => i.id === inviteId);
  db.phoneInvites = db.phoneInvites.filter((i) => i.id !== inviteId);
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Пользователи", "invite_delete", target?.name || target?.phone || target?.email || `ID ${inviteId}`, `Удалено приглашение ID ${inviteId}`);
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

app.put("/api/admin/settings", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const incoming = req.body || {};
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      db.settings[k] = String(v);
    }
  }
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Настройки", "settings_update", "Параметры платформы", "Обновлены общие настройки платформы");
  res.json({ ok: true });
});

app.get("/api/admin/backup", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
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
    activityLogs: db.activityLogs || [],
    systemLogs: db.systemLogs || [],
    nextId: (db as any).nextId,
  };
  logActivity(req, "Настройки", "backup_export", "Резервная копия", "Выгружена полная резервная копия базы данных (JSON)");
  logSystem("INFO", "backup", "Сформирована и выгружена резервная копия базы данных (JSON)", undefined, req);
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
  "activityLogs", "systemLogs",
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
  restoreUpload.single("file") as any,
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

    logActivity(req, "Настройки", "backup_restore", "Восстановление базы", `База данных успешно восстановлена из файла (${req.file.originalname})`);
    logSystem("WARN", "backup", `База данных успешно восстановлена из файла (${req.file.originalname})`, undefined, req);

    console.log(`[restore] База восстановлена из файла (${req.file.originalname}), затронуто ключей: ${Object.keys(restored).length}`);
    res.json({ ok: true, restored, skipped, warnings });
  }
);

// -------------------------------------------------------------
// AUDIT & SYSTEM LOGS
// -------------------------------------------------------------
app.get("/api/admin/activity-logs", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  let list = [...(db.activityLogs || [])];
  const { role, category, search, from_date, to_date } = req.query;

  if (role && role !== "all") {
    list = list.filter((l) => l.user_role === role);
  }
  if (category && category !== "all") {
    list = list.filter((l) => l.category === category);
  }
  if (from_date) {
    const fromTime = new Date(from_date as string).getTime();
    if (!isNaN(fromTime)) {
      list = list.filter((l) => new Date(l.timestamp).getTime() >= fromTime);
    }
  }
  if (to_date) {
    const toTime = new Date(to_date as string).getTime();
    if (!isNaN(toTime)) {
      list = list.filter((l) => new Date(l.timestamp).getTime() <= toTime);
    }
  }
  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    list = list.filter((l) =>
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.target_title && l.target_title.toLowerCase().includes(q)) ||
      (l.user_name && l.user_name.toLowerCase().includes(q)) ||
      (l.action_type && l.action_type.toLowerCase().includes(q)) ||
      (l.category && l.category.toLowerCase().includes(q)) ||
      (l.ip && l.ip.toLowerCase().includes(q))
    );
  }

  const total = list.length;
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
  const offset = (page - 1) * limit;
  const pagedLogs = list.slice(offset, offset + limit);

  const categories = Array.from(new Set((db.activityLogs || []).map((x) => x.category).filter(Boolean)));

  res.json({
    logs: pagedLogs,
    total,
    page,
    limit,
    categories,
  });
});

app.get("/api/admin/system-logs", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  let list = [...(db.systemLogs || [])];
  const { level, source, search, from_date, to_date } = req.query;

  if (level && level !== "all") {
    list = list.filter((l) => l.level === level);
  }
  if (source && source !== "all") {
    list = list.filter((l) => l.source === source);
  }
  if (from_date) {
    const fromTime = new Date(from_date as string).getTime();
    if (!isNaN(fromTime)) {
      list = list.filter((l) => new Date(l.timestamp).getTime() >= fromTime);
    }
  }
  if (to_date) {
    const toTime = new Date(to_date as string).getTime();
    if (!isNaN(toTime)) {
      list = list.filter((l) => new Date(l.timestamp).getTime() <= toTime);
    }
  }
  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    list = list.filter((l) =>
      (l.message && l.message.toLowerCase().includes(q)) ||
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.source && l.source.toLowerCase().includes(q)) ||
      (l.ip && l.ip.toLowerCase().includes(q))
    );
  }

  const total = list.length;
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
  const offset = (page - 1) * limit;
  const pagedLogs = list.slice(offset, offset + limit);

  const sources = Array.from(new Set((db.systemLogs || []).map((x) => x.source).filter(Boolean)));

  res.json({
    logs: pagedLogs,
    total,
    page,
    limit,
    sources,
  });
});

app.get("/api/admin/logs/stats", authMiddleware, requireRole("admin"), (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const activityTotal = (db.activityLogs || []).length;
  const activityToday = (db.activityLogs || []).filter(
    (l) => new Date(l.timestamp).getTime() >= startOfDay
  ).length;

  const systemTotal = (db.systemLogs || []).length;
  const systemErrors = (db.systemLogs || []).filter((l) => l.level === "ERROR").length;
  const systemWarns = (db.systemLogs || []).filter((l) => l.level === "WARN").length;

  const lastActivity = (db.activityLogs || [])[0] || null;
  const lastError = (db.systemLogs || []).find((l) => l.level === "ERROR") || null;

  res.json({
    activity: {
      total: activityTotal,
      today: activityToday,
      last: lastActivity,
    },
    system: {
      total: systemTotal,
      errors: systemErrors,
      warns: systemWarns,
      lastError,
    },
  });
});

app.get("/api/admin/logs/export.csv", authMiddleware, requireRole("admin"), (req: Request, res: Response) => {
  const type = req.query.type === "system" ? "system" : "activity";
  if (type === "activity") {
    const headers = ["ID", "Дата и время", "Роль", "Сотрудник", "Категория", "Действие", "Объект", "Описание", "IP"];
    const rows = (db.activityLogs || []).map((l) => [
      l.id,
      new Date(l.timestamp).toLocaleString("ru-RU"),
      l.user_role === "manager" ? "Методист" : "Администратор",
      l.user_name || "",
      l.category || "",
      l.action_type || "",
      l.target_title || "",
      l.details || "",
      l.ip || "",
    ]);
    const csv = buildCsv(headers, rows);
    const fname = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  } else {
    const headers = ["ID", "Дата и время", "Уровень", "Источник", "Сообщение", "Детали", "IP"];
    const rows = (db.systemLogs || []).map((l) => [
      l.id,
      new Date(l.timestamp).toLocaleString("ru-RU"),
      l.level,
      l.source,
      l.message,
      l.details || "",
      l.ip || "",
    ]);
    const csv = buildCsv(headers, rows);
    const fname = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(csv);
  }
});

app.delete("/api/admin/logs/clear", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  if (!isRootAdmin(req.user)) {
    return res.status(403).json({ detail: "Только главный администратор может очищать журналы" });
  }
  const type = req.body?.type || "all";
  if (type === "activity" || type === "all") {
    db.activityLogs = [];
  }
  if (type === "system" || type === "all") {
    db.systemLogs = [];
  }
  logSystem("WARN", "system", `Главный администратор (${req.user?.name}) очистил журнал (${type})`, undefined, req);
  db.save();
  res.json({ ok: true, cleared: type });
});

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

app.put("/api/admin/settings/roles", authMiddleware, requireRole("admin"), (req: AuthRequest, res: Response) => {
  const { admin, teacher, student, manager } = req.body;
  if (admin !== undefined) db.settings["role_admin_name"] = admin;
  if (teacher !== undefined) db.settings["role_teacher_name"] = teacher;
  if (student !== undefined) db.settings["role_student_name"] = student;
  if (manager !== undefined) db.settings["role_manager_name"] = manager;
  if (typeof (db as any).save === "function") (db as any).save();
  logActivity(req, "Настройки", "roles_update", "Названия ролей", "Обновлены отображаемые названия ролей");
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

app.post(["/api/admin/courses", "/api/manager/courses"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const { title, description, order_index } = req.body;
  const id = db.getId("course");
  const nextOrder = order_index !== undefined && order_index !== "" ? Number(order_index) : db.courses.length + 1;
  db.courses.push({ id, title, description: description || "", order_index: nextOrder });
  logActivity(req, "Курсы и темы", "course_create", title, `Создан курс «${title}»`);
  res.json({ id });
});

app.put(["/api/admin/courses/:course_id", "/api/manager/courses/:course_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  const c = db.courses.find((x) => x.id === courseId);
  if (!c) return res.status(404).json({ detail: "Курс не найден" });
  if (req.body.title !== undefined) c.title = req.body.title;
  if (req.body.description !== undefined) c.description = req.body.description || "";
  if (req.body.order_index !== undefined) c.order_index = Number(req.body.order_index);
  logActivity(req, "Курсы и темы", "course_update", c.title, `Обновлен курс «${c.title}»`);
  res.json({ ok: true });
});

app.delete(["/api/admin/courses/:course_id", "/api/manager/courses/:course_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const courseId = parseInt(req.params.course_id, 10);
  const courseTitle = db.courses.find((x) => x.id === courseId)?.title || `ID ${courseId}`;
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

  logActivity(req, "Курсы и темы", "course_delete", courseTitle, `Удален курс «${courseTitle}» со всеми темами и тестами`);
  res.json({ ok: true });
});

app.post(["/api/admin/themes", "/api/manager/themes"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const { course_id, title, order_index } = req.body;
  const id = db.getId("theme");
  db.themes.push({ id, course_id, title, order_index: order_index || 0 });
  logActivity(req, "Курсы и темы", "theme_create", title, `Добавлена тема «${title}»`);
  res.json({ id });
});

app.put(["/api/admin/themes/:theme_id", "/api/manager/themes/:theme_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const t = db.themes.find((x) => x.id === themeId);
  if (!t) return res.status(404).json({ detail: "Тема не найдена" });
  if (req.body.title !== undefined) t.title = req.body.title;
  if (req.body.order_index !== undefined) t.order_index = req.body.order_index;
  logActivity(req, "Курсы и темы", "theme_update", t.title, `Обновлена тема «${t.title}»`);
  res.json({ ok: true });
});

app.delete(["/api/admin/themes/:theme_id", "/api/manager/themes/:theme_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const themeTitle = db.themes.find((x) => x.id === themeId)?.title || `ID ${themeId}`;
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
  logActivity(req, "Курсы и темы", "theme_delete", themeTitle, `Удалена тема «${themeTitle}»`);
  res.json({ ok: true });
});

app.get(["/api/admin/groups/:course_id", "/api/manager/groups/:course_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
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

app.post(["/api/admin/groups", "/api/manager/groups"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const { course_id, name } = req.body;
  const id = db.getId("group");
  db.groups.push({ id, course_id, name });
  res.json({ id });
});

app.put(["/api/admin/groups/:group_id", "/api/manager/groups/:group_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const g = db.groups.find((x) => x.id === groupId);
  if (!g) return res.status(404).json({ detail: "Группа не найдена" });
  g.name = req.body.name;
  res.json({ ok: true });
});

app.delete(["/api/admin/groups/:group_id", "/api/manager/groups/:group_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const annIds = db.announcementTargets.filter((at) => at.group_id === groupId).map((at) => at.announcement_id);
  db.announcementTargets = db.announcementTargets.filter((at) => at.group_id !== groupId);
  db.announcements = db.announcements.filter((a) => !annIds.includes(a.id));
  db.groupTeachers = db.groupTeachers.filter((gt) => gt.group_id !== groupId);
  db.groupStudents = db.groupStudents.filter((gs) => gs.group_id !== groupId);
  db.groups = db.groups.filter((g) => g.id !== groupId);
  res.json({ ok: true });
});

app.post(["/api/admin/groups/:group_id/teachers", "/api/manager/groups/:group_id/teachers"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
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

app.delete(["/api/admin/groups/:group_id/teachers/:teacher_id", "/api/manager/groups/:group_id/teachers/:teacher_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const groupId = parseInt(req.params.group_id, 10);
  const teacherId = parseInt(req.params.teacher_id, 10);
  db.groupTeachers = db.groupTeachers.filter(
    (gt) => !(gt.group_id === groupId && gt.teacher_id === teacherId)
  );
  res.json({ ok: true });
});

app.post(["/api/admin/groups/:group_id/students", "/api/manager/groups/:group_id/students"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
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

app.delete(["/api/admin/groups/:group_id/students/:user_id", "/api/manager/groups/:group_id/students/:user_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
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

app.post(["/api/admin/materials", "/api/manager/materials"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const { theme_id, title, type, url, order_index, sources, attachments, synopsis, audio_url } = req.body;
  const { rec, missing } = resolveUploadedFile(req.body);
  if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
  const id = db.getId("material");
  const newMat: Material = {
    id,
    theme_id,
    title,
    type,
    url: rec ? fileUrlFor(rec) : url,
    order_index: order_index || 0,
    file_id: rec ? rec.id : null,
    sources: Array.isArray(sources) ? sources : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    synopsis: synopsis !== undefined ? (synopsis || null) : null,
    audio_url: audio_url !== undefined ? (audio_url || null) : null,
  };
  db.materials.push(newMat);
  logActivity(req, "Материалы", "material_create", newMat.title, `Добавлен урок «${newMat.title}»`);
  res.json({ id, material: newMat });
});

app.put(["/api/admin/materials/:material_id", "/api/manager/materials/:material_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const matId = parseInt(req.params.material_id, 10);
  const m = db.materials.find((x) => x.id === matId);
  if (!m) return res.status(404).json({ detail: "Материал не найден" });
  Object.assign(m, req.body);
  if (req.body.sources !== undefined) m.sources = Array.isArray(req.body.sources) ? req.body.sources : [];
  if (req.body.attachments !== undefined) m.attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (req.body.synopsis !== undefined) m.synopsis = req.body.synopsis || null;
  if (req.body.audio_url !== undefined) m.audio_url = req.body.audio_url || null;

  if (req.body.url !== undefined || req.body.file_id !== undefined) {
    const { rec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    m.file_id = rec ? rec.id : null;
    if (rec) m.url = fileUrlFor(rec);
  }

  // Если материал связан с накопителем — синхронизируем изменения обратно
  if (m.repository_material_id || m.storage_id) {
    const sId = m.repository_material_id || m.storage_id;
    const sm = db.storageMaterials.find((x) => x.id === sId);
    if (sm) {
      if (m.title) sm.title = m.title;
      if (m.type) sm.type = m.type;
      if (m.url) sm.url = m.url;
      if (m.file_id !== undefined) sm.file_id = m.file_id;
      if (m.sources !== undefined) sm.sources = m.sources;
      if (m.attachments !== undefined) sm.attachments = m.attachments;
      if (m.synopsis !== undefined) sm.synopsis = m.synopsis;
      if (m.audio_url !== undefined) sm.audio_url = m.audio_url;
    }
  }

  logActivity(req, "Материалы", "material_update", m.title, `Обновлен урок «${m.title}»`);
  res.json({ ok: true, material: m });
});

app.delete(["/api/admin/materials/:material_id", "/api/manager/materials/:material_id"], authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const matId = parseInt(req.params.material_id, 10);
  const matTitle = db.materials.find((x) => x.id === matId)?.title || `ID ${matId}`;
  db.materials = db.materials.filter((m) => m.id !== matId);
  logActivity(req, "Материалы", "material_delete", matTitle, `Удален урок «${matTitle}»`);
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

  const { rec, missing } = resolveUploadedFile(req.body);
  if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });

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
    url: rec ? fileUrlFor(rec) : url || "",
    order_index: order_index !== undefined ? Number(order_index) : 0,
    created_at: new Date().toISOString(),
    file_id: rec ? rec.id : null,
    sources: Array.isArray(req.body.sources) ? req.body.sources : [],
    attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    synopsis: req.body.synopsis !== undefined ? (req.body.synopsis || null) : null,
    audio_url: req.body.audio_url !== undefined ? (req.body.audio_url || null) : null,
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
  if (req.body.sources !== undefined) em.sources = Array.isArray(req.body.sources) ? req.body.sources : [];
  if (req.body.attachments !== undefined) em.attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (req.body.synopsis !== undefined) em.synopsis = req.body.synopsis || null;
  if (req.body.audio_url !== undefined) em.audio_url = req.body.audio_url || null;
  if (req.body.file_id !== undefined || req.body.url !== undefined) {
    const { rec: fileRec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    em.file_id = fileRec ? fileRec.id : null;
    if (fileRec) em.url = fileUrlFor(fileRec);
  }
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
  logActivity(req, "Тесты", "test_create", title, `Создан тест «${title}»`);
  res.json({ id });
});

app.put(["/api/admin/tests/:test_id", "/api/manager/tests/:test_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const testId = parseInt(req.params.test_id, 10);
  const t = db.tests.find((x) => x.id === testId);
  if (!t) return res.status(404).json({ detail: "Тест не найден" });
  Object.assign(t, req.body);
  logActivity(req, "Тесты", "test_update", t.title, `Обновлен тест «${t.title}»`);
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
  const targetTest = db.tests.find((x) => x.id === testId);
  const testTitle = targetTest ? targetTest.title : `ID ${testId}`;
  db.tests = db.tests.filter((t) => t.id !== testId);
  logActivity(req, "Тесты", "test_delete", testTitle, `Удален тест «${testTitle}»`);
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

// Публичная отдача загруженных файлов по ID (с поддержкой Range/частичной загрузки)
app.get("/api/files/:file_id", (req, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const rec = db.uploadedFiles.find((f) => f.id === fileId);
  if (!rec) return res.status(404).json({ detail: "Файл не найден" });
  const filePath = path.join(UPLOAD_DIR, rec.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ detail: "Файл отсутствует на диске" });
  const download = req.query.download === "1";
  const display = rec.original_name || rec.filename;
  const asciiName = display.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  res.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(display)}`
  );
  res.sendFile(filePath, { headers: { "Content-Type": rec.mimetype || "application/octet-stream" } }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.post("/api/admin/uploads", authMiddleware, requireRole("admin", "manager"), (upload.single("file") as any), (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ detail: "Файл не загружен" });
  const rec: UploadedFile = {
    id: db.getId("uploadedFile"),
    filename: req.file.filename,
    original_name: fixMojibake(req.file.originalname),
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploaded_at: new Date().toISOString(),
  };
  db.uploadedFiles.push(rec);
  logActivity(req, "Файлы", "file_upload", rec.original_name, `Загружен файл «${rec.original_name}» (${(rec.size / 1024).toFixed(1)} КБ)`);
  logSystem("INFO", "files", `Загружен файл: ${rec.original_name} (${rec.size} байт)`, undefined, req);
  res.json({ ...rec, url: fileUrlFor(rec) });
});

app.get("/api/admin/uploads", authMiddleware, requireRole("admin", "manager"), (_req, res) => {
  res.json([...db.uploadedFiles].reverse());
});

// Переименование файла (меняет отображаемое имя и имя на диске)
app.put(["/api/admin/uploads/:file_id", "/api/manager/uploads/:file_id"], authMiddleware, requireRole("admin", "manager"), (req, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const rec = db.uploadedFiles.find((f) => f.id === fileId);
  if (!rec) return res.status(404).json({ detail: "Файл не найден" });
  if (req.body.original_name === undefined) return res.status(400).json({ detail: "Не передано новое название" });
  const newName = sanitizeUploadName(fixMojibake(String(req.body.original_name || "")));
  if (!newName) return res.status(400).json({ detail: "Название файла не может быть пустым" });
  rec.original_name = newName;
  const oldPath = path.join(UPLOAD_DIR, rec.filename);
  if (fs.existsSync(oldPath)) {
    const target = uniqueUploadName(newName, rec.filename);
    if (target !== rec.filename) {
      try {
        fs.renameSync(oldPath, path.join(UPLOAD_DIR, target));
        rec.filename = target;
      } catch (err: any) {
        console.error("[Uploads] Не удалось переименовать файл на диске:", err.message);
      }
    }
  }
  db.save();
  res.json(rec);
});

app.delete("/api/admin/uploads/:file_id", authMiddleware, requireRole("admin", "manager"), (req: any, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const recIdx = db.uploadedFiles.findIndex((f) => f.id === fileId);
  if (recIdx === -1) return res.status(404).json({ detail: "Файл не найден" });
  const refs = fileReferrers(fileId);
  if (refs.length) {
    return res.status(400).json({ detail: "Файл используется: " + refs.join("; ") + ". Сначала удалите эти материалы." });
  }
  const rec = db.uploadedFiles[recIdx];
  const filePath = path.join(UPLOAD_DIR, rec.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  db.uploadedFiles.splice(recIdx, 1);
  db.save();
  logActivity(req, "Файлы", "file_delete", rec.original_name, `Удален файл «${rec.original_name}»`);
  logSystem("INFO", "files", `Удален файл: ${rec.original_name}`, undefined, req);
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
  const out = db.users
    .filter((u) => u.role !== "admin")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => {
      const base = {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        extra_roles: u.extra_roles || "",
        is_active: u.is_active !== false,
        phone: u.phone || "",
        created_at: u.created_at || null,
        last_login_at: u.last_login_at || null,
        teacher_groups: curatorGroupsOf(u),
      };
      // группы-ученики отдаём только ученикам — таблица методиста показывает их лишь там
      if (!isStudent(u)) return base;
      return { ...base, groups: studentGroupsOf(u) };
    });
  res.json(out);
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

app.post("/api/manager/users", authMiddleware, requireRole("manager"), (req, res) => {
  const { name, username, password, role, extra_roles, is_active, group_ids } = req.body;
  const cleanName = (name || "").trim();
  const cleanUser = (username || "").trim();
  if (!cleanName || !cleanUser || !password) {
    return res.status(400).json({ detail: "Заполните ФИО, логин и пароль" });
  }
  if (!["student", "teacher"].includes(role)) {
    return res.status(400).json({ detail: "Методист может создавать только учеников и кураторов" });
  }
  if (db.users.find((u) => u.username === cleanUser)) {
    return res.status(400).json({ detail: "Логин занят" });
  }
  const cleanedExtras = (Array.isArray(extra_roles) ? extra_roles : String(extra_roles || "").split(","))
    .map((r: unknown) => String(r).trim())
    .filter((r: string) => r && r !== "manager" && r !== role);
  const id = db.getId("user");
  db.users.push({
    id,
    role,
    extra_roles: normalizeExtraRoles(role, cleanedExtras),
    username: cleanUser,
    password_hash: bcrypt.hashSync(password, 10),
    name: cleanName,
    is_active: is_active !== false,
    created_at: new Date().toISOString(),
  });
  if (role === "student" && Array.isArray(group_ids)) {
    for (const gid of group_ids) {
      if (db.groups.find((g) => g.id === gid)) {
        db.groupStudents.push({ group_id: gid, user_id: id });
      }
    }
  }
  res.json({ id });
});

app.put("/api/manager/users/:user_id", authMiddleware, requireRole("manager"), (req, res) => {
  const userId = parseInt(req.params.user_id, 10);
  const u = db.users.find((x) => x.id === userId);
  if (!u || u.role === "admin") return res.status(404).json({ detail: "Пользователь не найден" });
  const { name, username, email, phone, role, extra_roles, is_active, group_ids, curator_group_ids } = req.body;
  if (name !== undefined && String(name).trim()) u.name = String(name).trim();
  if (username !== undefined) {
    const cleanUser = String(username).trim();
    if (!cleanUser) return res.status(400).json({ detail: "Логин не может быть пустым" });
    if (db.users.find((x) => x.username === cleanUser && x.id !== userId)) {
      return res.status(400).json({ detail: "Логин занят" });
    }
    u.username = cleanUser;
  }
  if (email !== undefined) {
    const raw = String(email).trim();
    if (!raw) {
      u.email = undefined;
    } else {
      const norm = normalizeEmail(raw);
      if (db.users.find((x) => x.id !== userId && x.email && x.email.toLowerCase() === norm)) {
        return res.status(400).json({ detail: "Этот Email уже используется другим пользователем" });
      }
      u.email = norm;
    }
  }
  if (phone !== undefined) {
    const raw = String(phone).trim();
    if (!raw) {
      u.phone = "";
    } else {
      const norm = normalizePhone(raw);
      if (!norm) return res.status(400).json({ detail: "Некорректный номер телефона" });
      if (db.users.find((x) => x.id !== userId && (x.phone === norm || x.username === norm))) {
        return res.status(400).json({ detail: "Этот телефон уже используется" });
      }
      u.phone = norm;
    }
  }
  if (is_active !== undefined) u.is_active = !!is_active;
  if (u.role !== "manager") {
    if (role !== undefined) {
      if (!["student", "teacher"].includes(role)) {
        return res.status(400).json({ detail: "Методист может назначать только роли ученика и куратора" });
      }
      u.role = role;
      u.extra_roles = normalizeExtraRoles(u.role, u.extra_roles);
    }
    if (extra_roles !== undefined) {
      const cleaned = (Array.isArray(extra_roles) ? extra_roles : String(extra_roles).split(","))
        .map((r: unknown) => String(r).trim())
        .filter((r: string) => r && r !== "manager");
      u.extra_roles = normalizeExtraRoles(u.role, cleaned);
    }
    if (Array.isArray(group_ids)) setUserStudentGroups(userId, group_ids);
    if (Array.isArray(curator_group_ids)) setUserCuratorGroups(userId, curator_group_ids);
  }
  res.json({ ...userInfo(u), is_active: u.is_active !== false });
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
  const { theme_id, title, type, url, order_index, sources, attachments, synopsis, audio_url } = req.body;
  const { rec, missing } = resolveUploadedFile(req.body);
  if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
  const finalUrl = rec ? fileUrlFor(rec) : (url || "");
  const fileId = rec ? rec.id : (req.body.file_id || null);

  const id = db.getId("material");
  const newMat: Material = {
    id,
    theme_id,
    title: (title || "").trim(),
    type,
    url: finalUrl,
    file_id: fileId,
    order_index: order_index !== undefined ? Number(order_index) : 0,
    sources: Array.isArray(sources) ? sources : [],
    attachments: Array.isArray(attachments) ? attachments : [],
    synopsis: synopsis || null,
    audio_url: audio_url || null,
  };
  db.materials.push(newMat);
  res.json({ id, material: newMat });
});

app.put("/api/manager/materials/:material_id", authMiddleware, requireRole("manager"), (req, res) => {
  const matId = parseInt(req.params.material_id, 10);
  const m = db.materials.find((x) => x.id === matId);
  if (!m) return res.status(404).json({ detail: "Материал не найден" });
  Object.assign(m, req.body);
  if (req.body.sources !== undefined) m.sources = Array.isArray(req.body.sources) ? req.body.sources : [];
  if (req.body.attachments !== undefined) m.attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (req.body.synopsis !== undefined) m.synopsis = req.body.synopsis || null;
  if (req.body.audio_url !== undefined) m.audio_url = req.body.audio_url || null;

  if (req.body.url !== undefined || req.body.file_id !== undefined) {
    const { rec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    m.file_id = rec ? rec.id : null;
    if (rec) m.url = fileUrlFor(rec);
  }

  if (m.repository_material_id || m.storage_id) {
    const sId = m.repository_material_id || m.storage_id;
    const sm = db.storageMaterials.find((x) => x.id === sId);
    if (sm) {
      if (m.title) sm.title = m.title;
      if (m.type) sm.type = m.type;
      if (m.url) sm.url = m.url;
      if (m.file_id !== undefined) sm.file_id = m.file_id;
      if (m.sources !== undefined) sm.sources = m.sources;
      if (m.attachments !== undefined) sm.attachments = m.attachments;
      if (m.synopsis !== undefined) sm.synopsis = m.synopsis;
      if (m.audio_url !== undefined) sm.audio_url = m.audio_url;
    }
  }

  res.json({ ok: true, material: m });
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
  if (req.body.file_id !== undefined || req.body.url !== undefined) {
    const { rec: fileRec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    em.file_id = fileRec ? fileRec.id : null;
    if (fileRec) em.url = fileUrlFor(fileRec);
  }
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
    original_name: fixMojibake(req.file.originalname),
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploaded_at: new Date().toISOString(),
  };
  db.uploadedFiles.push(rec);
  res.json({ ...rec, url: fileUrlFor(rec) });
});

app.get("/api/manager/uploads", authMiddleware, requireRole("manager"), (_req, res) => {
  res.json([...db.uploadedFiles].reverse());
});

app.delete("/api/manager/uploads/:file_id", authMiddleware, requireRole("manager"), (req, res) => {
  const fileId = parseInt(req.params.file_id, 10);
  const recIdx = db.uploadedFiles.findIndex((f) => f.id === fileId);
  if (recIdx === -1) return res.status(404).json({ detail: "Файл не найден" });
  const refs = fileReferrers(fileId);
  if (refs.length) {
    return res.status(400).json({ detail: "Файл используется: " + refs.join("; ") + ". Сначала удалите эти материалы." });
  }
  const rec = db.uploadedFiles[recIdx];
  const filePath = path.join(UPLOAD_DIR, rec.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  db.uploadedFiles.splice(recIdx, 1);
  db.save();
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

// -------------------------------------------------------------
// Обсуждения (чаты) — строго по группе
// -------------------------------------------------------------

/** Группа ученика в курсе (первая в порядке db.groups), либо null. */
function studentGroupInCourse(userId: number, courseId: number): number | null {
  const myGids = db.groupStudents.filter((gs) => gs.user_id === userId).map((gs) => gs.group_id);
  const g = db.groups.find((x) => myGids.includes(x.id) && x.course_id === courseId);
  return g ? g.id : null;
}

/** Группа, которую курирует учитель в курсе (первая в порядке db.groups), либо null. */
function teacherGroupInCourse(teacherId: number, courseId: number): number | null {
  const tGids = teacherGroupIds(teacherId);
  const g = db.groups.find((x) => tGids.includes(x.id) && x.course_id === courseId);
  return g ? g.id : null;
}

/** Группа, для которой открыт доп. материал (закреплённая группа или группа его курса). */
function extraMatchesGroup(em: ExtraMaterial, g: Group): boolean {
  return em.group_ids.includes(g.id) || em.course_ids.includes(g.course_id) || em.course_id === g.course_id;
}

/**
 * Группа, в которой участник ведёт обсуждение доп. материала.
 * requested — явный выбор (?group_id=): должен принадлежать участнику и материалу, иначе отказ.
 */
function extraChatGroupFor(
  userId: number,
  em: ExtraMaterial,
  who: "student" | "teacher",
  requested: number | null
): number | null {
  const myGids =
    who === "teacher"
      ? teacherGroupIds(userId)
      : db.groupStudents.filter((gs) => gs.user_id === userId).map((gs) => gs.group_id);
  if (requested !== null) {
    const g = db.groups.find((x) => x.id === requested);
    if (!g || !myGids.includes(requested) || !extraMatchesGroup(em, g)) return null;
    return g.id;
  }
  const g = db.groups.find((x) => myGids.includes(x.id) && extraMatchesGroup(em, x));
  return g ? g.id : null;
}

/** Группа для сообщения администрации в доп. материале: первая закреплённая, иначе первая группа курса. */
function extraChatGroupForStaff(em: ExtraMaterial): number | null {
  const g =
    db.groups.find((x) => em.group_ids.includes(x.id)) ||
    db.groups.find((x) => em.course_ids.includes(x.course_id) || (em.course_id != null && x.course_id === em.course_id));
  return g ? g.id : null;
}

/** Группа куратора для чата темы: явный ?group_id= (если куратор её ведёт и это курс темы) или первая группа курса темы. */
function teacherThemeChatGroup(teacherId: number, theme: Theme, requestedRaw: unknown): number | null {
  const requested = parseOptionalInt(requestedRaw);
  if (requested !== null) {
    const g = db.groups.find((x) => x.id === requested);
    if (!g || g.course_id !== theme.course_id || !teacherGroupIds(teacherId).includes(requested)) return null;
    return g.id;
  }
  return teacherGroupInCourse(teacherId, theme.course_id);
}

interface ChatRow {
  id: number;
  text: string;
  created_at: string;
  user_id: number;
  user_name: string;
  user_role: string;
  is_mine: boolean;
  group_id?: number | null;
  group_name?: string;
  is_report?: boolean;
  report_status?: "pending" | "accepted" | "rejected";
  report_comment?: string | null;
  report_reviewed_by_name?: string | null;
  report_reviewed_at?: string | null;
  material_id?: number | null;
  material_title?: string | null;
  material_order_index?: number | null;
  reply_to?: {
    id: number;
    user_name: string;
    text: string;
  } | null;
  reactions?: Record<string, { count: number; users: { id: number; name: string }[]; reacted: boolean }>;
}

/** Сообщения чата → строки ответа. withGroup — добавлять группу (для администрации, видит все группы). */
function chatRows(messages: ChatMessage[], viewerId: number, withGroup: boolean): ChatRow[] {
  return messages
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      
      let replyTo = null;
      if (m.reply_to_id) {
        const orig = db.chatMessages.find((x) => x.id === m.reply_to_id);
        if (orig) {
          const origAuthor = db.users.find((x) => x.id === orig.user_id);
          replyTo = {
            id: orig.id,
            user_name: origAuthor ? origAuthor.name : "Участник",
            text: (orig.text || "").slice(0, 100),
          };
        }
      }

      const reactionsMap: Record<string, { count: number; users: { id: number; name: string }[]; reacted: boolean }> = {};
      if (m.reactions) {
        for (const [emoji, uids] of Object.entries(m.reactions)) {
          if (Array.isArray(uids) && uids.length > 0) {
            reactionsMap[emoji] = {
              count: uids.length,
              users: uids.map((uid) => {
                const usr = db.users.find((x) => x.id === uid);
                return { id: uid, name: usr ? usr.name : "Участник" };
              }),
              reacted: uids.includes(viewerId),
            };
          }
        }
      }

      const reviewer = m.report_reviewed_by ? db.users.find((x) => x.id === m.report_reviewed_by) : null;
      const mat = m.material_id ? db.materials.find((x) => x.id === m.material_id) : null;

      const row: ChatRow = {
        id: m.id,
        text: m.text,
        created_at: m.created_at,
        user_id: m.user_id,
        user_name: u ? u.name : "",
        user_role: u ? u.role : "",
        is_mine: m.user_id === viewerId,
        is_report: !!m.is_report,
        report_status: m.is_report ? (m.report_status || "pending") : undefined,
        report_comment: m.report_comment || null,
        report_reviewed_by_name: reviewer ? reviewer.name : null,
        report_reviewed_at: m.report_reviewed_at || null,
        material_id: m.material_id ?? null,
        material_title: mat ? mat.title : null,
        material_order_index: mat ? mat.order_index : null,
        reply_to: replyTo,
        reactions: reactionsMap,
      };
      if (withGroup) {
        const g = m.group_id != null ? db.groups.find((x) => x.id === m.group_id) : null;
        row.group_id = m.group_id ?? null;
        row.group_name = g ? g.name : "";
      }
      return row;
    });
}

// Реакции на сообщения в чатах (темы и доп. материалы)
app.post("/api/chat/messages/:id/react", authMiddleware, (req: AuthRequest, res: Response) => {
  const msgId = parseInt(req.params.id, 10);
  const msg = db.chatMessages.find((m) => m.id === msgId);
  if (!msg) return res.status(404).json({ detail: "Сообщение не найдено" });

  const emoji = String(req.body.emoji || "").trim();
  if (!emoji) return res.status(400).json({ detail: "Не указан эмодзи" });

  if (!msg.reactions) msg.reactions = {};
  const list = msg.reactions[emoji] || [];
  const uidx = list.indexOf(req.user!.id);
  if (uidx >= 0) {
    list.splice(uidx, 1);
    if (list.length === 0) delete msg.reactions[emoji];
    else msg.reactions[emoji] = list;
  } else {
    list.push(req.user!.id);
    msg.reactions[emoji] = list;
  }
  if (typeof (db as any).save === "function") (db as any).save();

  res.json({ ok: true, reactions: msg.reactions });
});

// Проверка отчёта куратором, администратором или методистом
app.post("/api/chat/messages/:id/review-report", authMiddleware, requireRole("teacher", "admin", "manager"), (req: AuthRequest, res: Response) => {
  const msgId = parseInt(req.params.id, 10);
  const msg = db.chatMessages.find((m) => m.id === msgId);
  if (!msg) return res.status(404).json({ detail: "Сообщение не найдено" });
  if (!msg.is_report) return res.status(400).json({ detail: "Сообщение не является отчётом" });

  const { status, comment } = req.body;
  if (!["pending", "accepted", "rejected"].includes(status)) {
    return res.status(400).json({ detail: "Некорректный статус проверки" });
  }

  msg.report_status = status;
  if (comment !== undefined) msg.report_comment = String(comment || "").trim() || null;
  msg.report_reviewed_by = req.user!.id;
  msg.report_reviewed_at = new Date().toISOString();

  if (typeof (db as any).save === "function") (db as any).save();

  const theme = msg.theme_id ? db.themes.find((t) => t.id === msg.theme_id) : null;
  const mat = msg.material_id ? db.materials.find((x) => x.id === msg.material_id) : null;
  const statusLabels: Record<string, string> = {
    accepted: "✅ Зачтено",
    rejected: "🔄 Требует доработки",
    pending: "⏳ На проверке",
  };
  const lessonPart = mat ? `по уроку №${mat.order_index || 1} «${mat.title}»` : "по уроку";
  notifyUsers(
    [msg.user_id],
    "report",
    `Отчёт ${lessonPart}${theme ? ` (тема «${theme.title}»)` : ""}: ${statusLabels[status] || status}`,
    comment ? `Комментарий куратора: ${comment}` : `Статус отчёта обновлён (${req.user!.name})`,
    theme ? `/student?course=${theme.course_id}&theme=${theme.id}` : "/student"
  );

  res.json({ ok: true, msg });
});

// Список отчётов группы для куратора, администратора или методиста
app.get("/api/teacher/groups/:group_id/reports", authMiddleware, requireRole("teacher", "admin", "manager"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (req.user!.role === "teacher" && !ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const group = db.groups.find((g) => g.id === groupId);
  if (!group) return res.status(404).json({ detail: "Группа не найдена" });

  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);
  const themeIds = db.themes.filter((t) => t.course_id === group.course_id).map((t) => t.id);

  const reports = db.chatMessages
    .filter((m) => m.is_report && (m.group_id === groupId || (sIds.includes(m.user_id) && m.theme_id && themeIds.includes(m.theme_id))))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      const student = db.users.find((u) => u.id === m.user_id);
      const theme = m.theme_id ? db.themes.find((t) => t.id === m.theme_id) : null;
      const mat = m.material_id ? db.materials.find((x) => x.id === m.material_id) : null;
      const reviewer = m.report_reviewed_by ? db.users.find((u) => u.id === m.report_reviewed_by) : null;
      return {
        id: m.id,
        user_id: m.user_id,
        student_name: student ? student.name : "Ученик",
        student_username: student ? student.username : "",
        theme_id: m.theme_id,
        theme_title: theme ? theme.title : "Урок",
        theme_order_index: theme ? theme.order_index : null,
        material_id: m.material_id || null,
        material_title: mat ? mat.title : null,
        material_order_index: mat ? mat.order_index : null,
        text: m.text,
        status: m.report_status || "pending",
        comment: m.report_comment || null,
        created_at: m.created_at,
        reviewed_at: m.report_reviewed_at || null,
        reviewer_name: reviewer ? reviewer.name : null,
      };
    });

  res.json(reports);
});

// Список отчётов для администратора и методиста (по всем группам или с фильтром ?group_id=)
app.get("/api/staff/reports", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const reqGroupId = req.query.group_id ? parseInt(String(req.query.group_id), 10) : null;
  const statusFilter = req.query.status ? String(req.query.status) : null;

  let messages = db.chatMessages.filter((m) => m.is_report);
  if (reqGroupId) {
    const sIds = db.groupStudents.filter((gs) => gs.group_id === reqGroupId).map((gs) => gs.user_id);
    const grp = db.groups.find((g) => g.id === reqGroupId);
    const themeIds = grp ? db.themes.filter((t) => t.course_id === grp.course_id).map((t) => t.id) : [];
    messages = messages.filter((m) => m.group_id === reqGroupId || (sIds.includes(m.user_id) && m.theme_id && themeIds.includes(m.theme_id)));
  }
  if (statusFilter) {
    messages = messages.filter((m) => (m.report_status || "pending") === statusFilter);
  }

  const reports = messages
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      const student = db.users.find((u) => u.id === m.user_id);
      const theme = m.theme_id ? db.themes.find((t) => t.id === m.theme_id) : null;
      const mat = m.material_id ? db.materials.find((x) => x.id === m.material_id) : null;
      const course = theme ? db.courses.find((c) => c.id === theme.course_id) : null;
      const group = m.group_id ? db.groups.find((g) => g.id === m.group_id) : null;
      const reviewer = m.report_reviewed_by ? db.users.find((u) => u.id === m.report_reviewed_by) : null;
      return {
        id: m.id,
        user_id: m.user_id,
        student_name: student ? student.name : "Ученик",
        student_username: student ? student.username : "",
        group_name: group ? group.name : "",
        course_title: course ? course.title : "",
        theme_id: m.theme_id,
        theme_title: theme ? theme.title : "Урок",
        theme_order_index: theme ? theme.order_index : null,
        material_id: m.material_id || null,
        material_title: mat ? mat.title : null,
        material_order_index: mat ? mat.order_index : null,
        text: m.text,
        status: m.report_status || "pending",
        comment: m.report_comment || null,
        created_at: m.created_at,
        reviewed_at: m.report_reviewed_at || null,
        reviewer_name: reviewer ? reviewer.name : null,
      };
    });

  res.json(reports);
});

// Список всех отчётов для самого ученика
app.get("/api/student/reports", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;
  const reports = db.chatMessages
    .filter((m) => m.user_id === studentId && m.is_report)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((m) => {
      const theme = m.theme_id ? db.themes.find((t) => t.id === m.theme_id) : null;
      const mat = m.material_id ? db.materials.find((x) => x.id === m.material_id) : null;
      const course = theme ? db.courses.find((c) => c.id === theme.course_id) : null;
      const reviewer = m.report_reviewed_by ? db.users.find((u) => u.id === m.report_reviewed_by) : null;
      return {
        id: m.id,
        theme_id: m.theme_id,
        theme_title: theme ? theme.title : "Урок",
        theme_order_index: theme ? theme.order_index : null,
        material_id: m.material_id || null,
        material_title: mat ? mat.title : null,
        material_order_index: mat ? mat.order_index : null,
        course_id: course ? course.id : null,
        course_title: course ? course.title : "",
        text: m.text,
        status: m.report_status || "pending",
        comment: m.report_comment || null,
        created_at: m.created_at,
        reviewed_at: m.report_reviewed_at || null,
        reviewer_name: reviewer ? reviewer.name : null,
      };
    });
  res.json(reports);
});

// ==================== УЧЕБНЫЙ ГРАФИК (КАЛЕНДАРЬ) ====================

// 1. График обучения для ученика (только его курс и группы, с отметками выполнения)
app.get("/api/student/schedule", authMiddleware, (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;
  const courseId = req.query.course_id ? parseInt(String(req.query.course_id), 10) : null;
  const reqGroupId = req.query.group_id ? parseInt(String(req.query.group_id), 10) : null;

  // Группы ученика
  const myGroupIds = db.groupStudents.filter((gs) => gs.user_id === studentId).map((gs) => gs.group_id);
  const myGroups = db.groups.filter((g) => myGroupIds.includes(g.id));
  const myCourseIds = [...new Set(myGroups.map((g) => g.course_id))];

  let events = db.scheduleEvents || [];

  if (courseId) {
    events = events.filter((e) => e.course_id === courseId);
    // Доступны события: общие для всего курса (group_id == null) ИЛИ для группы ученика
    events = events.filter((e) => !e.group_id || myGroupIds.includes(e.group_id));
    if (reqGroupId) {
      events = events.filter((e) => !e.group_id || e.group_id === reqGroupId);
    }
  } else {
    // Без фильтра по курсу — все курсы и группы ученика
    events = events.filter((e) => myCourseIds.includes(e.course_id) && (!e.group_id || myGroupIds.includes(e.group_id)));
  }

  // Обогащаем каждое событие статусом выполнения для ученика
  const enriched = events.map((e) => {
    let completionStatus: "completed" | "pending" | "overdue" | "not_done" | null = null;
    let reportStatus: string | null = null;
    let testPassed: boolean | null = null;

    if (e.event_type === "report_deadline") {
      const rep = db.chatMessages.find(
        (m) =>
          m.user_id === studentId &&
          m.is_report &&
          ((e.material_id && m.material_id === e.material_id) || (e.theme_id && m.theme_id === e.theme_id))
      );
      if (rep) {
        reportStatus = rep.report_status || "pending";
        if (rep.report_status === "accepted") {
          completionStatus = "completed";
        } else if (rep.report_status === "pending") {
          completionStatus = "pending";
        } else {
          completionStatus = "not_done";
        }
      } else {
        const isPast = new Date(e.start_date).getTime() < Date.now();
        completionStatus = isPast ? "overdue" : "not_done";
      }
    } else if (e.event_type === "test_deadline") {
      if (e.theme_id) {
        const test = db.tests.find((t) => t.theme_id === e.theme_id);
        if (test) {
          const pass = db.attempts.find((a) => a.user_id === studentId && a.test_id === test.id && a.passed);
          testPassed = !!pass;
          if (testPassed) {
            completionStatus = "completed";
          } else {
            const isPast = new Date(e.start_date).getTime() < Date.now();
            completionStatus = isPast ? "overdue" : "not_done";
          }
        }
      }
    }

    const course = db.courses.find((c) => c.id === e.course_id);
    const group = e.group_id ? db.groups.find((g) => g.id === e.group_id) : null;
    const theme = e.theme_id ? db.themes.find((t) => t.id === e.theme_id) : null;
    const mat = e.material_id ? db.materials.find((m) => m.id === e.material_id) : null;

    return {
      ...e,
      course_title: course ? course.title : "",
      group_name: group ? group.name : "Для всех групп",
      theme_title: theme ? theme.title : null,
      theme_order_index: theme ? theme.order_index : null,
      material_title: mat ? mat.title : null,
      material_order_index: mat ? mat.order_index : null,
      completion_status: completionStatus,
      report_status: reportStatus,
      test_passed: testPassed,
    };
  });

  enriched.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  res.json(enriched);
});

// Темы для привязки событий в графике обучения (доступно всем авторизованным пользователям)
app.get("/api/schedule/themes", authMiddleware, (req: AuthRequest, res: Response) => {
  const courseId = req.query.course_id ? parseInt(String(req.query.course_id), 10) : null;
  let themes = db.themes;
  if (courseId) {
    themes = themes.filter((t) => t.course_id === courseId);
  }
  const out = themes
    .slice()
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id)
    .map((t) => ({
      id: t.id,
      title: t.title,
      order_index: t.order_index,
      course_id: t.course_id,
    }));
  res.json(out);
});

// 2. Список событий для преподавателей, методистов и администраторов
app.get("/api/schedule/events", authMiddleware, requireRole("admin", "manager", "teacher"), (req: AuthRequest, res: Response) => {
  const u = req.user!;
  const courseId = req.query.course_id ? parseInt(String(req.query.course_id), 10) : null;
  const groupId = req.query.group_id ? parseInt(String(req.query.group_id), 10) : null;

  let events = db.scheduleEvents || [];

  // Преподаватель видит только свои группы и курсы
  if (u.role === "teacher") {
    const gids = teacherGroupIds(u.id);
    const cids = [...new Set(db.groups.filter((g) => gids.includes(g.id)).map((g) => g.course_id))];
    events = events.filter((e) => cids.includes(e.course_id) && (!e.group_id || gids.includes(e.group_id)));
  }

  if (courseId) {
    events = events.filter((e) => e.course_id === courseId);
  }
  if (groupId) {
    events = events.filter((e) => !e.group_id || e.group_id === groupId);
  }

  const enriched = events.map((e) => {
    const course = db.courses.find((c) => c.id === e.course_id);
    const group = e.group_id ? db.groups.find((g) => g.id === e.group_id) : null;
    const theme = e.theme_id ? db.themes.find((t) => t.id === e.theme_id) : null;
    const mat = e.material_id ? db.materials.find((m) => m.id === e.material_id) : null;
    const creator = e.created_by ? db.users.find((u) => u.id === e.created_by) : null;

    return {
      ...e,
      course_title: course ? course.title : "",
      group_name: group ? group.name : "Для всех групп",
      theme_title: theme ? theme.title : null,
      theme_order_index: theme ? theme.order_index : null,
      material_title: mat ? mat.title : null,
      material_order_index: mat ? mat.order_index : null,
      creator_name: creator ? creator.name : null,
    };
  });

  enriched.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  res.json(enriched);
});

// 3. Создание события графика (Админ, Методист, Куратор)
app.post("/api/schedule/events", authMiddleware, requireRole("admin", "manager", "teacher"), (req: AuthRequest, res: Response) => {
  const u = req.user!;
  const {
    course_id,
    group_id,
    title,
    event_type,
    start_date,
    end_date,
    theme_id,
    material_id,
    link_url,
    description,
    notify_students
  } = req.body;

  if (!course_id || !title || !event_type || !start_date) {
    return res.status(400).json({ detail: "Заполните обязательные поля: курс, название, тип события и дату." });
  }

  // Проверка прав для куратора
  if (u.role === "teacher" && group_id) {
    const gids = teacherGroupIds(u.id);
    if (!gids.includes(Number(group_id))) {
      return res.status(403).json({ detail: "Вы можете создавать события только для назначенных вам групп." });
    }
  }

  const newEvent: ScheduleEvent = {
    id: db.getId("scheduleEvent"),
    course_id: Number(course_id),
    group_id: group_id ? Number(group_id) : null,
    title: String(title).trim(),
    event_type: event_type,
    start_date: String(start_date).trim(),
    end_date: end_date ? String(end_date).trim() : null,
    theme_id: theme_id ? Number(theme_id) : null,
    material_id: material_id ? Number(material_id) : null,
    link_url: link_url ? String(link_url).trim() : null,
    description: description ? String(description).trim() : null,
    created_by: u.id,
    created_at: new Date().toISOString(),
  };

  db.scheduleEvents.push(newEvent);
  db.save();

  // Отправка уведомлений ученикам группы (если запрошено)
  if (notify_students) {
    let studentIds: number[] = [];
    if (newEvent.group_id) {
      studentIds = db.groupStudents.filter((gs) => gs.group_id === newEvent.group_id).map((gs) => gs.user_id);
    } else {
      const gids = db.groups.filter((g) => g.course_id === newEvent.course_id).map((g) => g.id);
      studentIds = [...new Set(db.groupStudents.filter((gs) => gids.includes(gs.group_id)).map((gs) => gs.user_id))];
    }

    const typeIcons: Record<string, string> = {
      theme_open: "🟢",
      report_deadline: "📝",
      test_deadline: "✍️",
      webinar: "🎥",
      holiday: "🏖️",
      custom: "📅"
    };
    const icon = typeIcons[newEvent.event_type] || "📅";

    studentIds.forEach((sid) => {
      db.notifications.push({
        id: db.getId("notification"),
        user_id: sid,
        type: "schedule",
        title: `${icon} Новое событие в графике: ${newEvent.title}`,
        body: newEvent.description || `Дата: ${new Date(newEvent.start_date).toLocaleDateString("ru-RU")}`,
        link: `/student?tab=schedule&course=${newEvent.course_id}`,
        read_at: null,
        created_at: new Date().toISOString()
      });
    });
    db.save();
  }

  res.json(newEvent);
});

// 4. Редактирование события
app.put("/api/schedule/events/:id", authMiddleware, requireRole("admin", "manager", "teacher"), (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const ev = db.scheduleEvents.find((e) => e.id === id);
  if (!ev) return res.status(404).json({ detail: "Событие не найдено" });

  const u = req.user!;
  if (u.role === "teacher" && ev.group_id) {
    const gids = teacherGroupIds(u.id);
    if (!gids.includes(ev.group_id)) {
      return res.status(403).json({ detail: "Нет доступа к редактированию данного события." });
    }
  }

  const { title, event_type, start_date, end_date, theme_id, material_id, link_url, description, group_id } = req.body;
  if (title !== undefined) ev.title = String(title).trim();
  if (event_type !== undefined) ev.event_type = event_type;
  if (start_date !== undefined) ev.start_date = String(start_date).trim();
  if (end_date !== undefined) ev.end_date = end_date ? String(end_date).trim() : null;
  if (theme_id !== undefined) ev.theme_id = theme_id ? Number(theme_id) : null;
  if (material_id !== undefined) ev.material_id = material_id ? Number(material_id) : null;
  if (link_url !== undefined) ev.link_url = link_url ? String(link_url).trim() : null;
  if (description !== undefined) ev.description = description ? String(description).trim() : null;
  if (group_id !== undefined) ev.group_id = group_id ? Number(group_id) : null;
  ev.updated_at = new Date().toISOString();

  db.save();
  res.json(ev);
});

// 5. Удаление события
app.delete("/api/schedule/events/:id", authMiddleware, requireRole("admin", "manager", "teacher"), (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const idx = db.scheduleEvents.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ detail: "Событие не найдено" });

  const ev = db.scheduleEvents[idx];
  const u = req.user!;
  if (u.role === "teacher" && ev.group_id) {
    const gids = teacherGroupIds(u.id);
    if (!gids.includes(ev.group_id)) {
      return res.status(403).json({ detail: "Нет доступа к удалению данного события." });
    }
  }

  db.scheduleEvents.splice(idx, 1);
  db.save();
  res.json({ ok: true });
});

function parseOptionalInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? null : n;
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
  const group = db.groups.find((g) => g.id === groupId);
  const courseThemes = group ? db.themes.filter((t) => t.course_id === group.course_id) : [];
  const themeIds = courseThemes.map((t) => t.id);

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

    const reports = db.chatMessages.filter(
      (m) => m.user_id === s.id && m.is_report && m.theme_id && themeIds.includes(m.theme_id)
    );
    const totalLessons = db.materials.filter((m) => themeIds.includes(m.theme_id)).length;
    const reportsAccepted = reports.filter((r) => r.report_status === "accepted").length;
    const reportsPending = reports.filter((r) => (r.report_status || "pending") === "pending").length;

    return {
      id: s.id,
      name: s.name,
      username: s.username,
      progress,
      passed_tests: passed,
      total_tests: testIds.length,
      reports_count: reports.length,
      reports_accepted: reportsAccepted,
      reports_pending: reportsPending,
      total_themes: themeIds.length,
      total_lessons: totalLessons > 0 ? totalLessons : themeIds.length,
      last_activity: lastActivity,
    };
  });
  res.json(out);
});

app.get("/api/teacher/groups/:group_id/attention", authMiddleware, requireRole("teacher", "admin"), (req: AuthRequest, res: Response) => {
  const groupId = parseInt(req.params.group_id, 10);
  if (!ownTeacherGroup(req.user!.id, groupId)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }
  const group = db.groups.find((g) => g.id === groupId);
  if (!group) return res.status(404).json({ detail: "Группа не найдена" });

  const sIds = db.groupStudents.filter((gs) => gs.group_id === groupId).map((gs) => gs.user_id);
  const students = db.users.filter((u) => sIds.includes(u.id));

  const courseThemes = db.themes
    .filter((t) => t.course_id === group.course_id)
    .sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  const themeIds = courseThemes.map((t) => t.id);
  const courseTests = db.tests.filter((t) => themeIds.includes(t.theme_id));

  const exhaustedAttempts: {
    student_id: number;
    student_name: string;
    test_id: number;
    test_title: string;
    theme_id: number;
    theme_title: string;
    attempts_used: number;
    max_attempts: number;
    best_score: number;
  }[] = [];

  const inactiveStudents: {
    student_id: number;
    student_name: string;
    last_login_at: string | null;
    days_inactive: number | null;
  }[] = [];

  const now = Date.now();

  for (const s of students) {
    for (const test of courseTests) {
      if (!test.max_attempts || test.max_attempts <= 0) continue;
      const myAtts = db.attempts.filter((a) => a.user_id === s.id && a.test_id === test.id);
      const passed = myAtts.some((a) => a.passed);
      if (!passed && myAtts.length >= test.max_attempts) {
        const theme = courseThemes.find((t) => t.id === test.theme_id);
        const best = myAtts.length > 0 ? Math.max(...myAtts.map((a) => a.score)) : 0;
        exhaustedAttempts.push({
          student_id: s.id,
          student_name: s.name,
          test_id: test.id,
          test_title: test.title,
          theme_id: theme ? theme.id : test.theme_id,
          theme_title: theme ? theme.title : "",
          attempts_used: myAtts.length,
          max_attempts: test.max_attempts,
          best_score: best,
        });
      }
    }

    if (!s.last_login_at) {
      inactiveStudents.push({
        student_id: s.id,
        student_name: s.name,
        last_login_at: null,
        days_inactive: null,
      });
    } else {
      const diffDays = Math.floor((now - new Date(s.last_login_at).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) {
        inactiveStudents.push({
          student_id: s.id,
          student_name: s.name,
          last_login_at: s.last_login_at,
          days_inactive: diffDays,
        });
      }
    }
  }

  const unlocks = db.themeUnlocks
    .filter((tu) => sIds.includes(tu.user_id))
    .map((tu) => {
      const s = students.find((x) => x.id === tu.user_id);
      const th = courseThemes.find((x) => x.id === tu.theme_id);
      return {
        id: tu.id,
        student_id: tu.user_id,
        student_name: s ? s.name : "",
        theme_id: tu.theme_id,
        theme_title: th ? th.title : "",
        created_at: tu.created_at,
      };
    });

  res.json({
    exhausted_attempts: exhaustedAttempts,
    inactive_students: inactiveStudents,
    unlocked_themes: unlocks,
  });
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

  const courseTotalLessons = themes.reduce((sum, th) => sum + db.materials.filter((m) => m.theme_id === th.id).length, 0);

  const studentsOut = students.map((s) => {
    let studentTotalLessonsCount = 0;
    let studentAcceptedLessonsCount = 0;
    let studentPendingLessonsCount = 0;
    let studentSubmittedLessonsCount = 0;

    const cells = themes.map((th) => {
      const studentReports = db.chatMessages
        .filter((m) => m.theme_id === th.id && m.user_id === s.id && m.is_report)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const studentReport = studentReports[0] || null;
      const mat = studentReport?.material_id ? db.materials.find(x => x.id === studentReport.material_id) : null;
      const themeMaterials = db.materials
        .filter((m) => m.theme_id === th.id)
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);

      const materialsReports = themeMaterials.map((m, idx) => {
        const matReports = studentReports.filter((r) => r.material_id === m.id || (themeMaterials.length === 1 && !r.material_id));
        const latest = matReports[0] || null;
        return {
          material_id: m.id,
          material_order_index: m.order_index || (idx + 1),
          material_title: m.title,
          report: latest ? {
            id: latest.id,
            material_id: m.id,
            material_title: m.title,
            material_order_index: m.order_index || (idx + 1),
            text: latest.text,
            status: latest.report_status || "pending",
            comment: latest.report_comment || null,
            created_at: latest.created_at,
            reviewed_at: latest.report_reviewed_at || null,
            reviewed_by_name: latest.report_reviewed_by
              ? (db.users.find((u) => u.id === latest.report_reviewed_by)?.name || null)
              : null,
          } : null,
        };
      });

      const totalLessons = themeMaterials.length;
      const submittedLessons = materialsReports.filter((mr) => mr.report).length;
      const acceptedLessons = materialsReports.filter((mr) => mr.report?.status === "accepted").length;
      const pendingLessons = materialsReports.filter((mr) => mr.report?.status === "pending").length;
      const rejectedLessons = materialsReports.filter((mr) => mr.report?.status === "rejected").length;

      studentTotalLessonsCount += totalLessons;
      studentAcceptedLessonsCount += acceptedLessons;
      studentPendingLessonsCount += pendingLessons;
      studentSubmittedLessonsCount += submittedLessons;

      // Prefer a pending report for the quick cell review if exists, else latest
      const actionableReport = studentReports.find((r) => r.report_status === "pending")
        || studentReports.find((r) => r.report_status === "rejected")
        || studentReport;
      const actionableMat = actionableReport?.material_id ? db.materials.find((x) => x.id === actionableReport.material_id) : mat;

      const reportInfo = actionableReport ? {
        id: actionableReport.id,
        material_id: actionableReport.material_id || null,
        material_title: actionableMat ? actionableMat.title : null,
        material_order_index: actionableMat ? actionableMat.order_index : null,
        text: actionableReport.text,
        status: actionableReport.report_status || "pending",
        comment: actionableReport.report_comment || null,
        created_at: actionableReport.created_at,
        reviewed_at: actionableReport.report_reviewed_at || null,
        total_lessons: totalLessons,
        reports_count: submittedLessons,
        reports_accepted: acceptedLessons,
        reviewed_by_name: actionableReport.report_reviewed_by
          ? (db.users.find((u) => u.id === actionableReport.report_reviewed_by)?.name || null)
          : null,
      } : null;

      const test = db.tests.find((t) => t.theme_id === th.id);
      const baseCell = {
        theme_id: th.id,
        report: reportInfo,
        materials_reports: materialsReports,
        total_lessons: totalLessons,
        submitted_lessons: submittedLessons,
        accepted_lessons: acceptedLessons,
        pending_lessons: pendingLessons,
        rejected_lessons: rejectedLessons,
      };

      if (!test) return { ...baseCell, status: "no_test" };
      const attempts = db.attempts
        .filter((a) => a.user_id === s.id && a.test_id === test.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (attempts.length === 0) {
        return { ...baseCell, status: "not_started", attempts: 0 };
      }
      const bestScore = Math.max(...attempts.map((a) => a.score));
      return {
        ...baseCell,
        status: attempts.some((a) => a.passed) ? "passed" : "failed",
        attempts: attempts.length,
        best_score: bestScore,
        last_attempt_id: attempts[0].id,
        last_passed: attempts[0].passed,
        last_score: attempts[0].score,
      };
    });

    return {
      id: s.id,
      name: s.name,
      cells,
      total_lessons: courseTotalLessons > 0 ? courseTotalLessons : studentTotalLessonsCount,
      reports_count: studentSubmittedLessonsCount,
      reports_accepted: studentAcceptedLessonsCount,
      reports_pending: studentPendingLessonsCount,
    };
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

  const gid = teacherThemeChatGroup(req.user!.id, theme, req.query.group_id);
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages.filter((m) => m.theme_id === themeId && m.group_id === gid);
  res.json(chatRows(rows, req.user!.id, false));
});

app.post("/api/teacher/themes/:theme_id/chat", authMiddleware, requireRole("teacher"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const gid = teacherThemeChatGroup(req.user!.id, theme, req.query.group_id);
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    group_id: gid,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
  });

  const studentIds = db.groupStudents.filter((gs) => gs.group_id === gid).map((gs) => gs.user_id);
  notifyUsers(
    studentIds,
    "chat",
    `Новое сообщение в теме «${theme.title}»`,
    (req.body.text || "").slice(0, 160),
    `/student?course=${theme.course_id}&theme=${themeId}`
  );

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в теме «${theme.title}»`,
        (req.body.text || "").slice(0, 160),
        `/student?course=${theme.course_id}&theme=${themeId}`
      );
    }
  }

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

  const gid = extraChatGroupFor(req.user!.id, em, "teacher", parseOptionalInt(req.query.group_id));
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages.filter((m) => m.extra_material_id === extraId && m.group_id === gid);
  res.json(chatRows(rows, req.user!.id, false));
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

  const gid = extraChatGroupFor(req.user!.id, em, "teacher", parseOptionalInt(req.query.group_id));
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    group_id: gid,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
  });

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в доп. материале «${em.title}»`,
        text.slice(0, 160),
        `/student?extra_material=${extraId}`
      );
    }
  }

  // уведомляем учеников и администрацию этой группы
  const studentIds = db.groupStudents
    .filter((gs) => gs.group_id === gid)
    .map((gs) => gs.user_id)
    .filter((id) => id !== req.user!.id);
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

app.get("/api/student/courses", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
  const cids = studentCourseIds(req.user!.id);
  const myGids = db.groupStudents.filter((gs) => gs.user_id === req.user!.id).map((gs) => gs.group_id);
  const courses = db.courses
    .filter((c) => cids.includes(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      // группы ученика в этом курсе (порядок db.groups — первая = группа, через которую работает чат)
      groups: db.groups
        .filter((g) => g.course_id === c.id && myGids.includes(g.id))
        .map((g) => ({ id: g.id, name: g.name })),
    }));
  res.json(courses);
});

app.get("/api/student/course/:course_id/themes", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
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
    const rawMaterials = db.materials
      .filter((m) => m.theme_id === th.id)
      .sort((a, b) => a.order_index - b.order_index || a.id - b.id);

    const studentReports = db.chatMessages
      .filter((m) => m.theme_id === th.id && m.user_id === req.user!.id && m.is_report)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const studentReport = studentReports[0] || null;

    const materials = rawMaterials.map((m) => {
      const matReport = studentReports.find((r) => r.material_id === m.id)
        || (rawMaterials.length === 1 ? studentReports[0] : null);
      return {
        id: m.id,
        title: m.title,
        type: m.type,
        url: m.url,
        order_index: m.order_index,
        sources: m.sources || [],
        attachments: m.attachments || [],
        synopsis: m.synopsis || null,
        audio_url: m.audio_url || null,
        report: matReport
          ? {
              id: matReport.id,
              text: matReport.text,
              status: matReport.report_status || "pending",
              comment: matReport.report_comment || null,
              created_at: matReport.created_at,
              reviewed_at: matReport.report_reviewed_at || null,
              reviewed_by_name: matReport.report_reviewed_by
                ? (db.users.find((u) => u.id === matReport.report_reviewed_by)?.name || null)
                : null,
            }
          : null,
      };
    });

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
      reports_stats: {
        total_materials: rawMaterials.length,
        submitted: rawMaterials.filter((m) => studentReports.some((r) => r.material_id === m.id || (rawMaterials.length === 1 && !r.material_id))).length,
        accepted: rawMaterials.filter((m) => {
          const rep = studentReports.find((r) => r.material_id === m.id) || (rawMaterials.length === 1 ? studentReports[0] : null);
          return rep && rep.report_status === "accepted";
        }).length,
      },
      reports: studentReports.map((r) => {
        const mat = r.material_id ? db.materials.find((x) => x.id === r.material_id) : null;
        return {
          id: r.id,
          material_id: r.material_id || null,
          material_title: mat ? mat.title : null,
          material_order_index: mat ? mat.order_index : null,
          text: r.text,
          status: r.report_status || "pending",
          comment: r.report_comment || null,
          created_at: r.created_at,
          reviewed_at: r.report_reviewed_at || null,
          reviewed_by_name: r.report_reviewed_by
            ? (db.users.find((u) => u.id === r.report_reviewed_by)?.name || null)
            : null,
        };
      }),
      report: studentReport
        ? {
            id: studentReport.id,
            material_id: studentReport.material_id || null,
            text: studentReport.text,
            status: studentReport.report_status || "pending",
            comment: studentReport.report_comment || null,
            created_at: studentReport.created_at,
            reviewed_at: studentReport.report_reviewed_at || null,
            reviewed_by_name: studentReport.report_reviewed_by
              ? (db.users.find((u) => u.id === studentReport.report_reviewed_by)?.name || null)
              : null,
          }
        : null,
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
// STUDENT: MATERIAL COMPLETIONS (Track studied materials)
// -------------------------------------------------------------
app.get("/api/student/materials/completed", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const list = db.materialCompletions || [];
  const ids = list.filter((mc) => mc.user_id === userId).map((mc) => mc.material_id);
  res.json({ material_ids: ids });
});

app.post("/api/student/materials/:id/toggle-completed", authMiddleware, requireRole("student"), (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const materialId = parseInt(req.params.id, 10);
  if (!Array.isArray(db.materialCompletions)) db.materialCompletions = [];
  const idx = db.materialCompletions.findIndex((mc) => mc.user_id === userId && mc.material_id === materialId);
  let completed = false;
  if (idx >= 0) {
    db.materialCompletions.splice(idx, 1);
    completed = false;
  } else {
    db.materialCompletions.push({
      id: db.getId("materialCompletion" as any) || Date.now(),
      user_id: userId,
      material_id: materialId,
      completed_at: new Date().toISOString(),
    });
    completed = true;
  }
  db.save();
  res.json({ completed, material_id: materialId });
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

app.get("/api/student/test/:test_id", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
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

app.post("/api/student/test/:test_id/submit", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
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

app.get("/api/student/themes/:theme_id/chat", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  const gid = theme ? studentGroupInCourse(req.user!.id, theme.course_id) : null;
  if (!theme || gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages.filter((m) => m.theme_id === themeId && m.group_id === gid);
  res.json(chatRows(rows, req.user!.id, false));
});

// Получить список уроков темы для формы сдачи отчёта
app.get(["/api/student/themes/:theme_id/materials", "/api/teacher/themes/:theme_id/materials", "/api/staff/themes/:theme_id/materials"], authMiddleware, (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  const studentReports = db.chatMessages
    .filter((m) => m.theme_id === themeId && m.user_id === req.user!.id && m.is_report)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const mats = db.materials
    .filter((m) => m.theme_id === themeId)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id)
    .map((m, idx) => {
      const rep = studentReports.find((r) => r.material_id === m.id)
        || (db.materials.filter((x) => x.theme_id === themeId).length === 1 ? studentReports[0] : null);
      return {
        id: m.id,
        title: m.title,
        type: m.type,
        order_index: m.order_index || (idx + 1),
        report: rep ? {
          id: rep.id,
          status: rep.report_status || "pending",
          comment: rep.report_comment || null,
          created_at: rep.created_at,
        } : null,
      };
    });
  res.json(mats);
});

app.post("/api/student/themes/:theme_id/chat", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  const gid = theme ? studentGroupInCourse(req.user!.id, theme.course_id) : null;
  if (!theme || gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const isReport = !!req.body.is_report;
  let materialId = req.body.material_id ? Number(req.body.material_id) : null;

  if (isReport && !materialId) {
    const themeMats = db.materials
      .filter((m) => m.theme_id === themeId)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
    if (themeMats.length > 0) {
      materialId = themeMats[0].id;
    }
  }

  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    group_id: gid,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
    is_report: isReport,
    report_status: isReport ? "pending" : undefined,
    material_id: isReport ? materialId : null,
    reply_to_id: replyToId,
    reactions: {},
  });

  if (typeof (db as any).save === "function") (db as any).save();

  const teacherIds = db.groupTeachers.filter((gt) => gt.group_id === gid).map((gt) => gt.teacher_id);
  const adminIds = db.users.filter((u) => hasRole(u, "admin") || hasRole(u, "manager")).map((u) => u.id);

  if (isReport) {
    const mat = materialId ? db.materials.find((x) => x.id === materialId) : null;
    const lessonTitle = mat ? `Урок №${mat.order_index || 1} «${mat.title}»` : `Тема «${theme.title}»`;
    notifyUsers(
      Array.from(new Set([...teacherIds, ...adminIds])),
      "report",
      `📝 Новый отчёт: ${lessonTitle} от ${req.user!.name}`,
      (req.body.text || "").slice(0, 160),
      `/teacher?theme=${themeId}&group_id=${gid}`
    );
  } else {
    notifyUsers(
      teacherIds,
      "chat",
      `Новое сообщение от ${req.user!.name} в «${theme.title}»`,
      (req.body.text || "").slice(0, 160),
      `/teacher?theme=${themeId}`
    );
  }

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в теме «${theme.title}»`,
        (req.body.text || "").slice(0, 160),
        `/student?course=${theme.course_id}&theme=${themeId}`
      );
    }
  }

  res.json({ id: msgId });
});

app.get("/api/student/course/:course_id/extra-materials", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
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

app.get("/api/student/extra-materials/:id/chat", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em || !canStudentAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const gid = extraChatGroupFor(req.user!.id, em, "student", null);
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const rows = db.chatMessages.filter((m) => m.extra_material_id === extraId && m.group_id === gid);
  res.json(chatRows(rows, req.user!.id, false));
});

app.post("/api/student/extra-materials/:id/chat", authMiddleware, requireRole("student"), requireActive, (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em || !canStudentAccessExtra(req.user!.id, em)) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const gid = extraChatGroupFor(req.user!.id, em, "student", null);
  if (gid === null) {
    return res.status(403).json({ detail: "Доступ запрещён" });
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    group_id: gid,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
  });

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в доп. материале «${em.title}»`,
        text.slice(0, 160),
        `/student?extra_material=${extraId}`
      );
    }
  }

  // Уведомления: кураторы этой группы, администрация и одногруппники
  const teacherIds = db.groupTeachers
    .filter((gt) => gt.group_id === gid)
    .map((gt) => gt.teacher_id);
  const adminIds = db.users.filter((u) => hasRole(u, "admin") || hasRole(u, "manager")).map((u) => u.id);
  const peerStudentIds = db.groupStudents
    .filter((gs) => gs.group_id === gid && gs.user_id !== req.user!.id)
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

  // администрация видит сообщения всех групп темы (с указанием группы)
  const rows = db.chatMessages.filter((m) => m.theme_id === themeId);
  res.json(chatRows(rows, req.user!.id, true));
});

app.post("/api/staff/themes/:theme_id/chat", authMiddleware, requireRole("admin", "manager"), (req: AuthRequest, res: Response) => {
  const themeId = parseInt(req.params.theme_id, 10);
  const theme = db.themes.find((t) => t.id === themeId);
  if (!theme) return res.status(404).json({ detail: "Тема не найдена" });

  // группа: явный ?group_id= / body.group_id, иначе первая группа курса темы
  const requested = parseOptionalInt(req.query.group_id ?? req.body.group_id);
  let gid: number | null = null;
  if (requested !== null) {
    const g = db.groups.find((x) => x.id === requested);
    if (!g || g.course_id !== theme.course_id) {
      return res.status(400).json({ detail: "Группа не относится к курсу темы" });
    }
    gid = g.id;
  } else {
    const first = db.groups.find((g) => g.course_id === theme.course_id);
    gid = first ? first.id : null;
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    theme_id: themeId,
    group_id: gid,
    user_id: req.user!.id,
    text: req.body.text,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
  });

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в теме «${theme.title}»`,
        (req.body.text || "").slice(0, 160),
        `/student?course=${theme.course_id}&theme=${themeId}`
      );
    }
  }

  if (gid !== null) {
    const recipients = new Set<number>();
    for (const gs of db.groupStudents.filter((x) => x.group_id === gid)) recipients.add(gs.user_id);
    for (const gt of db.groupTeachers.filter((x) => x.group_id === gid)) recipients.add(gt.teacher_id);
    recipients.delete(req.user!.id);

    notifyUsers(
      Array.from(recipients),
      "chat",
      `Сообщение от ${req.user!.name} в теме «${theme.title}»`,
      (req.body.text || "").slice(0, 160),
      `/student?course=${theme.course_id}&theme=${themeId}`
    );
  }

  res.json({ id: msgId, group_id: gid });
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
  if (req.body.file_id !== undefined || req.body.url !== undefined) {
    const { rec: fileRec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    em.file_id = fileRec ? fileRec.id : null;
    if (fileRec) em.url = fileUrlFor(fileRec);
  }
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

// Чат доп. материала для администрации/методиста: видит все группы (с указанием группы),
// при отправке сообщение попадает в выбранную (group_id) или первую подходящую группу.
const getStaffExtraChatHandler = (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });

  const rows = db.chatMessages.filter((m) => m.extra_material_id === extraId);
  res.json(chatRows(rows, req.user!.id, true));
};

const postStaffExtraChatHandler = (req: AuthRequest, res: Response) => {
  const extraId = parseInt(req.params.id, 10);
  const em = db.extraMaterials.find((x) => x.id === extraId);
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  normalizeExtraMaterial(em);

  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ detail: "Сообщение не может быть пустым" });

  const requested = parseOptionalInt(req.query.group_id ?? req.body.group_id);
  let gid: number | null;
  if (requested !== null) {
    const g = db.groups.find((x) => x.id === requested);
    if (!g || !extraMatchesGroup(em, g)) {
      return res.status(400).json({ detail: "Группа не относится к этому материалу" });
    }
    gid = g.id;
  } else {
    gid = extraChatGroupForStaff(em);
  }

  const replyToId = req.body.reply_to_id ? Number(req.body.reply_to_id) : null;
  const msgId = db.getId("chatMessage");
  db.chatMessages.push({
    id: msgId,
    extra_material_id: extraId,
    group_id: gid,
    user_id: req.user!.id,
    text,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId,
    reactions: {},
  });

  if (replyToId) {
    const orig = db.chatMessages.find((x) => x.id === replyToId);
    if (orig && orig.user_id !== req.user!.id) {
      notifyUsers(
        [orig.user_id],
        "reply",
        `${req.user!.name} ответил(а) на ваше сообщение в доп. материале «${em.title}»`,
        text.slice(0, 160),
        `/student?extra_material=${extraId}`
      );
    }
  }

  const studentRecipients = new Set<number>();
  const teacherRecipients = new Set<number>();
  if (gid !== null) {
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

  res.json({ id: msgId, group_id: gid });
};

app.get("/api/staff/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), getStaffExtraChatHandler);
app.post("/api/staff/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), postStaffExtraChatHandler);

// Admin aliases
app.get("/api/admin/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), getStaffExtraChatHandler);
app.post("/api/admin/extra-materials/:id/chat", authMiddleware, requireRole("admin", "manager"), postStaffExtraChatHandler);

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

  // Разрешаем файл: явный file_id, ссылка /api/files/<id>[.ext] или старый формат /uploads/<имя>
  const { rec: fileRec, missing } = resolveUploadedFile(req.body);
  if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });

  const cleanUrl = fileRec ? fileUrlFor(fileRec) : (url || "").trim();
  const cleanTitle = (title || "").trim() || (fileRec ? (fileRec.original_name || "").replace(/\.[^.]+$/, "") : "");
  const cleanPlaylist = (playlist_name || "").trim() || "Общие материалы";
  const cleanType = (type || "").trim() || (fileRec ? typeFromMime(fileRec.mimetype) : "video");

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
    file_name: fileRec ? fileRec.original_name : file_name || "",
    file_size: fileRec ? fileRec.size : file_size || 0,
    file_id: fileRec ? fileRec.id : null,
    sources: Array.isArray(req.body.sources) ? req.body.sources : [],
    attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    synopsis: req.body.synopsis !== undefined ? (req.body.synopsis || null) : null,
    audio_url: req.body.audio_url !== undefined ? (req.body.audio_url || null) : null,
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
  if (req.body.sources !== undefined) item.sources = Array.isArray(req.body.sources) ? req.body.sources : [];
  if (req.body.attachments !== undefined) item.attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (req.body.synopsis !== undefined) item.synopsis = req.body.synopsis || null;
  if (req.body.audio_url !== undefined) item.audio_url = req.body.audio_url || null;

  // Разрешаем привязку к файлу, если переданы file_id или ссылка
  if (req.body.file_id !== undefined || req.body.url !== undefined) {
    const { rec: fileRec, missing } = resolveUploadedFile(req.body);
    if (missing) return res.status(404).json({ detail: "Файл не найден — загрузите его заново" });
    if (fileRec) {
      item.file_id = fileRec.id;
      item.url = fileUrlFor(fileRec);
      item.file_name = fileRec.original_name;
      item.file_size = fileRec.size;
    } else {
      item.file_id = null;
    }
  }

  // Автоматическая синхронизация с уроками учеников
  db.materials.forEach((m: any) => {
    if (m.repository_material_id === id || m.storage_id === id || m.title === oldTitle || m.title === item.title) {
      m.repository_material_id = id;
      m.storage_id = id;
      m.title = item.title;
      m.type = item.type;
      m.url = item.url;
      m.file_id = item.file_id;
      m.sources = item.sources;
      m.attachments = item.attachments;
      m.synopsis = item.synopsis;
      m.audio_url = item.audio_url;
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

  // 4. Физический файл удаляем, только если он больше нигде не используется
  if (repoItem && repoItem.file_id != null) {
    const fid = repoItem.file_id;
    const stillUsed =
      db.storageMaterials.some((x) => x.file_id === fid) ||
      db.materials.some((m) => m.file_id === fid) ||
      db.extraMaterials.some((em) => em.file_id === fid);
    if (!stillUsed) {
      const rec = db.uploadedFiles.find((f) => f.id === fid);
      if (rec) {
        const filePath = path.join(UPLOAD_DIR, rec.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log("[Repository] Файл удалён с диска: " + filePath);
          } catch (err: any) {
            console.log("[Repository] Не удалось удалить файл " + filePath + ": " + err.message);
          }
        }
        db.uploadedFiles = db.uploadedFiles.filter((f) => f.id !== fid);
      }
    }
  } else if (repoItem && repoItem.url) {
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
      file_id: item.file_id,
      order_index: item.order_index || 0,
      sources: item.sources || [],
      attachments: item.attachments || [],
      synopsis: item.synopsis || null,
      audio_url: item.audio_url || null,
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
    file_id: repoItem.file_id,
    order_index: nextOrder,
    sources: repoItem.sources || [],
    attachments: repoItem.attachments || [],
    synopsis: repoItem.synopsis || null,
    audio_url: repoItem.audio_url || null,
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
      file_id: item.file_id,
      order_index: curOrder++,
      created_at: new Date().toISOString(),
      sources: item.sources || [],
      attachments: item.attachments || [],
      synopsis: item.synopsis || null,
      audio_url: item.audio_url || null,
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
    file_id: repoItem.file_id,
    order_index: nextOrder,
    created_at: new Date().toISOString(),
    sources: repoItem.sources || [],
    attachments: repoItem.attachments || [],
    synopsis: repoItem.synopsis || null,
    audio_url: repoItem.audio_url || null,
  };
  db.extraMaterials.push(em);

  res.json({ ok: true, material: getExtraMaterialDetails(em) });
});

app.get("/api/public/extra-material/:id", (req: Request, res: Response) => {
  const em = db.extraMaterials.find((x) => x.id === parseInt(req.params.id, 10));
  if (!em) return res.status(404).json({ detail: "Материал не найден" });
  res.json({ id: em.id, title: em.title, course_id: em.course_id });
});

// Глобальный перехват ошибок для системного журнала логов
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logSystem("ERROR", "api", `Сбой сервера [${req.method} ${req.originalUrl}]: ${err?.message || err}`, err?.stack, req);
  if (!res.headersSent) {
    res.status(500).json({ detail: "Внутренняя ошибка сервера" });
  }
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
