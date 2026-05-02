"""
conftest.py — UNIT_TESTING
Sets up sys.path so all tests can import from the Backend package root.
"""
import sys
import os

# Add Backend root to path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
