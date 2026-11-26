from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class LearningPathBase(BaseModel):
    title: str
    description: str | None = None
    short_description: str | None = None
    category: str
    level: str
    price: float = 0
    currency: str = "USD"
    duration_weeks: int | None = None
    is_bestseller: bool = False
    courses: list[str] = []
    skills: list[str] = []


class LearningPathCreate(LearningPathBase):
    slug: str


class LearningPathResponse(LearningPathBase):
    id: UUID
    slug: str
    course_count: int
    enrolled_count: int
    is_published: bool
    thumbnail: str | None = None
    color: str | None = None
    icon_color: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LearningPathListResponse(BaseModel):
    paths: list[LearningPathResponse]
    total: int
    page: int
    pages: int
