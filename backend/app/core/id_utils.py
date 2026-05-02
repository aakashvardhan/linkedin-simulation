def format_prefixed_id(prefix: str, numeric_id: int) -> str:
    return f"{prefix}_{numeric_id}"


def parse_prefixed_id(value: str | int | None, prefix: str) -> int:
    if value is None:
        raise ValueError(f'{prefix} id is required')
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if text.isdigit():
        return int(text)
    expected = f'{prefix}_'
    if text.startswith(expected):
        suffix = text[len(expected):]
        if suffix.isdigit():
            return int(suffix)
    raise ValueError(f'invalid {prefix} id: {value}')
