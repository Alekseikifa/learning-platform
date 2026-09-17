import os
from datetime import datetime, timedelta
import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from . import models

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "1440"))

security = HTTPBearer()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def all_roles_of(user: models.User) -> list[str]:
    """Возвращает список всех ролей пользователя: основная + дополнительные."""
    roles = [user.role]
    if user.extra_roles:
        for r in user.extra_roles.split(","):
            r = r.strip()
            if r and r not in roles:
                roles.append(r)
    return roles


def create_token(user_id: int, active_role: str, all_roles: list[str]) -> str:
    payload = {
        "sub": str(user_id),
        "role": active_role,     # активная роль в этой сессии
        "roles": all_roles,       # все доступные роли
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode(creds: HTTPAuthorizationCredentials) -> dict:
    try:
        return jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(401, "Невалидный токен")


def get_current_payload(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    return _decode(creds)


def get_current_user(
    payload: dict = Depends(get_current_payload),
    db: Session = Depends(get_db),
) -> models.User:
    try:
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(401, "Невалидный токен")
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


def require_role(*roles: str):
    """Проверяет АКТИВНУЮ роль из токена (а не основную user.role)."""
    def dep(payload: dict = Depends(get_current_payload),
            db: Session = Depends(get_db)) -> models.User:
        user = db.query(models.User).get(int(payload["sub"]))
        if not user:
            raise HTTPException(401, "Пользователь не найден")
        active = payload.get("role", user.role)
        # роль должна быть среди доступных ролей пользователя
        available = all_roles_of(user)
        if active not in available:
            raise HTTPException(403, "Роль недоступна")
        if active not in roles:
            raise HTTPException(403, "Доступ запрещён")
        return user
    return dep
