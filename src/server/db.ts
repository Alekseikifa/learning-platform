import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

export interface User {
  id: number;
  role: string;
  extra_roles: string;
  username: string;
  password_hash: string;
  name: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  order_index?: number;
}

export interface Group {
  id: number;
  course_id: number;
  name: string;
}

export interface GroupTeacher {
  group_id: number;
  teacher_id: number;
}

export interface GroupStudent {
  group_id: number;
  user_id: number;
}

export interface Theme {
  id: number;
  course_id: number;
  title: string;
  order_index: number;
}

export interface Material {
  id: number;
  theme_id: number;
  title: string;
  type: string;
  url: string;
  order_index: number;
  repository_material_id?: number | null;
  storage_id?: number | null;
}

export interface Test {
  id: number;
  theme_id: number;
  title: string;
  passing_score: number;
  max_attempts: number;
}

export interface Question {
  id: number;
  test_id: number;
  text: string;
}

export interface Answer {
  id: number;
  question_id: number;
  text: string;
  is_correct: boolean;
}

export interface Attempt {
  id: number;
  user_id: number;
  test_id: number;
  score: number;
  passed: boolean;
  created_at: string;
}

export interface AttemptAnswer {
  id: number;
  attempt_id: number;
  question_id: number;
  answer_id: number | null;
  is_correct: boolean;
}

export interface Announcement {
  id: number;
  author_id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementTarget {
  announcement_id: number;
  group_id: number;
}

export interface ExtraMaterial {
  id: number;
  course_id?: number;
  course_ids: number[];
  group_ids: number[];
  title: string;
  description?: string;
  type: string; // "video" | "audio" | "image" | "document" | "note" | "link"
  url: string;
  order_index: number;
  created_at: string;
}

export interface StorageMaterial {
  id: number;
  title: string;
  theme_name: string; // Тема / раздел, объединяющий материалы (уроки)
  type: string;       // "video" | "audio" | "image" | "document" | "note" | "link"
  url: string;        // Ссылка, путь /uploads/... или текст заметки
  description?: string;
  order_index: number;
  file_name?: string;
  file_size?: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  theme_id?: number | null;
  extra_material_id?: number | null;
  user_id: number;
  text: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface UploadedFile {
  id: number;
  filename: string;
  original_name: string;
  mimetype: string;
  size: number;
  uploaded_at: string;
}

export interface PhoneInvite {
  id: number;
  phone: string;
  role: string;
  note: string;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  text: string;
  read_at: string | null;
  created_at: string;
}

// In-Memory Database Store
class DatabaseStore {
  users: User[] = [];
  courses: Course[] = [];
  groups: Group[] = [];
  groupTeachers: GroupTeacher[] = [];
  groupStudents: GroupStudent[] = [];
  themes: Theme[] = [];
  materials: Material[] = [];
  extraMaterials: ExtraMaterial[] = [];
  storageMaterials: StorageMaterial[] = [];
  tests: Test[] = [];
  questions: Question[] = [];
  answers: Answer[] = [];
  attempts: Attempt[] = [];
  attemptAnswers: AttemptAnswer[] = [];
  announcements: Announcement[] = [];
  announcementTargets: AnnouncementTarget[] = [];
  chatMessages: ChatMessage[] = [];
  settings: Record<string, string> = {};
  uploadedFiles: UploadedFile[] = [];
  phoneInvites: PhoneInvite[] = [];
  notifications: Notification[] = [];
  directMessages: DirectMessage[] = [];

  private nextId = {
    user: 1,
    course: 1,
    group: 1,
    theme: 1,
    material: 1,
    extraMaterial: 1,
    storageMaterial: 1,
    test: 1,
    question: 1,
    answer: 1,
    attempt: 1,
    attemptAnswer: 1,
    announcement: 1,
    chatMessage: 1,
    uploadedFile: 1,
    phoneInvite: 1,
    notification: 1,
    directMessage: 1,
  };

