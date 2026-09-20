from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role

router = APIRouter()


# ---------- GROUPS ----------
@router.get("/groups")
def list_all_groups(db: Session = Depends(get_db),
                    _=Depends(require_role("admin", "manager"))):
    groups = db.query(models.Group).all()
    out = []
    for g in groups:
        c = db.query(models.Course).get(g.course_id)
        out.append({"id": g.id, "name": g.name, "course_id": g.course_id,
                    "course_title": c.title if c else ""})
    return out


# ---------- ANNOUNCEMENTS ----------
@router.post("/announcements")
def create_announcement(data: schemas.AnnouncementIn,
                        db: Session = Depends(get_db),
                        user=Depends(require_role("admin", "manager"))):
    from .notifications import notify
    if not data.group_ids:
        raise HTTPException(400, "Выберите хотя бы одну группу")
    a = models.Announcement(author_id=user.id, title=data.title, body=data.body)
    db.add(a); db.flush()
    for gid in data.group_ids:
        if db.query(models.Group).get(gid):
            db.add(models.AnnouncementTarget(announcement_id=a.id, group_id=gid))

    student_ids = []
    teacher_ids = []
    for gid in data.group_ids:
        student_ids += [gs.user_id for gs in
                        db.query(models.GroupStudent).filter_by(group_id=gid).all()]
        teacher_ids += [gt.teacher_id for gt in
                        db.query(models.GroupTeacher).filter_by(group_id=gid).all()]

    notify(db, student_ids, "announcement",
           f"Объявление: {data.title}", body=data.body[:160],
           link="/student?tab=announcements")
    notify(db, teacher_ids, "announcement",
           f"Объявление для вашей группы: {data.title}", body=data.body[:160],
           link="/teacher?tab=announcements")
    db.commit()
    return {"id": a.id}


@router.post("/announcements")
def create_announcement(data: schemas.AnnouncementIn,
                        db: Session = Depends(get_db),
                        user=Depends(require_role("admin", "manager"))):
    from .notifications import notify
    if not data.group_ids:
        raise HTTPException(400, "Выберите хотя бы одну группу")
    a = models.Announcement(author_id=user.id, title=data.title, body=data.body)
    db.add(a); db.flush()
    for gid in data.group_ids:
        if db.query(models.Group).get(gid):
            db.add(models.AnnouncementTarget(announcement_id=a.id, group_id=gid))
    student_ids = []
    for gid in data.group_ids:
        student_ids += [gs.user_id for gs in
                        db.query(models.GroupStudent).filter_by(group_id=gid).all()]
    notify(db, student_ids, "announcement",
           f"Объявление: {data.title}", body=data.body[:160],
           link="/student?tab=announcements")
    db.commit()
    return {"id": a.id}


@router.put("/announcements/{ann_id}")
def update_announcement(ann_id: int, data: schemas.AnnouncementUpdateIn,
                        db: Session = Depends(get_db),
                        user=Depends(require_role("admin", "manager"))):
    a = db.query(models.Announcement).get(ann_id)
    if not a:
        raise HTTPException(404)
    if user.role != "admin" and a.author_id != user.id:
        raise HTTPException(403, "Можно редактировать только свои объявления")
    if data.title is not None: a.title = data.title
    if data.body is not None: a.body = data.body
    if data.group_ids is not None:
        db.query(models.AnnouncementTarget).filter_by(announcement_id=ann_id).delete()
        for gid in data.group_ids:
            if db.query(models.Group).get(gid):
                db.add(models.AnnouncementTarget(announcement_id=ann_id, group_id=gid))
    db.commit()
    return {"ok": True}


@router.delete("/announcements/{ann_id}")
def delete_announcement(ann_id: int, db: Session = Depends(get_db),
                        user=Depends(require_role("admin", "manager"))):
    a = db.query(models.Announcement).get(ann_id)
    if not a:
        raise HTTPException(404)
    if user.role != "admin" and a.author_id != user.id:
        raise HTTPException(403, "Можно удалять только свои объявления")
    db.query(models.AnnouncementTarget).filter_by(announcement_id=ann_id).delete()
    db.delete(a); db.commit()
    return {"ok": True}


# ---------- CHATS ----------
@router.get("/themes")
def list_all_themes(db: Session = Depends(get_db),
                    _=Depends(require_role("admin", "manager"))):
    rows = (db.query(models.Theme, models.Course)
            .join(models.Course, models.Course.id == models.Theme.course_id)
            .order_by(models.Course.title, models.Theme.order_index).all())
    return [{"id": t.id, "title": t.title, "order_index": t.order_index,
             "course_id": c.id, "course_title": c.title} for t, c in rows]


@router.get("/themes/{theme_id}/chat")
def staff_chat_list(theme_id: int, db: Session = Depends(get_db),
                    user=Depends(require_role("admin", "manager"))):
    theme = db.query(models.Theme).get(theme_id)
    if not theme:
        raise HTTPException(404)
    rows = (db.query(models.ChatMessage, models.User.name, models.User.role)
            .join(models.User, models.User.id == models.ChatMessage.user_id)
            .filter(models.ChatMessage.theme_id == theme_id)
            .order_by(models.ChatMessage.created_at).all())
    return [{"id": m.id, "text": m.text, "created_at": m.created_at.isoformat(),
             "user_id": m.user_id, "user_name": name, "user_role": role,
             "is_mine": m.user_id == user.id}
            for m, name, role in rows]


@router.post("/themes/{theme_id}/chat")
def staff_chat_send(theme_id: int, data: schemas.ChatIn,
                    db: Session = Depends(get_db),
                    user=Depends(require_role("admin", "manager"))):
    from .notifications import notify
    theme = db.query(models.Theme).get(theme_id)
    if not theme:
        raise HTTPException(404)
    m = models.ChatMessage(theme_id=theme_id, user_id=user.id, text=data.text)
    db.add(m); db.flush()

    gids = [g.id for g in db.query(models.Group).filter_by(course_id=theme.course_id).all()]
    recipients = set()
    for gid in gids:
        recipients.update(gs.user_id for gs in
                          db.query(models.GroupStudent).filter_by(group_id=gid).all())
        recipients.update(gt.teacher_id for gt in
                          db.query(models.GroupTeacher).filter_by(group_id=gid).all())
    recipients.discard(user.id)

    notify(db, list(recipients), "chat",
           f"Сообщение от {user.name} в теме «{theme.title}»",
           body=data.text[:160],
           link=f"/student?course={theme.course_id}&theme={theme_id}")
    db.commit(); db.refresh(m)
    return {"id": m.id}
