"""Custom exception hierarchy for the telegram-bots dispatcher.

Caught by `handlers/errors.py` global error handler and translated to
user-facing messages in the relevant locale.
"""

from __future__ import annotations


class BotError(Exception):
    """Base class for all Smart Restaurant Campus bot exceptions."""


class NotLinkedError(BotError):
    """Raised when a handler requires a linked platform user but none exists."""


class RoleNotAllowedError(BotError):
    """Raised when a user lacks the required role for a command."""

    def __init__(self, required: set[str] | None = None) -> None:
        self.required = required or set()
        super().__init__(f"Required role(s): {self.required or 'any-linked-user'}")


class LaravelUnavailableError(BotError):
    """Raised when the Laravel API is unreachable or returns 5xx after retries."""


class FeatureDisabledError(BotError):
    """Raised when a command is disabled for this bot via metadata flags."""
