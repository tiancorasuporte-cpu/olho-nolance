from app.auth import parse_venue_ids
from app.models import User
from app.schemas import UserOut


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        name=user.name,
        role=user.role,  # type: ignore[arg-type]
        active=user.active,
        venue_ids=parse_venue_ids(user.venue_ids),
    )
