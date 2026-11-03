"""User polls from the composer: input checks for POST /api/channels/<id>/polls."""
import pytest

from routes.messages import PollError, clean_poll


def test_keeps_question_and_distinct_answers_in_order():
    q, opts = clean_poll({'question': '  Lunch? ', 'options': ['Pizza', ' pizza ', 'Biryani', '', 'Salad']})
    assert q == 'Lunch?'
    assert opts == ['Pizza', 'Biryani', 'Salad']


@pytest.mark.parametrize('body, message', [
    ({'question': '', 'options': ['a', 'b']}, 'Write a question'),
    ({'question': 'Q', 'options': ['a', 'A']}, 'at least 2'),
    ({'question': 'Q', 'options': [str(i) for i in range(7)]}, 'at most 6'),
    ({'question': 'Q' * 201, 'options': ['a', 'b']}, 'at most 200'),
    ({'question': 'Q', 'options': ['x' * 81, 'b']}, 'at most 80'),
    ({'question': 'Q', 'options': 'a,b'}, 'must be a list'),
])
def test_rejects_bad_polls(body, message):
    with pytest.raises(PollError, match=message):
        clean_poll(body)


def test_handles_a_missing_body():
    with pytest.raises(PollError):
        clean_poll(None)