  getId(table: keyof typeof this.nextId): number {
    return this.nextId[table]++;
  }

  
  save() {
    try {
      const dataDir = "/var/www/learning-platform/data";
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, "database.json");
      const tempPath = path.join(dataDir, "database.json.tmp");
      const payload = {
        users: this.users,
        courses: this.courses,
        groups: this.groups,
        groupTeachers: this.groupTeachers,
        groupStudents: this.groupStudents,
        themes: this.themes,
        materials: this.materials,
        extraMaterials: this.extraMaterials,
        storageMaterials: this.storageMaterials,
        tests: this.tests,
        questions: this.questions,
        answers: this.answers,
        attempts: this.attempts,
        attemptAnswers: this.attemptAnswers,
        announcements: this.announcements,
        announcementTargets: this.announcementTargets,
        chatMessages: this.chatMessages,
        settings: this.settings,
        uploadedFiles: this.uploadedFiles,
        phoneInvites: this.phoneInvites,
        notifications: this.notifications,
        directMessages: this.directMessages,
        nextId: this.nextId,
      };
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error("[DatabaseStore] Ошибка сохранения базы:", err);
    }
  }

  load() {
    try {
      const filePath = "/var/www/learning-platform/data/database.json";
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        Object.assign(this, data);
        console.log("[DatabaseStore] База данных успешно загружена из файла database.json");
        return;
      }
    } catch (err) {
      console.error("[DatabaseStore] Ошибка загрузки database.json, откат к начальным данным:", err);
    }
    this.seed();
    this.save();
    console.log("[DatabaseStore] Создан начальный файл database.json");
  }

  constructor() {
    this.load();
    const interval = setInterval(() => {
      this.save();
    }, 3000);
    if (interval && interval.unref) {
      interval.unref();
    }
    process.on("SIGINT", () => { this.save(); process.exit(0); });
    process.on("SIGTERM", () => { this.save(); process.exit(0); });
    process.on("beforeExit", () => { this.save(); });
  }


