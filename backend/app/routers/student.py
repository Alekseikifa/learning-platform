from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role

router = APIRouter()


def _my_course_ids(user_id, db):
    gids = [gs.group_id for gs in db.query(models.GroupStudent).filter_by(user_id=user_id).all()]
    if not gids: return []
    return list({db.query(models.Group).get(g).course_id for g in gids})


def _in_course(user_id, course_id, db):
    gids = [gs.group_id for gs in db.query(models.GroupStudent).filter_by(user_id=user_id).all()]
    if not gids: return False
    return any(db.query(models.Group).get(g).course_id == course_id for g in gids)


@router.get("/courses")
def my_courses(db: Session = Depends(get_db), user=Depends(require_role("student"))):
    cids = _my_course_ids(user.id, db)
    if not cids: return []
    return [{"id": c.id, "title": c.title, "description": c.description}
            for c in db.query(models.Course).filter(models.Course.id.in_(cids)).all()]


@router.get("/course/{course_id}/themes")
def my_themes(course_id: int, db: Session = Depends(get_db),
              user=Depends(require_role("student"))):
    if not _in_course(user.id, course_id, db):
        raise HTTPException(403)

    themes = (db.query(models.Theme).filter_by(course_id=course_id)
              .order_by(models.Theme.order_index, models.Theme.id).all())
    out = []
    unlocked = True
    for th in themes:
        materials = (db.query(models.Material).filter_by(theme_id=th.id)
                     .order_by(models.Material.order_index, models.Material.id).all())
        test = db.query(models.Test).filter_by(theme_id=th.id).first()
        test_passed = False
        attempts_used = 0
        if test:
            attempts = db.query(models.Attempt).filter_by(user_id=user.id, test_id=test.id).all()
            attempts_used = len(attempts)
            test_passed = any(a.passed for a in attempts)
        max_att = test.max_attempts if test else 0
        attempts_left = None if (not test or max_att == 0) else max(0, max_att - attempts_used)
        out.append({
            "id": th.id, "title": th.title, "order_index": th.order_index,
            "unlocked": unlocked,
            "materials": [{"id": m.id, "title": m.title, "type": m.type,
                           "url": m.url, "order_index": m.order_index} for m in materials],
            "test": ({"id": test.id, "title": test.title,
                      "passing_score": test.passing_score,
                      "max_attempts": max_att,
                      "attempts_used": attempts_used,
                      "attempts_left": attempts_left,
                      "passed": test_passed} if test else None),
        })
        unlocked = unlocked and (not test or test_passed)
    return out


@router.get("/test/{test_id}")
def get_test(test_id: int, db: Session = Depends(get_db),
             user=Depends(require_role("student"))):
    test = db.query(models.Test).get(test_id)
    if not test: raise HTTPException(404)
    theme = db.query(models.Theme).get(test.theme_id)
    if not theme or not _in_course(user.id, theme.course_id, db):
        raise HTTPException(403)
    if test.max_attempts:
        used = db.query(models.Attempt).filter_by(user_id=user.id, test_id=test.id).count()
        if used >= test.max_attempts:
            raise HTTPException(400, "Лимит попыток исчерпан")
    questions = db.query(models.Question).filter_by(test_id=test.id).all()
    return {
        "test": {"id": test.id, "title": test.title,
                 "passing_score": test.passing_score},
        "questions": [{
            "id": q.id, "text": q.text,
            "answers": [{"id": a.id, "text": a.text}
                        for a in db.query(models.Answer).filter_by(question_id=q.id).all()],
        } for q in questions],
    }


@router.post("/test/{test_id}/submit")
def submit_test(test_id: int, data: schemas.SubmitIn,
                db: Session = Depends(get_db), user=Depends(require_role("student"))):
    test = db.query(models.Test).get(test_id)
    if not test: raise HTTPException(404)
    theme = db.query(models.Theme).get(test.theme_id)
    if not theme or not _in_course(user.id, theme.course_id, db):
        raise HTTPException(403)
    if test.max_attempts:
        used = db.query(models.Attempt).filter_by(user_id=user.id, test_id=test.id).count()
        if used >= test.max_attempts:
            raise HTTPException(400, "Лимит попыток исчерпан")

    questions = db.query(models.Question).filter_by(test_id=test.id).all()
    correct = 0
    aa_rows = []
    for q in questions:
        right = db.query(models.Answer).filter_by(question_id=q.id, is_correct=True).first()
        chosen = data.answers.get(q.id)
        is_correct = bool(right and chosen == right.id)
        if is_correct: correct += 1
        aa_rows.append((q.id, chosen, is_correct))

    total = len(questions) or 1
    score = round(100 * correct / total)
    passed = score >= test.passing_score

    a = models.Attempt(user_id=user.id, test_id=test.id, score=score, passed=passed)
    db.add(a); db.flush()
    for qid, chosen, ok in aa_rows:
        db.add(models.AttemptAnswer(attempt_id=a.id, question_id=qid,
                                     answer_id=chosen, is_correct=ok))

    # уведомляем кураторов групп ученика
    from .notifications import notify
    gids = [gs.group_id for gs in db.query(models.GroupStudent).filter_by(user_id=user.id).all()]
    teacher_ids = []
    for gid in gids:
        teacher_ids += [gt.teacher_id for gt in
                        db.query(models.GroupTeacher).filter_by(group_id=gid).all()]
    notify(db, teacher_ids, "attempt",
           f"{user.name}: тест «{test.title}» — {score}%",
           body="сдан" if passed else "не сдан",
           link="/teacher?tab=attempts")
    db.commit()
    return {"attempt_id": a.id, "score": score, "passed": passed,
            "correct": correct, "total": total,
            "passing_score": test.passing_score}


