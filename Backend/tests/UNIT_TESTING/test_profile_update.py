"""Profile settings: text limits, banner colour and image checks for PUT /api/user/profile."""
import io

import pytest
from werkzeug.datastructures import FileStorage

from routes.auth import ProfileError, clean_profile_text, save_profile_image


def test_trims_and_accepts_valid_values():
    assert clean_profile_text('  Sarah ', '  Hi there ', '#5865F2') == ('Sarah', 'Hi there', '#5865F2')
    assert clean_profile_text(None, None, None) == (None, None, None)
    assert clean_profile_text(None, '', '') == (None, '', '')  # clearing bio / colour


@pytest.mark.parametrize('args, message', [
    (('   ', None, None), 'cannot be empty'),
    (('x' * 33, None, None), 'at most 32'),
    ((None, 'y' * 191, None), 'at most 190'),
    ((None, None, 'blue'), 'look like'),
    ((None, None, '#12345'), 'look like'),
])
def test_rejects_bad_values(args, message):
    with pytest.raises(ProfileError, match=message):
        clean_profile_text(*args)


def test_image_checks_type_and_size(tmp_path, monkeypatch):
    bad = FileStorage(stream=io.BytesIO(b'x'), filename='notes.txt')
    with pytest.raises(ProfileError, match='PNG, JPG'):
        save_profile_image(bad, 'banners', 1024)
    big = FileStorage(stream=io.BytesIO(b'x' * 2048), filename='big.png')
    with pytest.raises(ProfileError, match='under'):
        save_profile_image(big, 'banners', 1024)
