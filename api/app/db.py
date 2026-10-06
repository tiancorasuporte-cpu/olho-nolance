from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def table_exists(conn, name: str) -> bool:
    row = conn.execute(
        text(
            """
            select exists (
              select 1 from information_schema.tables
              where table_schema = 'public' and table_name = :name
            )
            """
        ),
        {"name": name},
    ).scalar()
    return bool(row)


def column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            """
            select exists (
              select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name = :table
                and column_name = :column
            )
            """
        ),
        {"table": table, "column": column},
    ).scalar()
    return bool(row)


def index_exists(conn, name: str) -> bool:
    row = conn.execute(
        text(
            """
            select exists (
              select 1 from pg_indexes
              where schemaname = 'public' and indexname = :name
            )
            """
        ),
        {"name": name},
    ).scalar()
    return bool(row)
