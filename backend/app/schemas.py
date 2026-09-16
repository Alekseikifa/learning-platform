from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    username: str
    name: str


class UserIn(BaseModel):
    role: str
    username: str
    password: str
    name: str


class PasswordResetIn(BaseModel):
    password: str


class RoleNamesIn(BaseModel):
    admin: str
    teacher: str
    student: str


class CourseIn(BaseModel):
    title: str
    description: str = ""


class ThemeIn(BaseModel):
    course_id: int
    title: str
    order_index: int = 0


class MaterialIn(BaseModel):
    theme_id: int
    title: str
    type: str
    url: str
    order_index: int = 0


class AnswerIn(BaseModel):
    text: str
    is_correct: bool


class QuestionIn(BaseModel):
    test_id: int
    text: str
    answers: List[AnswerIn]


class TestIn(BaseModel):
    theme_id: int
    title: str
    passing_score: int = 70


class EnrollIn(BaseModel):
    user_id: int
    course_id: int


class TeacherAssignIn(BaseModel):
    teacher_id: int


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