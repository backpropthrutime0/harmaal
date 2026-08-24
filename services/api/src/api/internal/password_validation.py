"""Password strength validation — gov-grade policy.

Ported as-is from avis_tools.

Rules:
  1. 12-128 characters
  2. At least one uppercase letter
  3. At least one lowercase letter
  4. At least one digit
  5. At least one special character
  6. Not a commonly guessed password
  7. Root word not a predictable dictionary word
  8. Cannot contain username (case-insensitive)
  9. Cannot contain email local part (case-insensitive, >=4 chars)
"""

from __future__ import annotations

import re

MIN_PASSWORD_LEN = 12
MAX_PASSWORD_LEN = 128

_COMMON_PASSWORDS: frozenset[str] = frozenset(
    {
        "password",
        "password1",
        "password12",
        "password123",
        "password1234",
        "password12345",
        "password123456",
        "passw0rd",
        "p@ssword",
        "p@ssw0rd",
        "123456789",
        "1234567890",
        "12345678901",
        "qwerty123",
        "qwerty1234",
        "qwertyuiop",
        "qwerty12345",
        "iloveyou",
        "iloveyou1",
        "iloveyou123",
        "admin1234",
        "admin123!",
        "admin@123",
        "admin@1234",
        "welcome1",
        "welcome123",
        "welcome@1",
        "monkey123",
        "dragon123",
        "dragon1234",
        "master123",
        "master1234",
        "sunshine1",
        "sunshine123",
        "princess1",
        "princess123",
        "football1",
        "football123",
        "superman1",
        "superman123",
        "batman123",
        "spiderman1",
        "letmein1",
        "letmein123",
        "trustno1",
        "trustno123",
        "baseball1",
        "baseball123",
        "michael1",
        "michael123",
        "shadow123",
        "shadow1234",
        "mustang1",
        "mustang123",
        "abc123456",
        "abc1234567",
        "charlie1",
        "charlie123",
        "donald123",
        "donald1234",
        "startrek1",
        "starwars1",
        "starwars123",
        "jessica1",
        "jessica123",
        "thomas123",
        "thomas1234",
        "hunter123",
        "hunter1234",
        "ranger123",
        "ranger1234",
        "maverick1",
        "maverick123",
        "harley123",
        "harley1234",
        "george123",
        "george1234",
        "jordan123",
        "jordan1234",
        "robert123",
        "robert1234",
        "cheese123",
        "cheese1234",
        "pepper123",
        "pepper1234",
        "killer123",
        "killer1234",
        "hannah123",
        "hannah1234",
        "summer123",
        "summer1234",
        "joshua123",
        "joshua1234",
        "andrew123",
        "andrew1234",
        "secret123",
        "secret1234",
        "chicken1",
        "chicken123",
        "winter123",
        "winter1234",
        "flower123",
        "flower1234",
        "compaq123",
        "compaq1234",
        "hello12345",
        "hello123456",
        "love12345",
        "love123456",
        "monkey1234",
        "dragon12345",
    }
)

_COMMON_ROOTS: frozenset[str] = frozenset(
    {
        "password",
        "qwerty",
        "monkey",
        "dragon",
        "master",
        "sunshine",
        "princess",
        "football",
        "superman",
        "batman",
        "spider",
        "letmein",
        "trustno",
        "baseball",
        "welcome",
        "shadow",
        "mustang",
        "charlie",
        "donald",
        "starwars",
        "startrek",
        "jessica",
        "thomas",
        "hunter",
        "ranger",
        "maverick",
        "harley",
        "george",
        "jordan",
        "robert",
        "cheese",
        "pepper",
        "killer",
        "hannah",
        "summer",
        "joshua",
        "andrew",
        "secret",
        "chicken",
        "winter",
        "flower",
        "hello",
        "admin",
        "login",
        "access",
        "pass",
        "test",
        "user",
        "root",
    }
)

_SPECIAL_CHARS_RE = re.compile(r"""[!@#$%^&*()\-_=+\[\]{}|;:,.<>?/\\'"~`]""")


def validate_password_strength(
    password: str,
    username: str | None = None,
    email: str | None = None,
) -> None:
    """Validate password against gov-grade strength rules.

    Raises ``ValueError`` with a user-facing message on the first failed rule.
    Returns ``None`` on success.
    """
    if len(password) < MIN_PASSWORD_LEN:
        msg = f"Password must be at least {MIN_PASSWORD_LEN} characters"
        raise ValueError(msg)
    if len(password) > MAX_PASSWORD_LEN:
        msg = f"Password must not exceed {MAX_PASSWORD_LEN} characters"
        raise ValueError(msg)
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one number")
    if not _SPECIAL_CHARS_RE.search(password):
        raise ValueError("Password must contain at least one special character (!@#$%...)")

    pw_lower = password.lower()
    if pw_lower in _COMMON_PASSWORDS:
        raise ValueError("Password is too common — choose something more unique")

    alpha_only = re.sub(r"[^a-z]", "", pw_lower)
    if any(root in alpha_only or root in pw_lower for root in _COMMON_ROOTS):
        raise ValueError("Password is too predictable — avoid common words with simple substitutions")

    if username and len(username) >= 3 and username.lower() in pw_lower:
        raise ValueError("Password must not contain your username")

    if email:
        local = email.split("@")[0].lower()
        if len(local) >= 4 and local in pw_lower:
            raise ValueError("Password must not contain your email address")
