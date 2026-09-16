from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import require_role

router = APIRouter()


@router.get("/courses")
def my_courses(db: Session = Depends(get_db), user=Depends(require_role("student"))):
    ids = [e.course_id for e in db.query(models.Enrollment).filter_by(user_id=user.id).all()]
    if not ids:
        return []
    return [{"id": c.id, "title": c.title, "description": c.description}
            for c in db.query(models.Course).filter(models.Course.id.in_(ids)).all()]


@router.get("/course/{course_id}/materials")
def my_materials(course_id: int, db: Session = Depends(get_db), user=Depends(require_role("student"))):
    if not db.query(models.Enrollment).filter_by(user_id=user.id, course_id=course_id).first():
        raise HTTPException(403, "Не записан на курс")

    materials = (db.query(models.Material).filter_by(course_id=course_id)
                 .order_by(models.Material.order_index, models.Material.id).all())

    out = []
    unlocked = True
    for m in materials:
        test = db.query(models.Test).filter_by(material_id=m.id).first()
        test_passed = False
        if test:
            test_passed = db.query(models.Attempt).filter_by(
                user_id=user.id, test_id=test.id, passed=True).first() is not None
        out.append({
            "id": m.id, "title": m.title, "type": m.type, "url": m.url,
            "order_index": m.order_index, "unlocked": unlocked,
            "test": ({"id": test.id, "title": test.title,
                      "passing_score": test.passing_score, "passed": test_passed}
                     if test else None),
        })
        unlocked = unlocked and (not test or test_passed)
    return out


@router.get("/test/{test_id}")
def get_test(test_id: int, db: Session = Depends(get_db), user=Depends(require_role("student"))):
    test = db.query(models.Test).get(test_id)
    if not test:
        raise HTTPException(404)
    if not db.query(models.Enrollment).filter_by(user_id=user.id, course_id=test.course_id).first():
        raise HTTPException(403)
    questions = db.query(models.Question).filter_by(test_id=test.id).all()
    return {
        "test": {"id": test.id, "title": test.title, "passing_score": test.passing_score},
        "questions": [{
            "id": q.id, "text": q.text,
            # ОТДАЁМ БЕЗ флага is_correct, чтобы не палить ответы
            "answers": [{"id": a.id, "text": a.text}
                        for a in db.query(models.Answer).filter_by(question_id=q.id).all()],
        } for q in questions],
    }


@router.post("/test/{test_id}/submit")
def submit_test(test_id: int, data: schemas.SubmitIn,
                db: Session = Depends(get_db), user=Depends(require_role("student"))):
    test = db.query(models.Test).get(test_id)
    if not test:
        raise HTTPException(404)
    if not db.query(models.Enrollment).filter_by(user_id=user.id, course_id=test.course_id).first():
        raise HTTPException(403)

    questions = db.query(models.Question).filter_by(test_id=test.id).all()
    correct = 0
    for q in questions:
        right = db.query(models.Answer).filter_by(question_id=q.id, is_correct=True).first()
        if right and data.answers.get(q.id) == right.id:
            correct += 1

    total = len(questions) or 1
    score = round(100 * correct / total)
    passed = score >= test.passing_score

    db.add(models.Attempt(user_id=user.id, test_id=test.id, score=score, passed=passed))
    db.commit()
    return {"score": score, "passed": passed, "correct": correct, "total": total,
            "passing_score": test.passing_score}


@router.get("/history")
def my_history(db: Session = Depends(get_db), user=Depends(require_role("student"))):
    rows = (db.query(models.Attempt, models.Test.title, models.Course.title)
            .join(models.Test, models.Test.id == models.Attempt.test_id)
            .join(models.Course, models.Course.id == models.Test.course_id)
            .filter(models.Attempt.user_id == user.id)
            .order_by(models.Attempt.created_at.desc()).limit(100).all())
    return [{"id": a.id, "test": t, "course": c, "score": a.score,
             "passed": a.passed, "created_at": a.created_at.isoformat()}
            for a, t, c in rows]