  seed() {
    // Default Settings
    this.settings = {
      role_admin_name: "Администратор",
      role_teacher_name: "Куратор",
      role_student_name: "Ученик",
      role_manager_name: "Методист",
      school_name: "МКУ — Международные Курсы Ученичества",
    };

    // Seed Users
    const salt = bcrypt.genSaltSync(10);
    const adminUser: User = {
      id: this.getId("user"),
      role: "admin",
      extra_roles: "manager,teacher,student",
      username: "admin",
      password_hash: bcrypt.hashSync("admin", salt),
      name: "Администратор",
    };
    const teacherUser: User = {
      id: this.getId("user"),
      role: "teacher",
      extra_roles: "",
      username: "teacher",
      password_hash: bcrypt.hashSync("teacher123", salt),
      name: "Александр Иванов (Куратор)",
    };
    const managerUser: User = {
      id: this.getId("user"),
      role: "manager",
      extra_roles: "",
      username: "manager",
      password_hash: bcrypt.hashSync("manager123", salt),
      name: "Мария Смирнова (Методист)",
    };
    const studentUser: User = {
      id: this.getId("user"),
      role: "student",
      extra_roles: "",
      username: "student",
      password_hash: bcrypt.hashSync("student123", salt),
      name: "Даниил Петров (Ученик)",
    };
    this.users.push(adminUser, teacherUser, managerUser, studentUser);

    // Seed Phone Invites
    this.phoneInvites.push({
      id: this.getId("phoneInvite"),
      phone: "+79991234567",
      role: "student",
      note: "Приглашение для нового ученика",
      created_at: new Date().toISOString(),
    });
    this.phoneInvites.push({
      id: this.getId("phoneInvite"),
      phone: "+79997654321",
      role: "teacher",
      note: "Приглашение для куратора группы",
      created_at: new Date().toISOString(),
    });

    // Seed Course
    const courseId = this.getId("course");
    this.courses.push({
      id: courseId,
      title: "Основы христианского ученичества",
      description: "Базовый практический курс по основам духовного роста, молитвенной жизни и служения.",
    });

    // Seed Themes
    const theme1Id = this.getId("theme");
    const theme2Id = this.getId("theme");
    this.themes.push(
      { id: theme1Id, course_id: courseId, title: "Тема 1. Призвание и следование за Христом", order_index: 0 },
      { id: theme2Id, course_id: courseId, title: "Тема 2. Молитва и изучение Слова Божьего", order_index: 1 }
    );

    // Seed Materials
    this.materials.push(
      {
        id: this.getId("material"),
        theme_id: theme1Id,
        title: "Конспект лекции: Призвание ученика",
        type: "link",
        url: "https://example.com/materials/theme-1-notes",
        order_index: 0,
      },
      {
        id: this.getId("material"),
        theme_id: theme1Id,
        title: "Практическое задание и разбор мест Писания",
        type: "link",
        url: "https://example.com/materials/practical-guide",
        order_index: 1,
      },
      {
        id: this.getId("material"),
        theme_id: theme2Id,
        title: "План ежедневного чтения Библии",
        type: "link",
        url: "https://example.com/materials/bible-plan",
        order_index: 0,
      }
    );

    // Seed Test for Theme 1
    const test1Id = this.getId("test");
    this.tests.push({
      id: test1Id,
      theme_id: theme1Id,
      title: "Тест по Теме 1",
      passing_score: 70,
      max_attempts: 3,
    });

    // Questions & Answers for Test 1
    const q1Id = this.getId("question");
    this.questions.push({
      id: q1Id,
      test_id: test1Id,
      text: "Что является краеугольным камнем христианского ученичества?",
    });
    this.answers.push(
      { id: this.getId("answer"), question_id: q1Id, text: "Следование за Христом и уподобление Ему", is_correct: true },
      { id: this.getId("answer"), question_id: q1Id, text: "Соблюдение формальных ритуалов", is_correct: false },
      { id: this.getId("answer"), question_id: q1Id, text: "Изоляция от общества", is_correct: false },
      { id: this.getId("answer"), question_id: q1Id, text: "Только накопление теоретических знаний", is_correct: false }
    );

    const q2Id = this.getId("question");
    this.questions.push({
      id: q2Id,
      test_id: test1Id,
      text: "Какова ключевая цель духовного наставничества?",
    });
    this.answers.push(
      { id: this.getId("answer"), question_id: q2Id, text: "Возрастание в вере и подготовка к самостоятельному служению", is_correct: true },
      { id: this.getId("answer"), question_id: q2Id, text: "Контроль над личной жизнью человека", is_correct: false },
      { id: this.getId("answer"), question_id: q2Id, text: "Сдача экзаменов без применения на практике", is_correct: false },
      { id: this.getId("answer"), question_id: q2Id, text: "Получение сертификата", is_correct: false }
    );

    // Seed Group
    const groupId = this.getId("group");
    this.groups.push({
      id: groupId,
      course_id: courseId,
      name: "Группа №1 (Осень 2026)",
    });

    // Assign Teacher and Student to Group
    this.groupTeachers.push({ group_id: groupId, teacher_id: teacherUser.id });
    this.groupStudents.push({ group_id: groupId, user_id: studentUser.id });

    // Seed Announcement
    const annId = this.getId("announcement");
    const now = new Date().toISOString();
    this.announcements.push({
      id: annId,
      author_id: teacherUser.id,
      title: "Добро пожаловать на курс!",
      body: "Приветствуем всех участников курса Международных Курсов Ученичества! Ознакомьтесь с материалами первой темы и пройдите проверочный тест.",
      created_at: now,
      updated_at: now,
    });
    this.announcementTargets.push({ announcement_id: annId, group_id: groupId });

    // Seed Chat Messages
    this.chatMessages.push(
      {
        id: this.getId("chatMessage"),
        theme_id: theme1Id,
        user_id: teacherUser.id,
        text: "Мир вам! В этом чате можно задавать вопросы по материалам темы 1.",
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: this.getId("chatMessage"),
        theme_id: theme1Id,
        user_id: studentUser.id,
        text: "Здравствуйте! Материалы изучил, очень глубоко. Готовлюсь к тесту.",
        created_at: new Date(Date.now() - 1800000).toISOString(),
      }
    );

    // Seed Extra Material (no tests, with discussion chat)
    const extra1Id = this.getId("extraMaterial");
    this.extraMaterials.push({
      id: extra1Id,
      course_id: courseId,
      course_ids: [courseId],
      group_ids: [groupId],
      title: "Рекомендуемая литература: Классика христианского ученичества",
      description: "Книги и статьи для дополнительного углубленного изучения тем курса.",
      type: "note",
      url: "1. «Цена ученичества» — Дитрих Бонхёффер\n2. «Духовное ученичество» — Дж. Освальд Сандерс\n3. «Подражание Христу» — Фома Кемпийский\n\nПриглашаем делиться размышлениями и задавать вопросы в этом чате обсуждения!",
      order_index: 0,
      created_at: new Date().toISOString(),
    });

    // Seed Discussion Chat for Extra Material
    this.chatMessages.push(
      {
        id: this.getId("chatMessage"),
        extra_material_id: extra1Id,
        user_id: adminUser.id,
        text: "Приветствуем всех участников курса! В этом чате обсуждаются дополнительные материалы. Пишите свои мысли и вопросы.",
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: this.getId("chatMessage"),
        extra_material_id: extra1Id,
        user_id: teacherUser.id,
        text: "Отличный список литературы. Рекомендую начать с первой книги Бонхёффера.",
        created_at: new Date(Date.now() - 3600000).toISOString(),
      }
    );

    // Seed Notification for Student
    this.notifications.push({
      id: this.getId("notification"),
      user_id: studentUser.id,
      type: "announcement",
      title: "Объявление: Добро пожаловать на курс!",
      body: "Приветствуем всех участников курса...",
      link: "/student?tab=announcements",
      read_at: null,
      created_at: now,
    });

    // Seed Direct Message
    this.directMessages.push({
      id: this.getId("directMessage"),
      sender_id: teacherUser.id,
      recipient_id: studentUser.id,
      text: "Привет, Даниил! Если возникнут вопросы по курсу, смело пиши мне напрямую.",
      read_at: null,
      created_at: now,
    });

    // Seed Storage Materials (Единый файловый накопитель всех материалов)
    this.storageMaterials.push(
      {
        id: this.getId("storageMaterial"),
        title: "Вводный видеоурок: Путь и призвание ученика",
        theme_name: "1. Призвание и следование за Христом",
        type: "video",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        description: "Основы следования за Христом, библейские примеры и практические шаги.",
        order_index: 1,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "Конспект лекции: Призвание ученика",
        theme_name: "1. Призвание и следование за Христом",
        type: "note",
        url: "Основные положения темы:\n1. Отречение от себя и следование за Христом (Мк. 8:34).\n2. Послушание Слову и пребывание в Нем (Ин. 8:31).\n3. Взаимная любовь как свидетельство ученичества (Ин. 13:35).\n4. Принесение плода и прославление Отца (Ин. 15:8).",
        description: "Краткий конспект для повторения ключевых мест Писания.",
        order_index: 2,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "Практическое руководство и разбор мест Писания",
        theme_name: "1. Призвание и следование за Христом",
        type: "document",
        url: "https://example.com/materials/practical-guide.pdf",
        description: "Вопросы для самопроверки и размышления над библейскими текстами.",
        order_index: 3,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "Аудиозапись лекции: Личная молитвенная жизнь",
        theme_name: "2. Молитва и духовная дисциплина",
        type: "audio",
        url: "https://example.com/audio/prayer-life.mp3",
        description: "О важности ежедневного молитвенного правила и ходатайственной молитвы.",
        order_index: 1,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "План ежедневного чтения Библии на год",
        theme_name: "2. Молитва и духовная дисциплина",
        type: "document",
        url: "https://example.com/materials/bible-plan.pdf",
        description: "Календарный план последовательного чтения Ветхого и Нового Завета.",
        order_index: 2,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "Инфографика: Структура молитвы Господней",
        theme_name: "2. Молитва и духовная дисциплина",
        type: "image",
        url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=800&auto=format&fit=crop&q=60",
        description: "Наглядная схема прошений в молитве «Отче наш».",
        order_index: 3,
        created_at: now,
      },
      {
        id: this.getId("storageMaterial"),
        title: "Список рекомендуемой классической литературы",
        theme_name: "Дополнительная литература и книги",
        type: "note",
        url: "Рекомендуемые книги:\n1. «Цена ученичества» — Дитрих Бонхёффер\n2. «Духовное ученичество» — Дж. Освальд Сандерс\n3. «Подражание Христу» — Фома Кемпийский\n4. «Крест и крест христианина» — свт. Игнатий Брянчанинов",
        description: "Список классических трудов для углубленного чтения.",
        order_index: 1,
        created_at: now,
      }
    );
  }
}

export const db = new DatabaseStore();

export function notifyUsers(
  userIds: (number | undefined | null)[],
  type: string,
  title: string,
  body: string = "",
  link: string = ""
) {
  const seen = new Set<number>();
  for (const uid of userIds) {
    if (uid === undefined || uid === null || seen.has(uid)) continue;
    seen.add(uid);
    db.notifications.push({
      id: db.getId("notification"),
      user_id: uid,
      type,
      title,
      body,
      link,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  }
}

export function getAllRolesOf(user: User): string[] {
  const roles = [user.role];
  if (user.extra_roles) {
    for (const r of user.extra_roles.split(",")) {
      const clean = r.trim();
      if (clean && !roles.includes(clean)) {
        roles.push(clean);
      }
    }
  }
  return roles;
}

export function normalizePhone(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  return (plus ? "+" : "") + digits;
}
