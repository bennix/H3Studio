"""Balance calibration must never block remote startup."""
import ast
import unittest
from pathlib import Path

class DeploymentBalanceTest(unittest.TestCase):
    def test_startup_only_prompts_for_notification_email(self):
        source = Path('H3Studio/Resources/colab_deploy.py').read_text()
        tree = ast.parse(source)
        prompts = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'input']
        self.assertEqual(len(prompts), 1)
        self.assertIn('Gmail', prompts[0].args[0].value)
        self.assertNotRegex(source, r'[\w.+-]+@gmail\.com')
        self.assertNotRegex(source, r'https://colab\.research\.google\.com/drive/[A-Za-z0-9_-]+')
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'exec':
                compile(node.args[0].value, 'embedded_install_stage', 'exec')
