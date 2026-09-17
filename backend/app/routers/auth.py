from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..auth import (verify_password, create_token, get_current_user,
                    hash_password, all_roles_of, get_current_payload)

router = APIRouter()


def _normalize_phone(raw: str) -> str:
    """Оставляет только цифры и ведущий +. Пример: '+7 (926) 123-45-67' → '+79261234567'."""
    raw = (raw or "").strip()
    if not raw:
        return ""
    plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    return ("+" if plus else "") + digits


@router.post("/login", response_model=schemas.TokenOut)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(username=data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "Неверный логин или пароль")
    roles = all_roles_of(user)
    return {
        "access_token": create_token(user.id, user.role, roles),
        "role": user.role,
        "roles": roles,
        "name": user.name,
    }


@router.get("/check-phone")
def check_phone(phone: str, db: Session = Depends(get_db)):
    """Проверяет: телефон есть в списке приглашений и ещё не занят."""
    p = _normalize_phone(phone)
    if not p:
        raise HTTPException(400, "Введите номер телефона")
    used = db.query(models.User).filter_by(username=p).first()
    if used:
        return {"available": False, "reason": "already_registered"}
    invite = db.query(models.PhoneInvite).filter_by(phone=p).first()
    if not invite:
        return {"available": False, "reason": "no_invite"}
    return {"available": True, "role": invite.role}


@router.post("/register", response_model=schemas.TokenOut)
def register(data: schemas.RegisterIn, db: Session = Depends(get_db)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Введите ФИО")
    if data.password != data.password_confirm:
        raise HTTPException(400, "Пароли не совпадают")
    if len(data.password) < 4:
        raise HTTPException(400, "Пароль слишком короткий")

    phone = _normalize_phone(data.phone)
    if not phone:
        raise HTTPException(400, "Введите номер телефона")

    if db.query(models.User).filter_by(username=phone).first():
        raise HTTPException(400, "Этот номер уже зарегистрирован")

    invite = db.query(models.PhoneInvite).filter_by(phone=phone).first()
    if not invite:
        raise HTTPException(400, "Номер не найден в списке приглашений. Обратитесь к администратору.")

    user = models.User(
        role=invite.role,
        username=phone,
        password_hash=hash_password(data.password),
        name=name,
    )
    db.add(user)
    db.delete(invite)
    db.commit()
    db.refresh(user)
    return {
        "access_token": create_token(user.id, user.role),
        "role": user.role,
        "name": user.name,
    }


@router.get("/me")
def me(user: models.User = Depends(get_current_user),
       payload: dict = Depends(get_current_payload)):
    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": payload.get("role", user.role),   # активная роль
        "extra_roles": user.extra_roles or "",
    }


@router.post("/switch-role", response_model=schemas.TokenOut)
def switch_role(data: schemas.SwitchRoleIn,
                user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    roles = all_roles_of(user)
    if data.role not in roles:
        raise HTTPException(403, "Роль недоступна")
    return {
        "access_token": create_token(user.id, data.role, roles),
        "role": data.role,
        "roles": roles,
        "name": user.name,
    }
