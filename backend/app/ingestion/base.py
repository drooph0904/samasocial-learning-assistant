from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Chunk:
    content: str
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedSource:
    title: str
    # segments: list of (text, metadata) emitted by a parser before chunking
    segments: list[tuple[str, dict]]


class Parser(Protocol):
    def parse(self, ref: str) -> ParsedSource: ...
