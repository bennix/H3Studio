import ast
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class MailPasswordTest(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(Path('comfy_login_email.py').read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'get_h3_gmail_password')
        self.context = {'print': Mock()}
        exec(compile(ast.Module(body=[function], type_ignores=[]), 'mail_password', 'exec'), self.context)

    def test_existing_runtime_password_is_reused(self):
        self.context['H3_GMAIL_APP_PASSWORD'] = 'test-only-password'
        self.assertEqual(self.context['get_h3_gmail_password'](), 'test-only-password')

    def test_secret_is_loaded_once_and_cached_without_output(self):
        get = Mock(return_value='test only password')
        colab = types.ModuleType('google.colab')
        colab.userdata = types.SimpleNamespace(get=get)
        with patch.dict('sys.modules', {'google.colab': colab}):
            self.assertEqual(self.context['get_h3_gmail_password'](), 'testonlypassword')
            self.assertEqual(self.context['get_h3_gmail_password'](), 'testonlypassword')
        get.assert_called_once_with('COMFY_GMAIL_APP_PASSWORD')
        self.context['print'].assert_not_called()

    def test_missing_secret_prompts_hidden_input_and_generation_link(self):
        colab = types.ModuleType('google.colab')
        colab.userdata = types.SimpleNamespace(get=Mock(side_effect=RuntimeError('unavailable')))
        display = types.ModuleType('IPython.display')
        display.HTML = lambda value: value
        display.display = Mock()
        getpass = types.ModuleType('getpass')
        getpass.getpass = Mock(return_value='test-only-password')
        with patch.dict('sys.modules', {'google.colab': colab, 'IPython.display': display, 'getpass': getpass}):
            self.assertEqual(self.context['get_h3_gmail_password'](), 'test-only-password')
        self.assertIn('https://myaccount.google.com/apppasswords', display.display.call_args.args[0])
        getpass.getpass.assert_called_once()
        self.assertNotIn('test-only-password', str(self.context['print'].call_args_list))
