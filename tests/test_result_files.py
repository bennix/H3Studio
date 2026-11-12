import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('h3_result_files_test', Path(__file__).parents[1] / 'comfyui_h3_reference_edit/result_files.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResultFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.output = root / 'output'
        self.output.mkdir()
        self.store = module.ResultFiles(self.output, root / 'trash')
        self.image = {'filename': 'test.png', 'subfolder': 'session', 'type': 'output'}
        self.file = self.output / 'session/test.png'
        self.file.parent.mkdir()
        self.file.write_bytes(b'test image bytes')

    def test_delete_and_restore_preserve_bytes_and_relative_path(self):
        item = self.store.trash(self.image)
        self.assertFalse(self.file.exists())
        self.assertEqual(self.store.items()[0]['image'], self.image)
        self.store.restore(item['token'])
        self.assertEqual(self.file.read_bytes(), b'test image bytes')
        self.assertEqual(self.store.items(), [])

    def test_result_listing_uses_files_and_tracks_delete_restore(self):
        self.assertEqual(self.store.results()[0]['image'], self.image)
        item = self.store.trash(self.image)
        self.assertEqual(self.store.results(), [])
        self.store.restore(item['token'])
        self.assertEqual(self.store.results()[0]['image'], self.image)

    def test_restore_never_overwrites_a_new_file(self):
        item = self.store.trash(self.image)
        self.file.write_bytes(b'new image')
        with self.assertRaises(FileExistsError): self.store.restore(item['token'])
        self.assertEqual(self.file.read_bytes(), b'new image')
        self.assertEqual(len(self.store.items()), 1)

    def test_paths_are_confined_to_output(self):
        for image in [dict(self.image, filename='../test.png'), dict(self.image, subfolder='../../outside'), dict(self.image, type='input')]:
            with self.assertRaises(ValueError): self.store.trash(image)
        self.assertTrue(self.file.exists())


if __name__ == '__main__': unittest.main()
