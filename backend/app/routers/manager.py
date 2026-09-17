import os, uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role, hash_password

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_UPLOAD_MB = 500


@router.get("/courses")
def list_courses(db: Session = Depends(get_db), _=Depends(require_role("manager"))):
    courses = db.query(models.Course).order_by(models.Course.id).all()
    out = []
    for c in courses:
        themes = (db.query(models.Theme).filter_by(course_id=c.id)
                  .order_by(models.Theme.order_index, models.Theme.id).all())
        groups = db.query(models.Group).filter_by(course_id=c.id).order_by(models.Group.name).all()
        out.append({"id": c.id, "title": c.title, "description": c.description,
                    "themes": [{"id": t.id, "title": t.title, "order_index": t.order_index} for t in themes],
                    "groups": [{"id": g.id, "name": g.name} for g in groups]})
    return out


@router.get("/users")
def list_users(db: Session = Depends(get_db), _=Depends(require_role("manager"))):
    users = db.query(models.User).filter(models.User.role.in_(["teacher", "student"])).all()
    return [{"id": u.id, "name": u.name, "username": u.username, "role": u.role} for u in users]


@router.get("/groups")
def list_groups(db: Session = Depends(get_db), _=Depends(require_role("manager"))):
    groups = db.query(models.Group).all()
    out = []
    for g in groups:
        c = db.query(models.Course).get(g.course_id)
        t_ids = [gt.teacher_id for gt in db.query(models.GroupTeacher).filter_by(group_id=g.id).all()]
        curators = db.query(models.User).filter(models.User.id.in_(t_ids)).all() if t_ids else []
        s_count = db.query(models.GroupStudent).filter_by(group_id=g.id).count()
        out.append({"id": g.id, "name": g.name, "course_id": g.course_id,
                    "course_title": c.title if c else "",
                    "student_count": s_count,
                    "curators": [{"id": t.id, "name": t.name} for t in curators]})
    return out


# Создать ученика (и привязать к группам)
@router.post("/students")
def create_student(data: dict, db: Session = Depends(get_db),
                   _=Depends(require_role("manager"))):
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    group_ids = data.get("group_ids") or []
    if not name or not username or not password:
        raise HTTPException(400, "Заполните ФИО, логин и пароль")
    if db.query(models.User).filter_by(username=username).first():
        raise HTTPException(400, "Логин занят")
    u = models.User(role="student", username=username,
                    password_hash=hash_password(password), name=name)
    db.add(u); db.flush()
    for gid in group_ids:
        if db.query(models.Group).get(gid):
            db.add(models.GroupStudent(group_id=gid, user_id=u.id))
    db.commit()
    return {"id": u.id}

# ---------- STUDENTS ----------
@router.get("/students")
def list_students_full(db: Session = Depends(get_db),
                       _=Depends(require_role("manager"))):
    students = (db.query(models.User).filter_by(role="student")
                .order_by(models.User.name).all())
    out = []
    for s in students:
        gids = [gs.group_id for gs in
                db.query(models.GroupStudent).filter_by(user_id=s.id).all()]
        groups = []
        for gid in gids:
            g = db.query(models.Group).get(gid)
            if g:
                c = db.query(models.Course).get(g.course_id)
                groups.append({"id": g.id, "name": g.name,
                               "course": c.title if c else ""})
        out.append({
            "id": s.id, "name": s.name, "username": s.username,
            "groups": groups,
        })
    return out


@router.put("/students/{user_id}")
def update_student(user_id: int, data: schemas.UserUpdateIn,
                   db: Session = Depends(get_db),
                   _=Depends(require_role("manager"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role != "student":
        raise HTTPException(404, "Ученик не найден")
    if data.name is not None:
        u.name = data.name
    if data.username is not None:
        if db.query(models.User).filter(models.User.username == data.username,
                                        models.User.id != user_id).first():
            raise HTTPException(400, "Логин занят")
        u.username = data.username
    db.commit()
    return {"ok": True}


@router.put("/students/{user_id}/password")
def reset_student_password(user_id: int, data: schemas.PasswordResetIn,
                           db: Session = Depends(get_db),
                           _=Depends(require_role("manager"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role != "student":
        raise HTTPException(404)
    u.password_hash = hash_password(data.password)
    db.commit()
    return {"ok": True}


@router.post("/students/{user_id}/groups/{group_id}")
def add_student_to_group(user_id: int, group_id: int,
                         db: Session = Depends(get_db),
                         _=Depends(require_role("manager"))):
    u = db.query(models.User).get(user_id)
    g = db.query(models.Group).get(group_id)
    if not u or u.role != "student" or not g:
        raise HTTPException(404)
    if not db.query(models.GroupStudent).filter_by(group_id=group_id,
                                                    user_id=user_id).first():
        db.add(models.GroupStudent(group_id=group_id, user_id=user_id))
        db.commit()
    return {"ok": True}


@router.delete("/students/{user_id}/groups/{group_id}")
def remove_student_from_group(user_id: int, group_id: int,
                              db: Session = Depends(get_db),
                              _=Depends(require_role("manager"))):
    db.query(models.GroupStudent).filter_by(group_id=group_id,
                                            user_id=user_id).delete()
    db.commit()
    return {"ok": True}


# Материалы
@router.get("/themes/{theme_id}/materials")
def list_materials(theme_id: int, db: Session = Depends(get_db),
                   _=Depends(require_role("manager"))):
    mats = (db.query(models.Material).filter_by(theme_id=theme_id)
            .order_by(models.Material.order_index, models.Material.id).all())
    return [{"id": m.id, "theme_id": m.theme_id, "title": m.title,
             "type": m.type, "url": m.url, "order_index": m.order_index} for m in mats]


@router.post("/materials")
def create_material(data: schemas.MaterialIn, db: Session = Depends(get_db),
                    _=Depends(require_role("manager"))):
    m = models.Material(**data.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return {"id": m.id}


@router.put("/materials/{material_id}")
def update_material(material_id: int, data: schemas.MaterialUpdateIn,
                    db: Session = Depends(get_db), _=Depends(require_role("manager"))):
    m = db.query(models.Material).get(material_id)
    if not m: raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/materials/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db),
                    _=Depends(require_role("manager"))):
    db.query(models.Material).filter_by(id=material_id).delete()
    db.commit()
    return {"ok": True}


# Файлы
@router.post("/uploads", response_model=schemas.FileOut)
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db),
                _=Depends(require_role("manager"))):
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
def list_uploads(db: Session = Depends(get_db), _=Depends(require_role("manager"))):
    return db.query(models.UploadedFile).order_by(models.UploadedFile.uploaded_at.desc()).all()


@router.delete("/uploads/{file_id}")
def delete_upload(file_id: int, db: Session = Depends(get_db),
                  _=Depends(require_role("manager"))):
    rec = db.query(models.UploadedFile).get(file_id)
    if not rec: raise HTTPException(404)
    path = os.path.join(UPLOAD_DIR, rec.filename)
    if os.path.exists(path): os.remove(path)
    db.delete(rec); db.commit()
    return {"ok": True}
