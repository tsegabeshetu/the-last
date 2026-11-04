"""Request/response models with the validation the public portal needs."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-()]{7,17}$")
PHOTO_DATA_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$")
PaymentMethod = Literal["telebirr", "cbe", "paypal", "mastercard"]


def clean_phone(value: str) -> str:
    value = (value or "").strip()
    if not PHONE_RE.match(value):
        raise ValueError("Enter a reachable phone number, for example +251 91 234 5678")
    digits = re.sub(r"\D", "", value)
    if len(digits) < 9:
        raise ValueError("Phone number is too short")
    return value


def clean_text(value: str, *, max_length: int = 1200) -> str:
    value = re.sub(r"\s+", " ", (value or "")).strip()
    if len(value) > max_length:
        raise ValueError(f"Keep this under {max_length} characters")
    return value


def clean_photo(value: str | None) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) > 2_800_000:
        raise ValueError("Photo must be smaller than 2 MB after compression")
    if not PHOTO_DATA_RE.match(value):
        raise ValueError("Choose a JPG, PNG or WebP photo")
    return value


class IncidentCreate(BaseModel):
    category: Literal["critical", "infrastructure", "community"]
    title: str = Field(min_length=4, max_length=140)
    description: str = Field(default="", max_length=2000)
    location_name: str = Field(min_length=2, max_length=160)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    reporter_name: str | None = Field(default=None, max_length=120)
    reporter_phone: str | None = None

    @field_validator("title", "description", "location_name")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=2000)

    @field_validator("reporter_phone")
    @classmethod
    def phone(cls, value: str | None) -> str | None:
        return clean_phone(value) if value else None


class SosCreate(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    location_name: str = Field(default="Location not shared", max_length=200)
    message: str = Field(default="", max_length=600)


class RentalCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    pickup_location: str = Field(min_length=2, max_length=200)
    pickup_lat: float | None = Field(default=None, ge=-90, le=90)
    pickup_lng: float | None = Field(default=None, ge=-180, le=180)
    pickup_date: str = Field(min_length=4, max_length=40)
    days: int = Field(ge=1, le=30)
    needs_driver: bool = False
    notes: str = Field(default="", max_length=600)
    payment_method: PaymentMethod = "telebirr"
    payment_reference: str = Field(default="", max_length=80)

    @field_validator("full_name", "pickup_location", "notes", "payment_reference")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=600)

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)


class DeliveryItem(BaseModel):
    medication_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=20)


class DeliveryCreate(BaseModel):
    pharmacy_id: int = Field(gt=0)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    city: str = Field(min_length=2, max_length=80)
    address: str = Field(min_length=5, max_length=300)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    items: list[DeliveryItem] = Field(min_length=1, max_length=10)
    prescription_ref: str = Field(default="", max_length=80)
    priority: Literal["standard", "urgent"] = "standard"
    notes: str = Field(default="", max_length=600)
    payment_method: PaymentMethod = "telebirr"
    payment_reference: str = Field(default="", max_length=80)

    @field_validator("full_name", "city", "address", "notes", "prescription_ref", "payment_reference")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=600)

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)


class MissingPersonCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    gender: Literal["female", "male", "unknown"] = "unknown"
    last_seen_location: str = Field(min_length=2, max_length=200)
    last_seen_lat: float | None = Field(default=None, ge=-90, le=90)
    last_seen_lng: float | None = Field(default=None, ge=-180, le=180)
    last_seen_at: str = Field(min_length=4, max_length=60)
    photo_data: str = Field(default="", max_length=2_800_000)
    description: str = Field(min_length=20, max_length=1200)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str
    consent: bool

    @field_validator("full_name", "last_seen_location", "description", "contact_name")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=1200)

    @field_validator("photo_data")
    @classmethod
    def photo(cls, value: str | None) -> str:
        return clean_photo(value)

    @field_validator("contact_phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)

    @field_validator("consent")
    @classmethod
    def must_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Consent from the reporting family member is required")
        return value


class NewsCreate(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    summary: str = Field(min_length=10, max_length=280)
    body: str = Field(min_length=40, max_length=6000)
    category: Literal["Preparedness", "Safety", "Health", "Missing persons", "Traffic", "Utilities"] = "Preparedness"
    author: str = Field(min_length=2, max_length=120)

    @field_validator("title", "summary", "body", "author")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=6000)


class AssistantTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    language: Literal["en", "am"] = "en"
    session_id: str = Field(default="anonymous", max_length=80)
    history: list[AssistantTurn] = Field(default_factory=list, max_length=12)

    @field_validator("message")
    @classmethod
    def tidy(cls, value: str) -> str:
        return clean_text(value, max_length=1000)
