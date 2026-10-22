from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import get_settings
from app.db import Base, SessionLocal, column_exists, engine, index_exists
from app.models import User


def ensure_schema() -> None:
    """Create tables and apply idempotent column/index upgrades (automacao-omie style)."""
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        if not column_exists(conn, "users", "venue_ids"):
            conn.exec_driver_sql("alter table users add column venue_ids text")
        if not column_exists(conn, "venues", "city"):
            conn.exec_driver_sql("alter table venues add column city varchar(120)")
        if not column_exists(conn, "ads", "placement"):
            conn.exec_driver_sql("alter table ads add column placement varchar(10) not null default 'bottom'")
        if not column_exists(conn, "ads", "camera_id"):
            conn.exec_driver_sql("alter table ads add column camera_id integer references cameras(id)")
            conn.exec_driver_sql("create index if not exists ix_ads_camera_id on ads (camera_id)")
        if not column_exists(conn, "clips", "error_message"):
            conn.exec_driver_sql("alter table clips add column error_message text")
        if not index_exists(conn, "ix_clips_created_at"):
            conn.exec_driver_sql("create index if not exists ix_clips_created_at on clips (created_at)")
        if not index_exists(conn, "ix_clips_status"):
            conn.exec_driver_sql("create index if not exists ix_clips_status on clips (status)")
        if not column_exists(conn, "users", "email"):
            conn.exec_driver_sql("alter table users add column email varchar(255)")
            conn.exec_driver_sql("create unique index if not exists ix_users_email on users (email)")
        if not column_exists(conn, "users", "email_verified"):
            conn.exec_driver_sql(
                "alter table users add column email_verified boolean not null default false"
            )

    seed_superadmin()


def seed_superadmin() -> None:
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.superadmin_user).first()
        if existing:
            return
        user = User(
            username=settings.superadmin_user,
            password_hash=hash_password(settings.superadmin_password),
            name="Super Admin",
            role="superadmin",
            active=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()
