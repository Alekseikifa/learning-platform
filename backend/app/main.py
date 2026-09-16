import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password
from .routers import auth as auth_router, admin, teacher, student

# создать таблицы
Base.metadata.create_all(bind=engine)

# сид админа
db = SessionLocal()
if not db.query(models.User).filter_by(role="admin").first():
    db.add(models.User(
        role="admin", username="admin",
        password_hash=hash_password("admin"), name="Администратор",
    ))
    db.commit()
    print("→ Создан администратор: admin / admin")
db.close()

os.makedirs("uploads", exist_ok=True)

app = FastAPI(title="Learning Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(teacher.router, prefix="/api/teacher", tags=["teacher"])
app.include_router(student.router, prefix="/api/student", tags=["student"])


@app.get("/api/health")
def health():
    return {"ok": True}