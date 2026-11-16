"""Пересчёт долей оффер-потока (правило #8)."""


def recompute(offers: list[dict], pinned: set[int]) -> list[dict]:
    """Делит между незакреплёнными офферами то, что осталось от 100 после закреплённых.

    `offers` — активные офферы потока по порядку, `[{offer_id, share}]`; закреплённые сохраняют
    свою долю. Каждый незакреплённый получает `floor(R/n)`, остаток `R mod n` — по +1 последним
    по порядку незакреплённым. Исходный список не меняется.
    """
    free = [o["offer_id"] for o in offers if o["offer_id"] not in pinned]
    if not free:
        return [dict(o) for o in offers]
    rest = 100 - sum(o["share"] for o in offers if o["offer_id"] in pinned)
    base, extra = divmod(rest, len(free))
    bonus = set(free[len(free) - extra :]) if extra else set()
    return [
        dict(o) if o["offer_id"] in pinned else {**o, "share": base + (1 if o["offer_id"] in bonus else 0)}
        for o in offers
    ]
