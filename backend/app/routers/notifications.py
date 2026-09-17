from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter()


def notify(db, user_ids, type, title, body="", link=""):
    """Создаёт уведомления для списка пользователей (без повторов)."""
    seen = set()
    for uid in user_ids:
        if uid is None or uid in seen:
            continue
        seen.add(uid)
        db.add(models.Notification(user_id=uid, type=type, title=title,
                                    body=body, link=link))


@router.get("")
def list_notifications(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = (db.query(models.Notification).filter_by(user_id=user.id)
            .order_by(models.Notification.created_at.desc()).limit(50).all())
    return [{"id": n.id, "type": n.type, "title": n.title, "body": n.body,
             "link": n.link, "read": n.read_at is not None,
             "created_at": n.created_at.isoformat()} for n in rows]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user=Depends(get_current_user)):
    n = (db.query(models.Notification).filter_by(user_id=user.id)
         .filter(models.Notification.read_at.is_(None)).count())
    return {"count": n}


@router.post("/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db),
              user=Depends(get_current_user)):
    n = db.query(models.Notification).get(notif_id)
    if not n or n.user_id != user.id: raise HTTPException(404)
    if not n.read_at:
        n.read_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.query(models.Notification).filter_by(user_id=user.id)\
        .filter(models.Notification.read_at.is_(None))\
        .update({models.Notification.read_at: datetime.utcnow()})
    db.commit()
    return {"ok": True}
