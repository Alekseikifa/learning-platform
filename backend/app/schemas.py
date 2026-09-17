from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    name: str
    phone: str
    password: str
    password_confirm: str


class PhoneInviteIn(BaseModel):
    phone: str
    role: str
    note: str = ""


class PhoneInviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    phone: str
    role: str
    note: str
    created_at: datetime

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    extra_roles: str = ""
    username: str
    name: str


class UserIn(BaseModel):
    role: str
    extra_roles: str = ""
    username: str
    password: str
    name: str


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    extra_roles: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    roles: List[str] = []
    name: str


class PasswordResetIn(BaseModel):
    password: str


class AdminCredsIn(BaseModel):
    username: str
    password: str
    old_password: str


class RoleNamesIn(BaseModel):
    admin: str
    teacher: str
    student: str


class CourseIn(BaseModel):
    title: str
    description: str = ""


class GroupIn(BaseModel):
    course_id: int
    name: str


class GroupUpdateIn(BaseModel):
    name: str


class ThemeIn(BaseModel):
    course_id: int
    title: str
    order_index: int = 0


class ThemeUpdateIn(BaseModel):
    title: Optional[str] = None
    order_index: Optional[int] = None


class MaterialIn(BaseModel):
    theme_id: int
    title: str
    type: str
    url: str
    order_index: int = 0


class MaterialUpdateIn(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    order_index: Optional[int] = None


class AnswerIn(BaseModel):
    text: str
    is_correct: bool


class QuestionIn(BaseModel):
    test_id: int
    text: str
    answers: List[AnswerIn]


class QuestionUpdateIn(BaseModel):
    text: Optional[str] = None
    answers: Optional[List[AnswerIn]] = None


class TestIn(BaseModel):
    theme_id: int
    title: str
    passing_score: int = 70
    max_attempts: int = 0


class TestUpdateIn(BaseModel):
    title: Optional[str] = None
    passing_score: Optional[int] = None
    max_attempts: Optional[int] = None


class EnrollIn(BaseModel):
    user_id: int
    course_id: int


class GroupMemberIn(BaseModel):
    user_id: int


class TeacherAssignIn(BaseModel):
    teacher_id: int


class AnnouncementIn(BaseModel):
    title: str
    body: str
    group_ids: List[int]


class AnnouncementUpdateIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    group_ids: Optional[List[int]] = None


class ChatIn(BaseModel):
    text: str


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    original_name: Optional[str] = None
    mimetype: Optional[str] = None
    size: Optional[int] = None
    uploaded_at: datetime


class SubmitIn(BaseModel):
    answers: Dict[int, int]


class SwitchRoleIn(BaseModel):
    role: str
