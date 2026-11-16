"""Пересчёт долей оффер-потока (правило #8) — чистая функция."""

from app.services.shares import recompute


def offers(*pairs: tuple[int, int]) -> list[dict]:
    return [{"offer_id": offer_id, "share": share} for offer_id, share in pairs]


def shares(result: list[dict]) -> list[int]:
    return [o["share"] for o in result]


def test_add_to_three_gives_four_by_25():
    assert shares(recompute(offers((1, 33), (2, 33), (3, 34), (4, 0)), pinned=set())) == [25, 25, 25, 25]


def test_add_to_four_gives_five_by_20():
    assert shares(recompute(offers((1, 25), (2, 25), (3, 25), (4, 25), (5, 0)), pinned=set())) == [20] * 5


def test_remainder_goes_plus_one_to_last_in_stream_order():
    # 25×4 → Remove → доли 34/33/33; по правилу #8 +1 получает последний по порядку: 33/33/34.
    assert shares(recompute(offers((2, 25), (3, 25), (4, 25)), pinned=set())) == [33, 33, 34]
    assert shares(recompute(offers((1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (7, 0)), pinned=set())) == [
        14, 14, 14, 14, 14, 15, 15,
    ]


def test_pinned_share_is_kept_and_others_split_the_rest():
    # 25 (закр.)/25 → Bring back → 25/37/38.
    assert shares(recompute(offers((1, 25), (2, 25), (3, 0)), pinned={1})) == [25, 37, 38]


def test_remainder_skips_pinned_even_if_it_is_last():
    assert shares(recompute(offers((1, 0), (2, 0), (3, 10)), pinned={3})) == [45, 45, 10]
    assert shares(recompute(offers((1, 0), (2, 0), (3, 0), (4, 11)), pinned={4})) == [29, 30, 30, 11]


def test_first_offer_of_empty_stream_gets_100():
    assert recompute(offers((7, 0)), pinned=set()) == [{"offer_id": 7, "share": 100}]


def test_all_pinned_left_as_is():
    assert shares(recompute(offers((1, 60), (2, 40)), pinned={1, 2})) == [60, 40]


def test_order_and_input_are_preserved():
    source = offers((5, 0), (3, 0), (9, 0))
    result = recompute(source, pinned=set())
    assert [o["offer_id"] for o in result] == [5, 3, 9]
    assert shares(source) == [0, 0, 0]
