from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime


# --- auth ---
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


# --- admin ---
class UserIn(BaseModel):
    role: str
    username: str
    password: str
    name: str


class CourseIn(BaseModel):
    title: str
    description: str = ""


class MaterialIn(BaseModel):
    course_id: int
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
    answers: List[AnswerIn]      # ровно 4, один is_correct=true


class TestIn(BaseModel):
    course_id: int
    material_id: int
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


# --- student ---
class SubmitIn(BaseModel):
    answers: Dict[int, int]      # question_id -> answer_id