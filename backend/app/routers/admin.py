import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role, hash_password

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_UPLOAD_MB = 500


# ---------- USERS ----------
@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return db.query(models.User).filter(models.User.role != "admin").all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(data: schemas.UserIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if data.role not in ("teacher", "student"):
        raise HTTPException(400, "role must be teacher or student")
    if db.query(models.User).filter_by(username=data.username).first():
        raise HTTPException(400, "Логин занят")
    u = models.User(role=data.role, username=data.username,
                    password_hash=hash_password(data.password), name=data.name)
    db.add(u); db.commit(); db.refresh(u)
    return u


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role == "admin":
        raise HTTPException(404)
    db.query(models.Attempt).filter_by(user_id=user_id).delete()
    db.query(models.Enrollment).filter_by(user_id=user_id).delete()
    db.query(models.CourseTeacher).filter_by(teacher_id=user_id).delete()
    db.delete(u); db.commit()
    return {"ok": True}


# ---------- COURSES ----------
@router.get("/courses")
def list_courses(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    courses = db.query(models.Course).order_by(models.Course.id).all()
    out = []
    for c in courses:
        teacher_ids = [ct.teacher_id for ct in db.query(models.CourseTeacher).filter_by(course_id=c.id).all()]
        teachers = db.query(models.User).filter(models.User.id.in_(teacher_ids)).all() if teacher_ids else []
        out.append({
            "id": c.id, "title": c.title, "description": c.description,
            "teachers": [{"id": t.id, "name": t.name} for t in teachers],
        })
    return out


@router.post("/courses")
def create_course(data: schemas.CourseIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    c = models.Course(title=data.title, description=data.description)
    db.add(c); db.commit(); db.refresh(c)
    return {"id": c.id}


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    material_ids = [m.id for m in db.query(models.Material).filter_by(course_id=course_id).all()]
    test_ids = [t.id for t in db.query(models.Test).filter_by(course_id=course_id).all()]
    q_ids = [q.id for q in db.query(models.Question).filter(models.Question.test_id.in_(test_ids)).all()] if test_ids else []
    if q_ids:
        db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
        db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
    if test_ids:
        db.query(models.Attempt).filter(models.Attempt.test_id.in_(test_ids)).delete(synchronize_session=False)
        db.query(models.Test).filter(models.Test.id.in_(test_ids)).delete(synchronize_session=False)
    db.query(models.Material).filter_by(course_id=course_id).delete()
    db.query(models.Enrollment).filter_by(course_id=course_id).delete()
    db.query(models.CourseTeacher).filter_by(course_id=course_id).delete()
    db.query(models.Course).filter_by(id=course_id).delete()
    db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/teachers")
def assign_teacher(course_id: int, data: schemas.TeacherAssignIn,
                   db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if not db.query(models.CourseTeacher).filter_by(course_id=course_id, teacher_id=data.teacher_id).first():
        db.add(models.CourseTeacher(course_id=course_id, teacher_id=data.teacher_id))
        db.commit()
    return {"ok": True}


@router.delete("/courses/{course_id}/teachers/{teacher_id}")
def unassign_teacher(course_id: int, teacher_id: int,
                     db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.CourseTeacher).filter_by(course_id=course_id, teacher_id=teacher_id).delete()
    db.commit()
    return {"ok": True}


# ---------- MATERIALS ----------
@router.get("/materials/{course_id}")
def list_materials(course_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return [{"id": m.id, "course_id": m.course_id, "title": m.title, "type": m.type,
             "url": m.url, "order_index": m.order_index}
            for m in db.query(models.Material).filter_by(course_id=course_id)
            .order_by(models.Material.order_index, models.Material.id).all()]


@router.post("/materials")
def create_material(data: schemas.MaterialIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    m = models.Material(**data.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return {"id": m.id}


@router.delete("/materials/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    test = db.query(models.Test).filter_by(material_id=material_id).first()
    if test:
        q_ids = [q.id for q in db.query(models.Question).filter_by(test_id=test.id).all()]
        if q_ids:
            db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
            db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
        db.query(models.Attempt).filter_by(test_id=test.id).delete()
        db.delete(test)
    db.query(models.Material).filter_by(id=material_id).delete()
    db.commit()
    return {"ok": True}


# ---------- TESTS & QUESTIONS ----------
@router.get("/tests/{course_id}")
def list_tests(course_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    tests = db.query(models.Test).filter_by(course_id=course_id).all()
    out = []
    for t in tests:
        qs = db.query(models.Question).filter_by(test_id=t.id).all()
        out.append({
            "id": t.id, "title": t.title, "material_id": t.material_id,
            "passing_score": t.passing_score,
            "questions": [{
                "id": q.id, "text": q.text,
                "answers": [{"id": a.id, "text": a.text, "is_correct": a.is_correct}
                            for a in db.query(models.Answer).filter_by(question_id=q.id).all()],
            } for q in qs],
        })
    return out


@router.post("/tests")
def create_test(data: schemas.TestIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if db.query(models.Test).filter_by(material_id=data.material_id).first():
        raise HTTPException(400, "У материала уже есть тест")
    t = models.Test(**data.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id}


@router.delete("/tests/{test_id}")
def delete_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    q_ids = [q.id for q in db.query(models.Question).filter_by(test_id=test_id).all()]
    if q_ids:
        db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
        db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
    db.query(models.Attempt).filter_by(test_id=test_id).delete()
    db.query(models.Test).filter_by(id=test_id).delete()
    db.commit()
    return {"ok": True}


@router.post("/questions")
def create_question(data: schemas.QuestionIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if len(data.answers) != 4:
        raise HTTPException(400, "Должно быть ровно 4 ответа")
    if sum(1 for a in data.answers if a.is_correct) != 1:
        raise HTTPException(400, "Ровно один правильный ответ")
    q = models.Question(test_id=data.test_id, text=data.text)
    db.add(q); db.flush()
    for a in data.answers:
        db.add(models.Answer(question_id=q.id, text=a.text, is_correct=a.is_correct))
    db.commit()
    return {"id": q.id}


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.Answer).filter_by(question_id=question_id).delete()
    db.query(models.Question).filter_by(id=question_id).delete()
    db.commit()
    return {"ok": True}


# ---------- ENROLLMENTS ----------
@router.get("/enrollments")
def list_enrollments(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    rows = db.query(models.Enrollment).all()
    out = []
    for e in rows:
        u = db.query(models.User).get(e.user_id)
        c = db.query(models.Course).get(e.course_id)
        if u and c:
            out.append({"user_id": u.id, "course_id": c.id, "student": u.name, "course": c.title})
    return out


@router.post("/enrollments")
def add_enrollment(data: schemas.EnrollIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if not db.query(models.Enrollment).filter_by(user_id=data.user_id, course_id=data.course_id).first():
        db.add(models.Enrollment(user_id=data.user_id, course_id=data.course_id))
        db.commit()
    return {"ok": True}


@router.delete("/enrollments")
def remove_enrollment(data: schemas.EnrollIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.Enrollment).filter_by(user_id=data.user_id, course_id=data.course_id).delete()
    db.commit()
    return {"ok": True}


# ---------- UPLOADS ----------
@router.post("/uploads", response_model=schemas.FileOut)
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    ext = os.path.splitext(file.filename or "")[1].lower()
    stored = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, stored)
    size = 0
    with open(dest, "wb") as f:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                f.close(); os.remove(dest)
                raise HTTPException(413, f"Файл больше {MAX_UPLOAD_MB} МБ")
            f.write(chunk)
    rec = models.UploadedFile(filename=stored, original_name=file.filename,
                              mimetype=file.content_type, size=size)
    db.add(rec); db.commit(); db.refresh(rec)
    return rec


@router.get("/uploads", response_model=list[schemas.FileOut])
def list_uploads(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return db.query(models.UploadedFile).order_by(models.UploadedFile.uploaded_at.desc()).all()


@router.delete("/uploads/{file_id}")
def delete_upload(file_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    rec = db.query(models.UploadedFile).get(file_id)
    if not rec:
        raise HTTPException(404)
    path = os.path.join(UPLOAD_DIR, rec.filename)
    if os.path.exists(path):
        os.remove(path)
    db.delete(rec); db.commit()
    return {"ok": True}