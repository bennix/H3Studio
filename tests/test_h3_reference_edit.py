import importlib.util
import itertools
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


class ReferenceRoutingTest(unittest.TestCase):
    def setUp(self):
        self.native = Mock()
        self.native.execute.return_value = types.SimpleNamespace(result=('positive', 'latent'))
        fake = types.ModuleType('comfy_extras.nodes_minimax_h3')
        fake.MiniMaxH3ImageConditioning = self.native
        path = Path(__file__).parents[1] / 'comfyui_h3_reference_edit/__init__.py'
        spec = importlib.util.spec_from_file_location('h3_edit_test', path)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'comfy_extras.nodes_minimax_h3': fake, 'h3_edit_test': module, 'h3_edit_test.result_routes': types.ModuleType('h3_edit_test.result_routes')}):
            spec.loader.exec_module(module)
        self.node = module.H3ReferenceEdit()
        self.roles = ['face', 'style', 'clothing', 'background']

    def test_every_reference_combination_uses_contiguous_matching_picture_labels(self):
        for has_base, *flags in itertools.product([False, True], repeat=5):
            values = {}
            expected = ['base'] if has_base else []
            for role, enabled in zip(self.roles, flags):
                values[role + '_enabled'] = enabled
                values[role + '_reference'] = role
                if enabled:
                    expected.append(role)
            result = self.node.encode('clip', 'vae', 'A natural photograph.', 2048, 2048, base_image='base' if has_base else None, **values)
            kwargs = self.native.execute.call_args.kwargs
            self.assertEqual(list(kwargs['images'].values()), expected)
            self.assertEqual(list(kwargs['images']), [f'image_{i+1}' for i in range(len(expected))])
            for number in range(1, len(expected) + 1):
                self.assertIn(f'<Picture {number}>', result[2])
            self.assertNotIn(f'<Picture {len(expected)+1}>', result[2])

    def test_disabled_references_do_not_trigger_lazy_loading(self):
        self.assertEqual(self.node.check_lazy_status(face_enabled=False, background_enabled=True, background_reference=None), ['background_reference'])

    def test_generation_without_base_uses_reference_as_picture_one(self):
        self.node.encode('clip', 'vae', 'A portrait in a garden.', 2048, 2048, face_enabled=True, face_reference='face')
        kwargs = self.native.execute.call_args.kwargs
        self.assertEqual(kwargs['images'], {'image_1': 'face'})
        self.assertNotIn('base image to edit', kwargs['prompt'])

    def test_text_to_image_without_attachments(self):
        self.node.encode('clip', 'vae', 'A red fox in a garden.', 2048, 2048)
        self.assertEqual(self.native.execute.call_args.kwargs['images'], {})

    def test_enabled_missing_reference_has_actionable_error(self):
        with self.assertRaisesRegex(ValueError, '请上传'):
            self.node.encode('clip', 'vae', '', 2048, 2048, base_image='base', face_enabled=True)


if __name__ == '__main__':
    unittest.main()