@router.get("/attempts/{attempt_id}/details")
def my_attempt_details(attempt_id: int, db: Session = Depends(get_db),
                       user=Depends(require_role("student"))):
    a = db.query(models.Attempt).get(attempt_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404)
    questions = db.query(models.Question).filter_by(test_id=a.test_id).all()
    aa_rows = {x.question_id: x for x in db.query(models.AttemptAnswer)
               .filter_by(attempt_id=a.id).all()}
    test = db.query(models.Test).get(a.test_id)
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
    return {"attempt_id": a.id, "score": a.score, "passed": a.passed,
            "created_at": a.created_at.isoformat(), "test_title": test.title,
            "questions": out}


@router.get("/history")
def my_history(db: Session = Depends(get_db), user=Depends(require_role("student"))):
    rows = (db.query(models.Attempt, models.Test.title)
            .join(models.Test, models.Test.id == models.Attempt.test_id)
            .filter(models.Attempt.user_id == user.id)
            .order_by(models.Attempt.created_at.desc()).limit(100).all())
    return [{"id": a.id, "test": t, "score": a.score, "passed": a.passed,
             "created_at": a.created_at.isoformat()} for a, t in rows]


# ---------- ANNOUNCEMENTS ----------
@router.get("/announcements")
def my_announcements(db: Session = Depends(get_db), user=Depends(require_role("student"))):
    gids = [gs.group_id for gs in db.query(models.GroupStudent).filter_by(user_id=user.id).all()]
    if not gids: return []
    ann_ids = {at.announcement_id for at in db.query(models.AnnouncementTarget)
               .filter(models.AnnouncementTarget.group_id.in_(gids)).all()}
    if not ann_ids: return []
    rows = (db.query(models.Announcement, models.User.name)
            .join(models.User, models.User.id == models.Announcement.author_id)
            .filter(models.Announcement.id.in_(ann_ids))
            .order_by(models.Announcement.created_at.desc()).all())
    out = []
    for a, author in rows:
        target_names = []
        for at in db.query(models.AnnouncementTarget).filter_by(announcement_id=a.id).all():
            if at.group_id in gids:
                g = db.query(models.Group).get(at.group_id)
                if g: target_names.append(g.name)
        out.append({"id": a.id, "title": a.title, "body": a.body,
                    "author": author,
                    "created_at": a.created_at.isoformat(),
                    "updated_at": a.updated_at.isoformat(),
                    "groups": target_names})
    return out


# ---------- CHAT ----------
@router.get("/themes/{theme_id}/chat")
def chat_list(theme_id: int, db: Session = Depends(get_db),
              user=Depends(require_role("student"))):
    theme = db.query(models.Theme).get(theme_id)
    if not theme: raise HTTPException(404)
    if not _in_course(user.id, theme.course_id, db):
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
              db: Session = Depends(get_db), user=Depends(require_role("student"))):
    from .notifications import notify
    theme = db.query(models.Theme).get(theme_id)
    if not theme: raise HTTPException(404)
    if not _in_course(user.id, theme.course_id, db):
        raise HTTPException(403)
    m = models.ChatMessage(theme_id=theme_id, user_id=user.id, text=data.text)
    db.add(m); db.flush()

    gids = [gs.group_id for gs in db.query(models.GroupStudent).filter_by(user_id=user.id).all()]
    gids = [g for g in gids if db.query(models.Group).get(g).course_id == theme.course_id]
    teacher_ids = []
    for gid in gids:
        teacher_ids += [gt.teacher_id for gt in
                        db.query(models.GroupTeacher).filter_by(group_id=gid).all()]
    notify(db, teacher_ids, "chat",
           f"Новое сообщение от {user.name} в «{theme.title}»",
           body=data.text[:160], link=f"/teacher?theme={theme_id}")
    db.commit(); db.refresh(m)
    return {"id": m.id}
