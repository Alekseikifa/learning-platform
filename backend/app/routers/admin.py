import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role, hash_password, verify_password

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
    if data.role not in ("teacher", "student", "manager"):
        raise HTTPException(400, "role must be teacher, student or manager")
    if db.query(models.User).filter_by(username=data.username).first():
        raise HTTPException(400, "Логин занят")
    u = models.User(role=data.role, username=data.username,
                    password_hash=hash_password(data.password), name=data.name)
    db.add(u); db.commit(); db.refresh(u)
    return u


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdateIn,
                db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role == "admin":
        raise HTTPException(404)
    if data.name is not None:
        u.name = data.name
    if data.username is not None:
        if db.query(models.User).filter(models.User.username == data.username,
                                         models.User.id != user_id).first():
            raise HTTPException(400, "Логин занят")
        u.username = data.username
    db.commit(); db.refresh(u)
    return u


@router.put("/users/{user_id}/password")
def reset_password(user_id: int, data: schemas.PasswordResetIn,
                   db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role == "admin":
        raise HTTPException(404)
    u.password_hash = hash_password(data.password)
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    u = db.query(models.User).get(user_id)
    if not u or u.role == "admin":
        raise HTTPException(404)
    attempt_ids = [a.id for a in db.query(models.Attempt).filter_by(user_id=user_id).all()]
    if attempt_ids:
        db.query(models.AttemptAnswer).filter(
            models.AttemptAnswer.attempt_id.in_(attempt_ids)
        ).delete(synchronize_session=False)
        db.query(models.Attempt).filter(models.Attempt.id.in_(attempt_ids)).delete(synchronize_session=False)
    db.query(models.GroupStudent).filter_by(user_id=user_id).delete()
    db.query(models.GroupTeacher).filter_by(teacher_id=user_id).delete()
    db.query(models.ChatMessage).filter_by(user_id=user_id).delete()
    db.delete(u); db.commit()
    return {"ok": True}


# ---------- ADMIN CREDS ----------
@router.put("/admin/credentials")
def change_admin_creds(data: schemas.AdminCredsIn, db: Session = Depends(get_db),
                       user=Depends(require_role("admin"))):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Неверный текущий пароль")
    if data.username != user.username:
        if db.query(models.User).filter(models.User.username == data.username,
                                        models.User.id != user.id).first():
            raise HTTPException(400, "Логин занят")
        user.username = data.username
    if data.password:
        user.password_hash = hash_password(data.password)
    db.commit()
    return {"ok": True}


# ---------- PHONE INVITES ----------
@router.get("/invites", response_model=list[schemas.PhoneInviteOut])
def list_invites(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return (db.query(models.PhoneInvite)
            .order_by(models.PhoneInvite.created_at.desc()).all())


@router.post("/invites", response_model=schemas.PhoneInviteOut)
def create_invite(data: schemas.PhoneInviteIn, db: Session = Depends(get_db),
                  _=Depends(require_role("admin"))):
    if data.role not in ("teacher", "student", "manager"):
        raise HTTPException(400, "role must be teacher, student or manager")
    # нормализуем телефон так же, как в auth.py
    raw = (data.phone or "").strip()
    plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    phone = ("+" if plus else "") + digits
    if not phone:
        raise HTTPException(400, "Введите номер телефона")
    if db.query(models.PhoneInvite).filter_by(phone=phone).first():
        raise HTTPException(400, "Этот номер уже приглашён")
    if db.query(models.User).filter_by(username=phone).first():
        raise HTTPException(400, "Этот номер уже зарегистрирован")
    inv = models.PhoneInvite(phone=phone, role=data.role, note=data.note or "")
    db.add(inv); db.commit(); db.refresh(inv)
    return inv


@router.delete("/invites/{invite_id}")
def delete_invite(invite_id: int, db: Session = Depends(get_db),
                  _=Depends(require_role("admin"))):
    db.query(models.PhoneInvite).filter_by(id=invite_id).delete()
    db.commit()
    return {"ok": True}




# ---------- SETTINGS ----------
@router.get("/settings/roles")
def get_role_names(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    defaults = {"role_admin_name": "Администратор",
                "role_teacher_name": "Преподаватель",
                "role_student_name": "Ученик"}
    out = {}
    for k, default in defaults.items():
        s = db.query(models.Setting).filter_by(key=k).first()
        out[k] = s.value if s else default
    return out


@router.put("/settings/roles")
def set_role_names(data: schemas.RoleNamesIn, db: Session = Depends(get_db),
                   _=Depends(require_role("admin"))):
    for key, val in [("role_admin_name", data.admin),
                     ("role_teacher_name", data.teacher),
                     ("role_student_name", data.student)]:
        s = db.query(models.Setting).filter_by(key=key).first()
        if s: s.value = val
        else: db.add(models.Setting(key=key, value=val))
    db.commit()
    return {"ok": True}


# ---------- COURSES ----------
def _course_out(c: models.Course, db: Session):
    themes = (db.query(models.Theme).filter_by(course_id=c.id)
              .order_by(models.Theme.order_index, models.Theme.id).all())
    groups = db.query(models.Group).filter_by(course_id=c.id).order_by(models.Group.id).all()
    return {
        "id": c.id, "title": c.title, "description": c.description,
        "themes": [{"id": t.id, "title": t.title, "order_index": t.order_index} for t in themes],
        "groups": [{"id": g.id, "name": g.name} for g in groups],
    }


@router.get("/courses")
def list_courses(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return [_course_out(c, db)
            for c in db.query(models.Course).order_by(models.Course.id).all()]


@router.post("/courses")
def create_course(data: schemas.CourseIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    c = models.Course(title=data.title, description=data.description)
    db.add(c); db.commit(); db.refresh(c)
    return {"id": c.id}


@router.put("/courses/{course_id}")
def update_course(course_id: int, data: schemas.CourseIn,
                  db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    c = db.query(models.Course).get(course_id)
    if not c: raise HTTPException(404)
    c.title = data.title
    c.description = data.description
    db.commit()
    return {"ok": True}


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    theme_ids = [t.id for t in db.query(models.Theme).filter_by(course_id=course_id).all()]
    group_ids = [g.id for g in db.query(models.Group).filter_by(course_id=course_id).all()]
    if theme_ids:
        test_ids = [t.id for t in db.query(models.Test).filter(models.Test.theme_id.in_(theme_ids)).all()]
        if test_ids:
            q_ids = [q.id for q in db.query(models.Question).filter(models.Question.test_id.in_(test_ids)).all()]
            if q_ids:
                db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
                db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
            att_ids = [a.id for a in db.query(models.Attempt).filter(models.Attempt.test_id.in_(test_ids)).all()]
            if att_ids:
                db.query(models.AttemptAnswer).filter(
                    models.AttemptAnswer.attempt_id.in_(att_ids)).delete(synchronize_session=False)
                db.query(models.Attempt).filter(models.Attempt.id.in_(att_ids)).delete(synchronize_session=False)
            db.query(models.Test).filter(models.Test.id.in_(test_ids)).delete(synchronize_session=False)
        db.query(models.Material).filter(models.Material.theme_id.in_(theme_ids)).delete(synchronize_session=False)
        db.query(models.ChatMessage).filter(models.ChatMessage.theme_id.in_(theme_ids)).delete(synchronize_session=False)
        db.query(models.Theme).filter(models.Theme.id.in_(theme_ids)).delete(synchronize_session=False)
    if group_ids:
        ann_ids = [at.announcement_id for at in db.query(models.AnnouncementTarget)
                   .filter(models.AnnouncementTarget.group_id.in_(group_ids)).all()]
        db.query(models.AnnouncementTarget).filter(
            models.AnnouncementTarget.group_id.in_(group_ids)).delete(synchronize_session=False)
        if ann_ids:
            db.query(models.Announcement).filter(models.Announcement.id.in_(ann_ids)).delete(synchronize_session=False)
        db.query(models.GroupTeacher).filter(models.GroupTeacher.group_id.in_(group_ids)).delete(synchronize_session=False)
        db.query(models.GroupStudent).filter(models.GroupStudent.group_id.in_(group_ids)).delete(synchronize_session=False)
        db.query(models.Group).filter(models.Group.id.in_(group_ids)).delete(synchronize_session=False)
    db.query(models.Course).filter_by(id=course_id).delete()
    db.commit()
    return {"ok": True}


# ---------- THEMES ----------
@router.post("/themes")
def create_theme(data: schemas.ThemeIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = models.Theme(**data.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id}


@router.put("/themes/{theme_id}")
def update_theme(theme_id: int, data: schemas.ThemeUpdateIn,
                 db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = db.query(models.Theme).get(theme_id)
    if not t: raise HTTPException(404)
    if data.title is not None: t.title = data.title
    if data.order_index is not None: t.order_index = data.order_index
    db.commit()
    return {"ok": True}


@router.delete("/themes/{theme_id}")
def delete_theme(theme_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    test = db.query(models.Test).filter_by(theme_id=theme_id).first()
    if test:
        q_ids = [q.id for q in db.query(models.Question).filter_by(test_id=test.id).all()]
        if q_ids:
            db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
            db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
        att_ids = [a.id for a in db.query(models.Attempt).filter_by(test_id=test.id).all()]
        if att_ids:
            db.query(models.AttemptAnswer).filter(
                models.AttemptAnswer.attempt_id.in_(att_ids)).delete(synchronize_session=False)
            db.query(models.Attempt).filter(models.Attempt.id.in_(att_ids)).delete(synchronize_session=False)
        db.delete(test)
    db.query(models.Material).filter_by(theme_id=theme_id).delete()
    db.query(models.ChatMessage).filter_by(theme_id=theme_id).delete()
    db.query(models.Theme).filter_by(id=theme_id).delete()
    db.commit()
    return {"ok": True}


# ---------- GROUPS ----------
@router.get("/groups/{course_id}")
def list_groups(course_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    groups = db.query(models.Group).filter_by(course_id=course_id).order_by(models.Group.name).all()
    out = []
    for g in groups:
        t_ids = [gt.teacher_id for gt in db.query(models.GroupTeacher).filter_by(group_id=g.id).all()]
        s_ids = [gs.user_id for gs in db.query(models.GroupStudent).filter_by(group_id=g.id).all()]
        teachers = db.query(models.User).filter(models.User.id.in_(t_ids)).all() if t_ids else []
        students = db.query(models.User).filter(models.User.id.in_(s_ids)).all() if s_ids else []
        out.append({
            "id": g.id, "name": g.name, "course_id": g.course_id,
            "teachers": [{"id": t.id, "name": t.name} for t in teachers],
            "students": [{"id": s.id, "name": s.name, "username": s.username} for s in students],
        })
    return out


@router.post("/groups")
def create_group(data: schemas.GroupIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    g = models.Group(course_id=data.course_id, name=data.name)
    db.add(g); db.commit(); db.refresh(g)
    return {"id": g.id}


@router.put("/groups/{group_id}")
def update_group(group_id: int, data: schemas.GroupUpdateIn,
                 db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    g = db.query(models.Group).get(group_id)
    if not g: raise HTTPException(404)
    g.name = data.name
    db.commit()
    return {"ok": True}


@router.delete("/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    ann_ids = [at.announcement_id for at in db.query(models.AnnouncementTarget)
               .filter_by(group_id=group_id).all()]
    db.query(models.AnnouncementTarget).filter_by(group_id=group_id).delete()
    if ann_ids:
        db.query(models.Announcement).filter(models.Announcement.id.in_(ann_ids)).delete(synchronize_session=False)
    db.query(models.GroupTeacher).filter_by(group_id=group_id).delete()
    db.query(models.GroupStudent).filter_by(group_id=group_id).delete()
    db.query(models.Group).filter_by(id=group_id).delete()
    db.commit()
    return {"ok": True}


@router.post("/groups/{group_id}/teachers")
def add_group_teacher(group_id: int, data: schemas.TeacherAssignIn,
                      db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if not db.query(models.GroupTeacher).filter_by(group_id=group_id, teacher_id=data.teacher_id).first():
        db.add(models.GroupTeacher(group_id=group_id, teacher_id=data.teacher_id))
        db.commit()
    return {"ok": True}


@router.delete("/groups/{group_id}/teachers/{teacher_id}")
def remove_group_teacher(group_id: int, teacher_id: int,
                         db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.GroupTeacher).filter_by(group_id=group_id, teacher_id=teacher_id).delete()
    db.commit()
    return {"ok": True}


@router.post("/groups/{group_id}/students")
def add_group_student(group_id: int, data: schemas.GroupMemberIn,
                      db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if not db.query(models.GroupStudent).filter_by(group_id=group_id, user_id=data.user_id).first():
        db.add(models.GroupStudent(group_id=group_id, user_id=data.user_id))
        db.commit()
    return {"ok": True}


@router.delete("/groups/{group_id}/students/{user_id}")
def remove_group_student(group_id: int, user_id: int,
                         db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.GroupStudent).filter_by(group_id=group_id, user_id=user_id).delete()
    db.commit()
    return {"ok": True}


# ---------- MATERIALS ----------
@router.get("/themes/{theme_id}/materials")
def list_materials(theme_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    mats = (db.query(models.Material).filter_by(theme_id=theme_id)
            .order_by(models.Material.order_index, models.Material.id).all())
    return [{"id": m.id, "theme_id": m.theme_id, "title": m.title,
             "type": m.type, "url": m.url, "order_index": m.order_index} for m in mats]


@router.post("/materials")
def create_material(data: schemas.MaterialIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    m = models.Material(**data.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return {"id": m.id}


@router.put("/materials/{material_id}")
def update_material(material_id: int, data: schemas.MaterialUpdateIn,
                    db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    m = db.query(models.Material).get(material_id)
    if not m: raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/materials/{material_id}")
def delete_material(material_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.Material).filter_by(id=material_id).delete()
    db.commit()
    return {"ok": True}


# ---------- TESTS ----------
@router.get("/themes/{theme_id}/test")
def get_test_for_theme(theme_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = db.query(models.Test).filter_by(theme_id=theme_id).first()
    if not t: return None
    qs = db.query(models.Question).filter_by(test_id=t.id).all()
    return {
        "id": t.id, "title": t.title, "theme_id": t.theme_id,
        "passing_score": t.passing_score, "max_attempts": t.max_attempts,
        "questions": [{
            "id": q.id, "text": q.text,
            "answers": [{"id": a.id, "text": a.text, "is_correct": a.is_correct}
                        for a in db.query(models.Answer).filter_by(question_id=q.id).all()],
        } for q in qs],
    }


@router.post("/tests")
def create_test(data: schemas.TestIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if db.query(models.Test).filter_by(theme_id=data.theme_id).first():
        raise HTTPException(400, "У темы уже есть тест")
    t = models.Test(**data.model_dump())
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id}


@router.put("/tests/{test_id}")
def update_test(test_id: int, data: schemas.TestUpdateIn,
                db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    t = db.query(models.Test).get(test_id)
    if not t: raise HTTPException(404)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/tests/{test_id}")
def delete_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    q_ids = [q.id for q in db.query(models.Question).filter_by(test_id=test_id).all()]
    if q_ids:
        db.query(models.Answer).filter(models.Answer.question_id.in_(q_ids)).delete(synchronize_session=False)
        db.query(models.Question).filter(models.Question.id.in_(q_ids)).delete(synchronize_session=False)
    att_ids = [a.id for a in db.query(models.Attempt).filter_by(test_id=test_id).all()]
    if att_ids:
        db.query(models.AttemptAnswer).filter(
            models.AttemptAnswer.attempt_id.in_(att_ids)).delete(synchronize_session=False)
        db.query(models.Attempt).filter(models.Attempt.id.in_(att_ids)).delete(synchronize_session=False)
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


@router.put("/questions/{question_id}")
def update_question(question_id: int, data: schemas.QuestionUpdateIn,
                    db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    q = db.query(models.Question).get(question_id)
    if not q: raise HTTPException(404)
    if data.text is not None:
        q.text = data.text
    if data.answers is not None:
        if len(data.answers) != 4 or sum(1 for a in data.answers if a.is_correct) != 1:
            raise HTTPException(400, "Должно быть 4 ответа, ровно один правильный")
        db.query(models.Answer).filter_by(question_id=question_id).delete()
        for a in data.answers:
            db.add(models.Answer(question_id=q.id, text=a.text, is_correct=a.is_correct))
    db.commit()
    return {"ok": True}


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    db.query(models.Answer).filter_by(question_id=question_id).delete()
    db.query(models.Question).filter_by(id=question_id).delete()
    db.commit()
    return {"ok": True}


# ---------- UPLOADS ----------
@router.post("/uploads", response_model=schemas.FileOut)
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db),
                _=Depends(require_role("admin"))):
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
    if not rec: raise HTTPException(404)
    path = os.path.join(UPLOAD_DIR, rec.filename)
    if os.path.exists(path): os.remove(path)
    db.delete(rec); db.commit()
    return {"ok": True}
