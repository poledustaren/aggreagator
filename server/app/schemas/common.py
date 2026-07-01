"""Общие enum'ы и утилиты для pydantic-схем."""
import enum


class ItemStatus(str, enum.Enum):
    inbox = "inbox"
    snoozed = "snoozed"
    done = "done"
    dismissed = "dismissed"


class ClassifiedBy(str, enum.Enum):
    rules = "rules"
    llm = "llm"
    manual = "manual"


class ProcessStatus(str, enum.Enum):
    open = "open"
    frozen = "frozen"
    closed = "closed"
