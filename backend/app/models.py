from datetime import datetime
from sqlalchemy import (Column, Integer, String, ForeignKey, Boolean,
                        DateTime, Text)
from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    role = Column(String, nullable=False)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")


class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    name = Column(String, nullable=False)


class GroupTeacher(Base):
    __tablename__ = "group_teachers"
    group_id = Column(Integer, ForeignKey("groups.id"), primary_key=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), primary_key=True)


class GroupStudent(Base):
    __tablename__ = "group_students"
    group_id = Column(Integer, ForeignKey("groups.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)


class Theme(Base):
    __tablename__ = "themes"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title = Column(String, nullable=False)
    order_index = Column(Integer, default=0)


class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True)
    theme_id = Column(Integer, ForeignKey("themes.id"), nullable=False)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)
    url = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)


class Test(Base):
    __tablename__ = "tests"
    id = Column(Integer, primary_key=True)
    theme_id = Column(Integer, ForeignKey("themes.id"), unique=True, nullable=False)
    title = Column(String, nullable=False)
    passing_score = Column(Integer, default=70)
    max_attempts = Column(Integer, default=0)


class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    text = Column(Text, nullable=False)


class Answer(Base):
    __tablename__ = "answers"
    id = Column(Integer, primary_key=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    text = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False)


class Attempt(Base):
    __tablename__ = "attempts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    score = Column(Integer, nullable=False)
    passed = Column(Boolean, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"
    id = Column(Integer, primary_key=True)
    attempt_id = Column(Integer, ForeignKey("attempts.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    answer_id = Column(Integer, ForeignKey("answers.id"), nullable=True)
    is_correct = Column(Boolean, default=False)


class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AnnouncementTarget(Base):
    __tablename__ = "announcement_targets"
    announcement_id = Column(Integer, ForeignKey("announcements.id"), primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id"), primary_key=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    theme_id = Column(Integer, ForeignKey("themes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    original_name = Column(String)
    mimetype = Column(String)
    size = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


class PhoneInvite(Base):
    __tablename__ = "phone_invites"
    id = Column(Integer, primary_key=True)
    phone = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False)
    note = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
