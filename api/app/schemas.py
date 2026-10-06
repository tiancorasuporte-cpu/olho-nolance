from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Role = Literal["superadmin", "admin", "operator", "player"]
CameraStatus = Literal["idle", "streaming", "error"]
ClipStatus = Literal["processing", "ready", "failed"]
ClipSource = Literal["web", "api", "button"]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    name: str
    role: Role
    active: bool
    venue_ids: list[int] = []


class LoginIn(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4)
    name: str
    role: Role = "operator"
    venue_ids: list[int] = []
    active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Role] = None
    venue_ids: Optional[list[int]] = None
    active: Optional[bool] = None


class VenueCreate(BaseModel):
    name: str
    city: Optional[str] = None
    description: Optional[str] = None
    active: bool = True


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class VenueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    city: Optional[str] = None
    description: Optional[str]
    active: bool
    created_at: datetime


class CameraCreate(BaseModel):
    venue_id: int
    name: str
    rtsp_url: str
    buffer_seconds: int = 30
    active: bool = True
    start_stream: bool = True


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    buffer_seconds: Optional[int] = None
    active: Optional[bool] = None
    status: Optional[CameraStatus] = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    name: str
    rtsp_url: str
    status: str
    buffer_seconds: int
    active: bool
    created_at: datetime
    live_url: Optional[str] = None


class ClipCreate(BaseModel):
    camera_id: int
    source: ClipSource = "web"


class ClipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    camera_id: int
    venue_id: int
    triggered_by_user_id: Optional[int]
    triggered_by_device_id: Optional[int]
    source: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    duration_sec: int
    file_path: Optional[str]
    status: str
    error_message: Optional[str]
    created_at: datetime
    download_url: Optional[str] = None
    camera_name: Optional[str] = None
    venue_name: Optional[str] = None


class ClipStatusUpdate(BaseModel):
    status: ClipStatus
    file_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class DeviceCreate(BaseModel):
    label: str
    venue_id: Optional[int] = None
    camera_id: Optional[int] = None
    active: bool = True


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    venue_id: Optional[int]
    camera_id: Optional[int]
    token_prefix: str
    active: bool
    created_at: datetime
    token: Optional[str] = None  # only on create


class HealthOut(BaseModel):
    status: str
    service: str


class AdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    file_path: str
    venue_id: Optional[int]
    duration_sec: int
    placement: str = "bottom"
    sort_order: int
    active: bool
    created_at: datetime
    image_url: Optional[str] = None


class AdUpdate(BaseModel):
    title: Optional[str] = None
    venue_id: Optional[int] = None
    duration_sec: Optional[int] = None
    placement: Optional[Literal["top", "bottom"]] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None
