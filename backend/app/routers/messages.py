from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter()


@router.get("/users")
def list_chattable_users(db: Session = Depends(get_db),
                         user: models.User = Depends(get_current_user)):
    """Все пользователи, кроме себя, сгруппированные по роли."""
    rows = (db.query(models.User)
            .filter(models.User.id != user.id)
            .order_by(models.User.role, models.User.name).all())
    return [{"id": u.id, "name": u.name, "role": u.role,
             "username": u.username} for u in rows]


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db),
                       user: models.User = Depends(get_current_user)):
    """Список диалогов: последнее сообщение + количество непрочитанных."""
    # находим всех, с кем есть переписка
    other_ids = set()
    rows = (db.query(models.DirectMessage)
            .filter(or_(models.DirectMessage.sender_id == user.id,
                        models.DirectMessage.recipient_id == user.id))
            .all())
    for m in rows:
        other_ids.add(m.recipient_id if m.sender_id == user.id else m.sender_id)

    out = []
    for oid in other_ids:
        other = db.query(models.User).get(oid)
        if not other:
            continue
        last = (db.query(models.DirectMessage)
                .filter(or_(
                    and_(models.DirectMessage.sender_id == user.id,
                         models.DirectMessage.recipient_id == oid),
                    and_(models.DirectMessage.sender_id == oid,
                         models.DirectMessage.recipient_id == user.id)))
                .order_by(models.DirectMessage.created_at.desc()).first())
        unread = (db.query(models.DirectMessage)
                  .filter_by(sender_id=oid, recipient_id=user.id)
                  .filter(models.DirectMessage.read_at.is_(None))
                  .count())
        out.append({
            "user_id": other.id,
            "name": other.name,
            "role": other.role,
            "last_text": last.text if last else "",
            "last_at": last.created_at.isoformat() if last else None,
            "unread": unread,
        })
    out.sort(key=lambda x: x["last_at"] or "", reverse=True)
    return out


@router.get("/unread-count")
def messages_unread_count(db: Session = Depends(get_db),
                          user: models.User = Depends(get_current_user)):
    n = (db.query(models.DirectMessage)
         .filter_by(recipient_id=user.id)
         .filter(models.DirectMessage.read_at.is_(None))
         .count())
    return {"count": n}


@router.get("/with/{other_id}")
def get_conversation(other_id: int, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    other = db.query(models.User).get(other_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    rows = (db.query(models.DirectMessage)
            .filter(or_(
                and_(models.DirectMessage.sender_id == user.id,
                     models.DirectMessage.recipient_id == other_id),
                and_(models.DirectMessage.sender_id == other_id,
                     models.DirectMessage.recipient_id == user.id)))
            .order_by(models.DirectMessage.created_at).all())

    # пометить входящие как прочитанные
    now = datetime.utcnow()
    for m in rows:
        if m.recipient_id == user.id and m.read_at is None:
            m.read_at = now
    db.commit()

    return {
        "other": {"id": other.id, "name": other.name, "role": other.role},
        "messages": [{
            "id": m.id, "text": m.text,
            "created_at": m.created_at.isoformat(),
            "is_mine": m.sender_id == user.id,
        } for m in rows],
    }


@router.post("/with/{other_id}")
def send_message(other_id: int, data: schemas.ChatIn,
                 db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    from .notifications import notify
    other = db.query(models.User).get(other_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")

    m = models.DirectMessage(sender_id=user.id, recipient_id=other_id, text=text)
    db.add(m); db.flush()

    # Определяем панель получателя по его роли и формируем абсолютную ссылку
    role_path = {
        "admin":   "/admin",
        "manager": "/manager",
        "teacher": "/teacher",
        "student": "/student",
    }.get(other.role, "/student")
    link = f"{role_path}?tab=messages&user={user.id}"

    notify(db, [other_id], "dm",
           f"Сообщение от {user.name}",
           body=text[:160],
           link=link)
    db.commit(); db.refresh(m)
    return {"id": m.id}
