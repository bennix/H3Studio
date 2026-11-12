import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch


class DeploymentGPUTest(unittest.TestCase):
    def setUp(self):
        source = Path('H3Studio/Resources/colab_deploy.py').read_text()
        self.preflight = source[:source.index('from google.colab import userdata')]

    def test_cpu_has_actionable_error_before_email_or_download(self):
        with patch('shutil.which', return_value=None), patch('subprocess.check_output') as run:
            with self.assertRaisesRegex(RuntimeError, '更改运行时类型.*L4 GPU'):
                exec(self.preflight, {})
            run.assert_not_called()

    def test_gpu_driver_failure_has_actionable_error(self):
        with patch('shutil.which', return_value='/usr/bin/nvidia-smi'), patch('subprocess.check_output', side_effect=subprocess.CalledProcessError(1, 'nvidia-smi')):
            with self.assertRaisesRegex(RuntimeError, 'GPU 驱动尚未就绪'):
                exec(self.preflight, {})

    def test_available_gpu_passes(self):
        with patch('shutil.which', return_value='/usr/bin/nvidia-smi'), patch('subprocess.check_output', return_value='NVIDIA L4, 23034 MiB'):
            exec(self.preflight, {'print': lambda *args, **kwargs: None})


if __name__ == '__main__':
    unittest.main()
