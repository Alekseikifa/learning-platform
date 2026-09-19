import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password
from .routers import (auth as auth_router, admin, teacher, student,
                      public, manager, notifications, staff, messages)

Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    # 1. Колонка extra_roles в users
    try:
        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN extra_roles VARCHAR DEFAULT ''")
        conn.commit()
        print("→ Добавлена колонка users.extra_roles")
    except Exception as e:
        # Обычно это значит, что колонка уже есть — это нормально
        print(f"→ users.extra_roles: {e}")

    # 2. Таблица notifications
    try:
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                body TEXT DEFAULT '',
                link VARCHAR DEFAULT '',
                read_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)")
        conn.commit()
        print("→ Таблица notifications готова")
    except Exception as e:
        print(f"→ notifications ОШИБКА: {e}")

    # 3. phone_invites
    try:
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS phone_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone VARCHAR UNIQUE NOT NULL,
                role VARCHAR NOT NULL,
                note VARCHAR DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_phone_invites_phone ON phone_invites (phone)")
        conn.commit()
        print("→ Таблица phone_invites готова")
    except Exception as e:
        print(f"→ phone_invites ОШИБКА: {e}")

    # 4. direct_messages
    try:
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS direct_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                recipient_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                read_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users (id),
                FOREIGN KEY (recipient_id) REFERENCES users (id)
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_dm_sender ON direct_messages (sender_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_dm_recipient ON direct_messages (recipient_id)")
        conn.commit()
        print("→ Таблица direct_messages готова")
    except Exception as e:
        print(f"→ direct_messages ОШИБКА: {e}")
db = SessionLocal()
if not db.query(models.User).filter_by(role="admin").first():
    db.add(models.User(role="admin", username="admin",
                       password_hash=hash_password("admin"), name="Администратор"))
    db.commit()
    print("→ Создан администратор: admin / admin")

DEFAULT_SETTINGS = {
    "role_admin_name": "Администратор",
    "role_teacher_name": "Куратор",       # было "Преподаватель"
    "role_student_name": "Ученик",
    "role_manager_name": "Методист",      # новое
    "school_name": "МКУ — Международные Курсы Ученичества",  # новое
}
for k, v in DEFAULT_SETTINGS.items():
    if not db.query(models.Setting).filter_by(key=k).first():
        db.add(models.Setting(key=k, value=v))
db.commit()
db.close()

os.makedirs("uploads", exist_ok=True)

app = FastAPI(title="Learning Platform API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(public.router, prefix="/api/public", tags=["public"])
app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(manager.router, prefix="/api/manager", tags=["manager"])
app.include_router(teacher.router, prefix="/api/teacher", tags=["teacher"])
app.include_router(student.router, prefix="/api/student", tags=["student"])
app.include_router(staff.router, prefix="/api/staff", tags=["staff"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])

@app.get("/api/health")
def health():
    return {"ok": True}
