"""Acceptance harness must support old and current real host constructors."""
from types import SimpleNamespace
import unittest

from scripts import validate_prompt_diagnostics, validate_txt_execution


class AcceptanceHostCompatibilityTests(unittest.TestCase):
    def test_old_host_does_not_receive_new_asset_manager_argument(self):
        class OldExecutor:
            def __init__(self, server, cache_type=False, cache_args=None):
                self.server, self.cache_type, self.cache_args = server, cache_type, cache_args

        host = SimpleNamespace(PromptExecutor=OldExecutor, CacheType=SimpleNamespace(CLASSIC="classic"))
        server = object()
        for script in (validate_txt_execution, validate_prompt_diagnostics):
            with self.subTest(script=script.__name__):
                executor = script.create_executor(host, server)
                self.assertIs(executor.server, server)
                self.assertEqual(executor.cache_type, "classic")
                self.assertEqual(executor.cache_args, {"ram": 0, "ram_inactive": 0})

    def test_current_host_receives_disabled_asset_manager(self):
        class CurrentExecutor:
            def __init__(self, server, cache_type=False, cache_args=None, asset_manager=None):
                self.server, self.asset_manager = server, asset_manager

        host = SimpleNamespace(PromptExecutor=CurrentExecutor, CacheType=SimpleNamespace(CLASSIC="classic"))
        server = object()
        for script in (validate_txt_execution, validate_prompt_diagnostics):
            with self.subTest(script=script.__name__):
                executor = script.create_executor(host, server)
                self.assertIs(executor.server, server)
                self.assertIsNotNone(executor.asset_manager)
                self.assertFalse(executor.asset_manager.enabled)
