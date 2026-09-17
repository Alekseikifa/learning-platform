from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role

router = APIRouter()


def _my_group_ids(teacher_id: int, db: Session):
    return [gt.group_id for gt in db.query(models.GroupTeacher)
            .filter_by(teacher_id=teacher_id).all()]


def _my_course_ids(teacher_id: int, db: Session):
    gids = _my_group_ids(teacher_id, db)
    if not gids: return []
    return list({db.query(models.Group).get(g).course_id for g in gids})


def _own_group(group_id: int, teacher_id: int, db: Session):
    return db.query(models.GroupTeacher).filter_by(
        group_id=group_id, teacher_id=teacher_id).first() is not None


def _test_ids_for_groups(group_ids, db: Session):
    if not group_ids: return []
    course_ids = list({g.course_id for g in db.query(models.Group).filter(
        models.Group.id.in_(group_ids)).all()})
    if not course_ids: return []
    theme_ids = [t.id for t in db.query(models.Theme).filter(
        models.Theme.course_id.in_(course_ids)).all()]
    if not theme_ids: return []
    return [t.id for t in db.query(models.Test).filter(models.Test.theme_id.in_(theme_ids)).all()]


@router.get("/courses")
def my_courses(db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    cids = _my_course_ids(user.id, db)
    if not cids: return []
    return [{"id": c.id, "title": c.title, "description": c.description}
            for c in db.query(models.Course).filter(models.Course.id.in_(cids)).all()]


@router.get("/groups")
def my_groups(db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    gids = _my_group_ids(user.id, db)
    if not gids: return []
    out = []
    for g in db.query(models.Group).filter(models.Group.id.in_(gids)).all():
        c = db.query(models.Course).get(g.course_id)
        out.append({"id": g.id, "name": g.name, "course_id": g.course_id,
                    "course_title": c.title if c else ""})
    return out


@router.get("/groups/{group_id}/students")
def group_students(group_id: int, db: Session = Depends(get_db),
                   user=Depends(require_role("teacher"))):
    if not _own_group(group_id, user.id, db):
        raise HTTPException(403)
    g = db.query(models.Group).get(group_id)
    course_id = g.course_id
    test_ids = _test_ids_for_groups([group_id], db)

    s_ids = [gs.user_id for gs in db.query(models.GroupStudent).filter_by(group_id=group_id).all()]
    students = db.query(models.User).filter(models.User.id.in_(s_ids)).all() if s_ids else []

    out = []
    for s in students:
        if test_ids:
            passed = (db.query(models.Attempt.test_id)
                      .filter(models.Attempt.user_id == s.id,
                              models.Attempt.test_id.in_(test_ids),
                              models.Attempt.passed.is_(True))
                      .distinct().count())
            last = db.query(func.max(models.Attempt.created_at)).filter(
                models.Attempt.user_id == s.id,
                models.Attempt.test_id.in_(test_ids)).scalar()
        else:
            passed = 0; last = None
        progress = round(100 * passed / len(test_ids)) if test_ids else 0
        out.append({"id": s.id, "name": s.name, "username": s.username,
                    "progress": progress, "passed_tests": passed,
                    "total_tests": len(test_ids),
                    "last_activity": last.isoformat() if last else None})
    return out


@router.get("/groups/{group_id}/progress")
def group_progress(group_id: int, db: Session = Depends(get_db),
                   user=Depends(require_role("teacher"))):
    """Таблица: темы × ученики с отметками сдачи и количеством попыток."""
    if not _own_group(group_id, user.id, db):
        raise HTTPException(403)
    g = db.query(models.Group).get(group_id)
    themes = (db.query(models.Theme).filter_by(course_id=g.course_id)
              .order_by(models.Theme.order_index, models.Theme.id).all())
    s_ids = [gs.user_id for gs in db.query(models.GroupStudent).filter_by(group_id=group_id).all()]
    students = db.query(models.User).filter(models.User.id.in_(s_ids)).all() if s_ids else []

    themes_out = []
    for th in themes:
        test = db.query(models.Test).filter_by(theme_id=th.id).first()
        themes_out.append({"id": th.id, "title": th.title,
                           "order_index": th.order_index,
                           "test_id": test.id if test else None,
                           "test_title": test.title if test else None})

    students_out = []
    for s in students:
        cells = []
        for th in themes:
            test = db.query(models.Test).filter_by(theme_id=th.id).first()
            if not test:
                cells.append({"theme_id": th.id, "status": "no_test"})
                continue
            attempts = (db.query(models.Attempt)
                        .filter_by(user_id=s.id, test_id=test.id)
                        .order_by(models.Attempt.created_at.desc()).all())
            if not attempts:
                cells.append({"theme_id": th.id, "status": "not_started",
                              "attempts": 0})
            else:
                best = max(attempts, key=lambda a: a.score)
                cells.append({
                    "theme_id": th.id,
                    "status": "passed" if any(a.passed for a in attempts) else "failed",
                    "attempts": len(attempts),
                    "best_score": best.score,
                    "last_attempt_id": attempts[0].id,
                    "last_passed": attempts[0].passed,
                    "last_score": attempts[0].score,
                })
        students_out.append({"id": s.id, "name": s.name, "cells": cells})
    return {"themes": themes_out, "students": students_out}


@router.get("/groups/{group_id}/attempts")
def group_attempts(group_id: int, db: Session = Depends(get_db),
                   user=Depends(require_role("teacher"))):
    if not _own_group(group_id, user.id, db):
        raise HTTPException(403)
    test_ids = _test_ids_for_groups([group_id], db)
    if not test_ids: return []
    s_ids = [gs.user_id for gs in db.query(models.GroupStudent).filter_by(group_id=group_id).all()]
    if not s_ids: return []
    rows = (db.query(models.Attempt, models.User.name, models.Test.title)
            .join(models.User, models.User.id == models.Attempt.user_id)
            .join(models.Test, models.Test.id == models.Attempt.test_id)
            .filter(models.Attempt.test_id.in_(test_ids),
                    models.Attempt.user_id.in_(s_ids))
            .order_by(models.Attempt.created_at.desc()).limit(500).all())
    return [{"id": a.id, "student": name, "test": title, "score": a.score,
             "passed": a.passed, "created_at": a.created_at.isoformat()}
            for a, name, title in rows]


@router.get("/attempts/{attempt_id}/details")
def attempt_details(attempt_id: int, db: Session = Depends(get_db),
                    user=Depends(require_role("teacher"))):
    a = db.query(models.Attempt).get(attempt_id)
    if not a: raise HTTPException(404)
    test = db.query(models.Test).get(a.test_id)
    theme = db.query(models.Theme).get(test.theme_id)
    course = db.query(models.Course).get(theme.course_id)
    # проверка, что у учителя есть группа этого курса
    gids = _my_group_ids(user.id, db)
    my_courses = {db.query(models.Group).get(g).course_id for g in gids}
    if course.id not in my_courses:
        raise HTTPException(403)
    student = db.query(models.User).get(a.user_id)
    return _attempt_details_payload(a, db, student_name=student.name)


def _attempt_details_payload(a, db, student_name=None):
    questions = db.query(models.Question).filter_by(test_id=a.test_id).all()
    aa_rows = {x.question_id: x for x in db.query(models.AttemptAnswer)
               .filter_by(attempt_id=a.id).all()}
    out = []
    for q in questions:
        answers = db.query(models.Answer).filter_by(question_id=q.id).all()
        right = next((x for x in answers if x.is_correct), None)
        chosen_id = aa_rows[q.id].answer_id if q.id in aa_rows else None
        is_correct = aa_rows[q.id].is_correct if q.id in aa_rows else False
        out.append({
            "question": q.text,
            "answers": [{"id": x.id, "text": x.text, "is_correct": x.is_correct,
                         "chosen": chosen_id == x.id} for x in answers],
            "chosen_answer_id": chosen_id,
            "right_answer_id": right.id if right else None,
            "is_correct": is_correct,
        })
    test = db.query(models.Test).get(a.test_id)
    return {"attempt_id": a.id, "score": a.score, "passed": a.passed,
            "created_at": a.created_at.isoformat(), "test_title": test.title,
            "student_name": student_name, "questions": out}


# ---------- ANNOUNCEMENTS ----------
@router.get("/announcements")
def my_announcements(db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    rows = (db.query(models.Announcement)
            .filter_by(author_id=user.id)
            .order_by(models.Announcement.created_at.desc()).all())
    out = []
    for a in rows:
        targets = [t.group_id for t in db.query(models.AnnouncementTarget)
                   .filter_by(announcement_id=a.id).all()]
        out.append({"id": a.id, "title": a.title, "body": a.body,
                    "created_at": a.created_at.isoformat(),
                    "updated_at": a.updated_at.isoformat(),
                    "group_ids": targets})
    return out


@router.post("/announcements")
def create_announcement(data: schemas.AnnouncementIn,
                        db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    from .notifications import notify
    if not data.group_ids:
        raise HTTPException(400, "Нужно выбрать хотя бы одну группу")
    for gid in data.group_ids:
        if not _own_group(gid, user.id, db):
            raise HTTPException(403)
    a = models.Announcement(author_id=user.id, title=data.title, body=data.body)
    db.add(a); db.flush()
    for gid in data.group_ids:
        db.add(models.AnnouncementTarget(announcement_id=a.id, group_id=gid))

    # уведомляем учеников целевых групп
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
                        db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    a = db.query(models.Announcement).get(ann_id)
    if not a or a.author_id != user.id:
        raise HTTPException(404)
    if data.title is not None: a.title = data.title
    if data.body is not None: a.body = data.body
    if data.group_ids is not None:
        for gid in data.group_ids:
            if not _own_group(gid, user.id, db):
                raise HTTPException(403)
        db.query(models.AnnouncementTarget).filter_by(announcement_id=ann_id).delete()
        for gid in data.group_ids:
            db.add(models.AnnouncementTarget(announcement_id=ann_id, group_id=gid))
    db.commit()
    return {"ok": True}


@router.delete("/announcements/{ann_id}")
def delete_announcement(ann_id: int, db: Session = Depends(get_db),
                        user=Depends(require_role("teacher"))):
    a = db.query(models.Announcement).get(ann_id)
    if not a or a.author_id != user.id:
        raise HTTPException(404)
    db.query(models.AnnouncementTarget).filter_by(announcement_id=ann_id).delete()
    db.delete(a); db.commit()
    return {"ok": True}


# ---------- ANALYTICS (existing) ----------
@router.get("/groups/{group_id}/analytics")
def analytics(group_id: int, db: Session = Depends(get_db),
              user=Depends(require_role("teacher"))):
    if not _own_group(group_id, user.id, db):
        raise HTTPException(403)
    g = db.query(models.Group).get(group_id)
    test_ids = _test_ids_for_groups([group_id], db)
    tests = db.query(models.Test).filter(models.Test.id.in_(test_ids)).all() if test_ids else []

    per_test = []
    for t in tests:
        attempts = db.query(models.Attempt).filter_by(test_id=t.id).all()
        n = len(attempts)
        avg = round(sum(a.score for a in attempts) / n, 1) if n else 0
        pr = round(100 * sum(1 for a in attempts if a.passed) / n, 1) if n else 0
        per_test.append({"test": t.title, "avg_score": avg, "pass_rate": pr, "attempts": n})

    s_ids = [gs.user_id for gs in db.query(models.GroupStudent).filter_by(group_id=group_id).all()]
    per_student = []
    for s in (db.query(models.User).filter(models.User.id.in_(s_ids)).all() if s_ids else []):
        if test_ids:
            passed = (db.query(models.Attempt.test_id)
                      .filter(models.Attempt.user_id == s.id,
                              models.Attempt.test_id.in_(test_ids),
                              models.Attempt.passed.is_(True))
                      .distinct().count())
            my = db.query(models.Attempt).filter(
                models.Attempt.user_id == s.id,
                models.Attempt.test_id.in_(test_ids)).all()
            avg = round(sum(a.score for a in my) / len(my), 1) if my else 0
        else:
            passed = 0; avg = 0
        prog = round(100 * passed / len(test_ids)) if test_ids else 0
        per_student.append({"name": s.name, "progress": prog, "avg_score": avg,
                            "passed": passed, "total": len(test_ids)})

    timeline = []
    if test_ids:
        cutoff = datetime.utcnow() - timedelta(days=30)
        rows = (db.query(func.date(models.Attempt.created_at).label("d"),
                         func.count().label("n"),
                         func.avg(models.Attempt.score).label("avg"))
                .filter(models.Attempt.test_id.in_(test_ids),
                        models.Attempt.created_at >= cutoff)
                .group_by("d").order_by("d").all())
        timeline = [{"date": str(r.d), "attempts": r.n,
                     "avg_score": round(r.avg or 0, 1)} for r in rows]

    return {"per_test": per_test, "per_student": per_student, "timeline": timeline}


# ---------- CHAT ----------
@router.get("/themes/{theme_id}/chat")
def chat_list(theme_id: int, db: Session = Depends(get_db),
              user=Depends(require_role("teacher"))):
    theme = db.query(models.Theme).get(theme_id)
    if not theme: raise HTTPException(404)
    gids = _my_group_ids(user.id, db)
    my_courses = {db.query(models.Group).get(g).course_id for g in gids}
    if theme.course_id not in my_courses:
        raise HTTPException(403)
    rows = (db.query(models.ChatMessage, models.User.name, models.User.role)
            .join(models.User, models.User.id == models.ChatMessage.user_id)
            .filter(models.ChatMessage.theme_id == theme_id)
            .order_by(models.ChatMessage.created_at).all())
    return [{"id": m.id, "text": m.text, "created_at": m.created_at.isoformat(),
             "user_id": m.user_id, "user_name": name, "user_role": role,
             "is_mine": m.user_id == user.id}
            for m, name, role in rows]


@router.post("/themes/{theme_id}/chat")
def chat_send(theme_id: int, data: schemas.ChatIn,
              db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    from .notifications import notify
    theme = db.query(models.Theme).get(theme_id)
    if not theme: raise HTTPException(404)
    m = models.ChatMessage(theme_id=theme_id, user_id=user.id, text=data.text)
    db.add(m); db.flush()

    # уведомляем учеников всех групп этого курса, где есть этот преподаватель
    gids = _my_group_ids(user.id, db)
    target_groups = [g for g in gids if db.query(models.Group).get(g).course_id == theme.course_id]
    student_ids = []
    for gid in target_groups:
        student_ids += [gs.user_id for gs in
                        db.query(models.GroupStudent).filter_by(group_id=gid).all()]
    notify(db, student_ids, "chat",
           f"Новое сообщение в теме «{theme.title}»",
           body=data.text[:160],
           link=f"/student?course={theme.course_id}&theme={theme_id}")
    db.commit(); db.refresh(m)
    return {"id": m.id}
