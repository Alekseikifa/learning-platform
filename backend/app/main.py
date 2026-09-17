import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password
from .routers import auth as auth_router, admin, teacher, student, public, manager, notifications

Base.metadata.create_all(bind=engine)

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

@app.get("/api/health")
def health():
    return {"ok": True}
