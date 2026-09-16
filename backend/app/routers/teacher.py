from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..auth import require_role

router = APIRouter()


def _own_course(course_id: int, teacher_id: int, db: Session) -> bool:
    return db.query(models.CourseTeacher).filter_by(
        course_id=course_id, teacher_id=teacher_id).first() is not None


@router.get("/courses")
def my_courses(db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    ids = [ct.course_id for ct in db.query(models.CourseTeacher).filter_by(teacher_id=user.id).all()]
    if not ids:
        return []
    return [{"id": c.id, "title": c.title, "description": c.description}
            for c in db.query(models.Course).filter(models.Course.id.in_(ids)).all()]


@router.get("/course/{course_id}/students")
def course_students(course_id: int, db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    if not _own_course(course_id, user.id, db):
        raise HTTPException(403)

    tests = db.query(models.Test).filter_by(course_id=course_id).all()
    test_ids = [t.id for t in tests]

    enrolled = (db.query(models.User)
                .join(models.Enrollment, models.Enrollment.user_id == models.User.id)
                .filter(models.Enrollment.course_id == course_id).all())

    out = []
    for s in enrolled:
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
        out.append({
            "id": s.id, "name": s.name, "username": s.username,
            "progress": progress, "passed_tests": passed, "total_tests": len(test_ids),
            "last_activity": last.isoformat() if last else None,
        })
    return out


@router.get("/course/{course_id}/attempts")
def course_attempts(course_id: int, db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    if not _own_course(course_id, user.id, db):
        raise HTTPException(403)
    rows = (db.query(models.Attempt, models.User.name, models.Test.title)
            .join(models.User, models.User.id == models.Attempt.user_id)
            .join(models.Test, models.Test.id == models.Attempt.test_id)
            .filter(models.Test.course_id == course_id)
            .order_by(models.Attempt.created_at.desc()).limit(300).all())
    return [{"id": a.id, "student": name, "test": title, "score": a.score,
             "passed": a.passed, "created_at": a.created_at.isoformat()}
            for a, name, title in rows]


@router.get("/course/{course_id}/analytics")
def analytics(course_id: int, db: Session = Depends(get_db), user=Depends(require_role("teacher"))):
    if not _own_course(course_id, user.id, db):
        raise HTTPException(403)

    tests = db.query(models.Test).filter_by(course_id=course_id).all()
    test_ids = [t.id for t in tests]

    # --- per test ---
    per_test = []
    for t in tests:
        attempts = db.query(models.Attempt).filter_by(test_id=t.id).all()
        n = len(attempts)
        avg = round(sum(a.score for a in attempts) / n, 1) if n else 0
        pass_rate = round(100 * sum(1 for a in attempts if a.passed) / n, 1) if n else 0
        per_test.append({"test": t.title, "avg_score": avg, "pass_rate": pass_rate, "attempts": n})

    # --- per student ---
    enrolled = (db.query(models.User)
                .join(models.Enrollment, models.Enrollment.user_id == models.User.id)
                .filter(models.Enrollment.course_id == course_id).all())
    per_student = []
    for s in enrolled:
        if test_ids:
            passed = (db.query(models.Attempt.test_id)
                      .filter(models.Attempt.user_id == s.id,
                              models.Attempt.test_id.in_(test_ids),
                              models.Attempt.passed.is_(True))
                      .distinct().count())
            my_attempts = db.query(models.Attempt).filter(
                models.Attempt.user_id == s.id,
                models.Attempt.test_id.in_(test_ids)).all()
            avg = round(sum(a.score for a in my_attempts) / len(my_attempts), 1) if my_attempts else 0
        else:
            passed = 0; avg = 0
        progress = round(100 * passed / len(test_ids)) if test_ids else 0
        per_student.append({"name": s.name, "progress": progress, "avg_score": avg,
                            "passed": passed, "total": len(test_ids)})

    # --- timeline (last 30 days) ---
    cutoff = datetime.utcnow() - timedelta(days=30)
    rows = (db.query(func.date(models.Attempt.created_at).label("d"),
                     func.count().label("n"),
                     func.avg(models.Attempt.score).label("avg"))
            .join(models.Test, models.Test.id == models.Attempt.test_id)
            .filter(models.Test.course_id == course_id, models.Attempt.created_at >= cutoff)
            .group_by("d").order_by("d").all())
    timeline = [{"date": str(r.d), "attempts": r.n, "avg_score": round(r.avg or 0, 1)} for r in rows]

    return {"per_test": per_test, "per_student": per_student, "timeline": timeline}